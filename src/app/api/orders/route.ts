import { NextResponse } from "next/server";
import { db, generateCode } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { str, isEmail, isPhone, int } from "@/lib/validation";
import { applyRateLimit } from "@/lib/rate-limit";
import { bad } from "@/lib/api-helpers";
import { extractOrderId } from "@/lib/ocr";
import { sanitizeText, sanitizePhone } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";
import { validateOrderSubmission } from "@/lib/ocr-validation";

export const dynamic = "force-dynamic";

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

  // Rate limiting
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = await applyRateLimit("orderSubmit", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many submissions. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  // Order proofs must belong to an account. Guest submissions produced rows
  // nobody could track or claim a cashback for.
  const session = await getSession();
  if (!session) {
    return bad("Please log in to submit your order proof. Creating a free account takes 30 seconds.", 401);
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
  const dealType = sanitizeText(str(body.deal_type, 60), 60) || "100% Cashback";
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
        cashback_amount: number;
        total_slots: number;
        claimed_slots: number;
        stock: number;
        active: number;
        platform: string;
        deal_type: string;
      }
    | undefined;

  if (dealId > 0) {
    deal = db.prepare("SELECT * FROM deals WHERE id = ?").get(dealId) as typeof deal;
  } else if (productCode) {
    deal = db.prepare("SELECT * FROM deals WHERE product_code = ?").get(productCode) as typeof deal;
  }

  if (deal && !deal.active) {
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

  const finalUnitPrice = unitPrice > 0 ? unitPrice : deal ? deal.price_sale : 0;
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
  const orderUpload = orderScreenshotUrl.startsWith("/uploads/")
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

  let info;
  try {
    info = insertStmt.run(
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
      validation.decision.action === "auto_approve" ? "confirmed" : "pending"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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

  // Increment claimed slots
  if (targetDealId) {
    db.prepare("UPDATE deals SET claimed_slots = claimed_slots + 1, stock = MAX(0, stock - 1) WHERE id = ?").run(targetDealId);
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
    message: validation.decision.action === "auto_approve"
      ? "Order auto-approved! Track your order status using your Order Code."
      : "Order submitted for manual review. Track your order status using your Order Code.",
  });
}