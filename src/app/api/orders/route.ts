import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db, generateCode } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { str, isEmail, isPhone, int } from "@/lib/validation";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { bad } from "@/lib/api-helpers";
import { extractOrderId, extractAmount, normalizeOrderId, runOcrOnBuffer } from "@/lib/ocr";
import { sanitizeText, sanitizePhone } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";
import {
  validateOrderSubmission,
  makeDecision,
  checkDuplicateOrderInReimbursements,
  isScreenshotUsedByAnotherClaim,
} from "@/lib/ocr-validation";
import {
  validateOrderIdFormat,
  assessIdentityRisk,
  checkSubmissionLimits,
} from "@/lib/fraud";
import { isStoredUploadUrl, uploadFilePath } from "@/lib/storage";
import { claimDealSlot } from "@/lib/deal-slots";

export const dynamic = "force-dynamic";

const UPLOAD_URL_RE = /^\/(?:api\/files|uploads)\/[A-Za-z0-9._-]+$/;

type UploadRow = { user_id: number | null; ocr_status: string; ocr_order_id: string };

/**
 * Make sure a proof screenshot exists on this server and has been OCR'd.
 *
 * Previously validation trusted whatever URL the client sent, and OCR only ran
 * when the client also sent `ocr=true`. An attacker could upload with
 * `ocr=false`, skip OCR entirely, and still have the order auto-approved.
 */
async function ensureUploadOcr(
  url: string,
  userId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = db
    .prepare("SELECT user_id, ocr_status, ocr_order_id FROM uploads WHERE url = ?")
    .get(url) as UploadRow | undefined;

  if (!row) {
    return { ok: false, error: "That screenshot was not uploaded here. Please upload it again." };
  }
  if (row.user_id != null && row.user_id !== userId) {
    return { ok: false, error: "That screenshot belongs to a different account." };
  }
  if (row.ocr_status === "done") return { ok: true };

  const filePath = uploadFilePath(url);
  if (!filePath) {
    return { ok: false, error: "The screenshot file is missing on the server. Please upload it again." };
  }

  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  const ocr = await runOcrOnBuffer(buf, mime);
  const text = ocr.ok ? ocr.text : "";

  db.prepare(
    `UPDATE uploads
        SET ocr_text = ?, ocr_order_id = ?, ocr_amount = ?, ocr_date = ?, ocr_status = ?
      WHERE url = ?`
  ).run(
    text,
    ocr.ok ? extractOrderId(text) || "" : "",
    ocr.ok ? extractAmount(text) || 0 : 0,
    ocr.ok ? ocr.extractedDate || "" : "",
    ocr.ok ? "done" : "failed",
    url
  );

  return { ok: true };
}

export async function POST(req: Request) {
  // CSRF protection
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = (await getCsrfTokenFromCookies());
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  // Order proofs must belong to an account. Guest submissions produced rows
  // nobody could track or claim a refund for.
  const session = await getSession();
  if (!session) {
    return bad("Please log in to submit your order proof. Creating a free account takes 30 seconds.", 401);
  }

  // Rate limiting: per account plus a looser per-IP ceiling. Keying only on
  // X-Forwarded-For let a caller rotate the header and submit without limit.
  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("orderSubmit", `user:${session.userId}`);
  const rlIp = await applyRateLimit("orderIp", ip);
  if (!rl.ok || !rlIp.ok) {
    const retryAfter = Math.max(rl.retryAfter, rlIp.retryAfter);
    return NextResponse.json(
      { error: `Too many submissions. Try again in ${retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid request JSON.");
  }

  const dealId = int(body.deal_id, 0, 1_000_000_000, 0);
  const productCode = sanitizeText(str(body.product_code, 40), 40).toUpperCase();
  const externalOrderId = sanitizeText(str(body.external_order_id, 60), 60).trim();
  const reviewerName = sanitizeText(str(body.reviewer_name, 100), 100).trim();
  const fullName = sanitizeText(str(body.full_name, 100), 100).trim();
  const email = sanitizeText(str(body.email, 254), 254).toLowerCase().trim();
  const phone = sanitizePhone(str(body.phone, 20));
  const platform = sanitizeText(str(body.platform, 40), 40) || "Amazon";
  const dealType = sanitizeText(str(body.deal_type, 60), 60) || "Flat Refund";
  const mediatorName = sanitizeText(str(body.mediator_name, 80), 80) || "Direct";
  const orderDate = sanitizeText(str(body.order_date, 30), 30) || new Date().toISOString().split("T")[0];
  const orderScreenshotUrl = sanitizeText(str(body.order_screenshot_url, 500), 500);
  const priceScreenshotUrl = sanitizeText(str(body.price_screenshot_url, 500), 500);
  const address = sanitizeText(str(body.address, 300), 300);
  const city = sanitizeText(str(body.city, 60), 60);
  const state = sanitizeText(str(body.state, 60), 60);
  const pincode = sanitizeText(str(body.pincode, 10), 10);
  const variant = sanitizeText(str(body.variant, 80), 80);
  const quantity = int(body.quantity, 1, 10, 1);
  const unitPrice = typeof body.unit_price === "number" ? body.unit_price : parseFloat(String(body.unit_price || 0)) || 0;
  const notes = sanitizeText(str(body.notes, 500), 500);

  // Get click_id from body (passed from frontend after click tracking)
  const clickId = sanitizeText(str(body.click_id, 60), 60).trim();

  // Get device fingerprint from body
  const deviceFingerprint = sanitizeText(str(body.device_fingerprint, 128), 128).trim();

  // Validation
  if (fullName.length < 2) return bad("Please enter your full name.");
  if (!isEmail(email)) return bad("Please enter a valid email address.");
  if (!isPhone(phone)) return bad("Please enter a valid 10-digit phone / WhatsApp number.");
  if (!externalOrderId) return bad("Please enter the Platform Order ID (e.g. Amazon or Flipkart Order ID).");
  if (!reviewerName) return bad("Please enter your Reviewer Profile Name.");

  // Check if deal exists
  let deal:
    | {
        id: number;
        product_code: string;
        title: string;
        price_sale: number;
        refund_amount: number;
        total_slots: number;
        claimed_slots: number;
        stock: number;
        active: number;
        approval_status: string;
        platform: string;
        deal_type: string;
      }
    | undefined;

  if (dealId > 0) {
    deal = db.prepare("SELECT * FROM deals WHERE id = ?").get(dealId) as typeof deal;
  } else if (productCode) {
    deal = db.prepare("SELECT * FROM deals WHERE product_code = ?").get(productCode) as typeof deal;
  }

  if (deal && (!deal.active || deal.approval_status !== "approved")) {
    return bad("This campaign is currently inactive.", 400);
  }

  // A campaign must resolve. Older databases were created with a NOT NULL
  // deal_id column, so inserting an unresolved campaign used to raise an
  // unhandled SQLITE_CONSTRAINT error (HTTP 500) instead of a clear message.
  if (!deal) {
    return bad(
      dealId > 0
        ? "That campaign no longer exists. Please reload the page and pick a current campaign."
        : "Please select a campaign from the dropdown before submitting.",
      400
    );
  }

  // Fabricated order IDs are cheap to type and expensive to chase: reject the
  // ones that cannot be real, and flag ones that don't match the platform's
  // shape (warning only — a wrong regex must never block a real customer).
  const idVerdict = validateOrderIdFormat(externalOrderId, deal.platform || platform);
  if (idVerdict.severity === "bad") {
    return bad(
      `${idVerdict.reason}. Please copy the Order ID exactly as shown on your order confirmation.`,
      400
    );
  }

  // Check available slots if deal exists
  if (deal.total_slots > 0 && deal.claimed_slots >= deal.total_slots) {
    return bad("Slots for this campaign are currently full. Please try another deal or contact support.", 400);
  }

  // Check duplicate external order ID (race-condition safe with unique index)
  const existingOrder = db
    .prepare("SELECT id, order_code FROM orders WHERE external_order_id = ? AND external_order_id != ''")
    .get(externalOrderId) as { id: number; order_code: string } | undefined;

  if (existingOrder) {
    // Never disclose the other customer's tracking code: returning it would
    // hand an attacker a working lookup key for someone else's order.
    return bad("This order has already been submitted. Please track it with your Order ID instead.", 409);
  }

  // Only screenshots uploaded through this server may be attached. This also
  // forces OCR to run even when the client omitted the `ocr` flag.
  const checkedUploads = new Set<string>();
  for (const [label, url] of [
    ["order", orderScreenshotUrl],
    ["price", priceScreenshotUrl],
  ] as const) {
    if (!url) continue;
    if (!UPLOAD_URL_RE.test(url)) {
      return bad(`The ${label} screenshot link is invalid. Please upload the image again.`);
    }
    // The same image is often attached as both proofs; OCR it only once.
    if (checkedUploads.has(url)) continue;
    checkedUploads.add(url);
    const ensured = await ensureUploadOcr(url, session.userId);
    if (!ensured.ok) return bad(ensured.error);
  }

  // --- Fraud gates that do not depend on OCR ---

  // Velocity caps persisted in the database, so they survive deploys (the
  // in-memory rate limiter does not).
  const limits = checkSubmissionLimits(session.userId, deviceFingerprint || undefined);
  if (!limits.ok) return bad(limits.reason, 429);

  // An order ID already tied to a refund claim cannot be "ordered" again.
  if (checkDuplicateOrderInReimbursements(externalOrderId).duplicate) {
    return bad(
      "This Order ID has already been used in a refund claim. Please contact support if you think this is a mistake.",
      409
    );
  }

  // A screenshot already used to claim a refund on another order cannot be
  // recycled as proof for a new purchase.
  for (const url of [orderScreenshotUrl, priceScreenshotUrl]) {
    if (url && isScreenshotUsedByAnotherClaim(url, externalOrderId)) {
      return bad(
        "This screenshot is already attached to a refund claim. Please upload a fresh screenshot for this order.",
        400
      );
    }
  }

  // The campaign price is authoritative. The client used to send any unit_price,
  // which let a buyer inflate the order total (and therefore the refund) or
  // claim a different product entirely.
  const campaignPrice = Number(deal.price_sale) || 0;
  const clientPrice = unitPrice > 0 ? unitPrice : 0;
  const priceMismatch =
    campaignPrice > 0 &&
    clientPrice > 0 &&
    Math.abs(clientPrice - campaignPrice) > Math.max(1, campaignPrice * 0.05);
  const finalUnitPrice = campaignPrice > 0 ? campaignPrice : clientPrice;
  const total = Math.round(finalUnitPrice * quantity * 100) / 100;
  const orderCode = generateCode("BP");

  // Run full OCR validation pipeline with fraud scoring
  const validation = await validateOrderSubmission(
    orderScreenshotUrl,
    priceScreenshotUrl,
    externalOrderId,
    total,
    orderDate,
    clickId || undefined,
    session.userId,
    ip,
    deviceFingerprint || undefined
  );

  // Cross-account and metadata risk can only be judged after the basic checks,
  // so fold them into the score and re-run the decision. Without this an order
  // from a freshly created account on a shared device could still auto-approve.
  const identityRisk = assessIdentityRisk({
    userId: session.userId,
    phone,
    deviceFingerprint: deviceFingerprint || undefined,
    ip,
    address,
    pincode,
    reviewerName,
  });
  const extraPoints =
    identityRisk.points +
    (priceMismatch ? 10 : 0) +
    (idVerdict.severity === "warn" ? 10 : 0);
  if (extraPoints > 0) {
    validation.fraudScore.score = Math.min(100, validation.fraudScore.score + extraPoints);
    if (priceMismatch) {
      validation.fraudScore.reasons.push(
        `Submitted price ₹${clientPrice} differs from campaign price ₹${campaignPrice}`
      );
    }
    if (idVerdict.severity === "warn" && idVerdict.reason) {
      validation.fraudScore.reasons.push(idVerdict.reason);
    }
    validation.fraudScore.reasons.push(...identityRisk.reasons);
    validation.decision = makeDecision(validation.ocrValidation, validation.fraudScore);
  }

  // Reject if validation fails
  if (validation.decision.action === "reject") {
    // After the duplicate-check fix this is the only remaining reject path:
    // the screenshot was already used on a previous order. The generic
    // "our team will review it" text was misleading because nothing is saved.
    console.warn(
      `[orders] rejected external_order_id=${externalOrderId} ip=${ip} reason=${validation.decision.reason}`
    );
    return bad(
      "This screenshot has already been used for another order submission. Please upload a fresh screenshot of this order.",
      400
    );
  }

  // If OCR read an Order ID from the screenshot, it must be the one typed in
  // the form. Auto-fill makes these match for genuine users; a mismatch means
  // the proof belongs to a different purchase.
  if (orderScreenshotUrl) {
    const proof = db
      .prepare("SELECT ocr_order_id FROM uploads WHERE url = ?")
      .get(orderScreenshotUrl) as { ocr_order_id: string } | undefined;
    const extracted = proof?.ocr_order_id || "";
    if (extracted && normalizeOrderId(extracted) !== normalizeOrderId(externalOrderId)) {
      return bad(
        `The Order ID on your screenshot (${extracted}) does not match the Order ID you entered (${externalOrderId}). Please check both and try again.`,
        400
      );
    }
  }

  // Store fraud score and validation details
  const fraudScore = validation.fraudScore.score;
  const validationScore = validation.ocrValidation.score;
  const validationDetails = JSON.stringify({
    ocrValidation: validation.ocrValidation,
    fraudScore: validation.fraudScore,
    decision: validation.decision,
  });

  const targetDealId = deal.id;
  const targetProductCode = deal.product_code || productCode;
  const targetPlatform = deal.platform || platform;
  const targetDealType = deal.deal_type || dealType;

  // Extract OCR results from validation
  const orderUpload = isStoredUploadUrl(orderScreenshotUrl)
    ? db.prepare("SELECT ocr_order_id, ocr_amount FROM uploads WHERE url = ?").get(orderScreenshotUrl)
    : null;
  const ocrExtractedId = (orderUpload as any)?.ocr_order_id || "";
  const ocrAmount = (orderUpload as any)?.ocr_amount || 0;
  const ocrOrderMatch = validation.ocrValidation.details.orderIdMatch ? 1 : 0;
  const ocrAmountMatch = validation.ocrValidation.details.amountMatch ? 1 : 0;

  const insertStmt = db.prepare(`
    INSERT INTO orders (
      order_code, external_order_id, product_code, deal_id, user_id,
      click_id, reviewer_name, full_name, email, phone, platform,
      deal_type, mediator_name, order_date, address, city,
      state, pincode, variant, quantity, notes,
      unit_price, total, order_screenshot_url, price_screenshot_url,
      ocr_order_id, ocr_order_match, ocr_amount, ocr_amount_match,
      device_fingerprint, ip, fraud_score, validation_score, validation_details, status
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  // Claim the campaign slot and write the order in one transaction, so two
  // concurrent submissions cannot both take the last slot.
  const submitOrder = db.transaction(() => {
    if (targetDealId && !claimDealSlot(targetDealId)) {
      throw new Error("SLOTS_FULL");
    }
    return insertStmt.run(
      orderCode,
      externalOrderId,
      targetProductCode,
      targetDealId,
      session.userId,
      clickId || null,
      reviewerName,
      fullName,
      email,
      phone,
      targetPlatform,
      targetDealType,
      mediatorName,
      orderDate,
      address,
      city,
      state,
      pincode,
      variant,
      quantity,
      notes,
      finalUnitPrice,
      total,
      orderScreenshotUrl,
      priceScreenshotUrl,
      ocrExtractedId,
      ocrOrderMatch,
      ocrAmount,
      ocrAmountMatch,
      deviceFingerprint,
      ip,
      fraudScore,
      validationScore,
      validationDetails,
      "confirmed" // Always auto-accept on submission; refund claim processing handles order-refund matching via OCR
    );
  });

  let info;
  try {
    info = submitOrder();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "SLOTS_FULL") {
      // The advisory check above raced with another submission.
      return bad("Slots for this campaign are currently full. Please try another deal or contact support.", 400);
    }
    // click_id is a foreign key into click_tracking. A stale or fabricated value
    // must not surface as a 500.
    if (msg.includes("FOREIGN KEY")) {
      return bad("Invalid click tracking reference. Please reload the page and try again.", 400);
    }
    if (msg.includes("UNIQUE")) {
      return bad("This order has already been submitted. Please track it instead of resubmitting.", 409);
    }
    console.error("[orders] insert failed:", msg);
    return bad("We could not save your submission. Please try again.", 500);
  }

  // Record device fingerprint
  if (deviceFingerprint) {
    try {
      db.prepare(`
        INSERT INTO device_fingerprints (fingerprint, user_id, order_count)
        VALUES (?, ?, 1)
        ON CONFLICT(fingerprint) DO UPDATE SET
          order_count = order_count + 1,
          last_seen_at = datetime('now'),
          user_id = COALESCE(user_id, excluded.user_id)
      `).run(deviceFingerprint, session.userId);
    } catch {
      // Ignore
    }
  }

  return NextResponse.json({
    ok: true,
    order_code: orderCode,
    order_id: Number(info.lastInsertRowid),
    external_order_id: externalOrderId,
    total,
    ocr_match: ocrOrderMatch,
    ocr_amount_match: ocrAmountMatch,
    ocr_extracted_id: ocrExtractedId,
    ocr_extracted_amount: ocrAmount,
    validation_status: validation.decision.action,
    validation_reason: validation.decision.reason,
    message: "Order confirmed! Track your order status using your Order Code.",
  });
}