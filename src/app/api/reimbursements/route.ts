import { NextResponse } from "next/server";
import { db, generateCode } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { str, int, isUrl } from "@/lib/validation";
import { applyRateLimit } from "@/lib/rate-limit";
import { bad } from "@/lib/api-helpers";
import { runOcrOnBuffer, analyzeReviewText, extractOrderId, normalizeOrderId, hasReturnWindowClosed } from "@/lib/ocr";
import fs from "fs";
import path from "path";
import { sanitizeText, sanitizePhone, sanitizeUpiId, sanitizeIfsc, sanitizeAccountNumber, sanitizeHtml } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";
import { checkMaxClaimsPerUser, checkCooldownAfterRejection, checkDailyClaimLimit, checkDuplicateOrderInReimbursements, isScreenshotUsedByAnotherClaim } from "@/lib/ocr-validation";
import { uploadFilePath } from "@/lib/storage";

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

  // Rate limiting (IP ceiling here; the per-account bucket is applied once the
  // session is known, so rotating X-Forwarded-For does not bypass it).
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rlIp = await applyRateLimit("reimbursementIp", ip);
  if (!rlIp.ok) {
    return NextResponse.json(
      { error: `Too many claim requests. Try again in ${rlIp.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rlIp.retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid request body.");
  }

  const orderIdentifier = sanitizeText(str(body.order_identifier || body.order_code || body.external_order_id, 80), 80).trim();
  const reviewerName = sanitizeText(str(body.reviewer_name, 100), 100).trim();
  const reviewRating = int(body.review_rating, 1, 5, 5);
  const reviewText = sanitizeHtml(str(body.review_text, 2000)).trim();
  const reviewLink = sanitizeText(str(body.review_link, 500), 500).trim();
  const reviewScreenshotUrl = sanitizeText(str(body.review_screenshot_url, 500), 500).trim();
  const orderScreenshotUrl = sanitizeText(str(body.order_screenshot_url, 500), 500).trim();
  const sellerFeedbackUrl = sanitizeText(str(body.seller_feedback_url, 500), 500).trim();
  const mediatorName = sanitizeText(str(body.mediator_name, 100), 100).trim();
  const payoutMethod = sanitizeText(str(body.payout_method, 10), 10).toLowerCase() === "bank" ? "bank" : "upi";
  const upiId = sanitizeUpiId(str(body.upi_id, 80));
  const bankName = sanitizeText(str(body.bank_name, 80), 80).trim();
  const accountNumber = sanitizeAccountNumber(str(body.account_number, 40));
  const ifscCode = sanitizeIfsc(str(body.ifsc_code, 20));
  const accountHolder = sanitizeText(str(body.account_holder, 100), 100).trim();
  const customAmount = typeof body.amount === "number" ? body.amount : parseFloat(String(body.amount || 0)) || 0;

  if (!orderIdentifier) {
    return bad("Please provide your Order ID (Amazon/Flipkart Order ID or BP Tracking Code).");
  }

  if (payoutMethod === "upi" && !upiId) {
    return bad("Please enter a valid UPI ID (e.g. yourname@okhdfcbank or 9876543210@paytm).");
  }

  if (payoutMethod === "bank" && (!accountNumber || !ifscCode || !accountHolder)) {
    return bad("Please fill in complete Bank details (Account Number, IFSC, Account Holder).");
  }

  // Find the order
  const order = db
    .prepare(
      `SELECT o.*, d.refund_amount, d.price_sale
       FROM orders o
       LEFT JOIN deals d ON d.id = o.deal_id
       WHERE o.order_code = ?
          OR o.external_order_id = ?
          OR (o.phone = ? AND o.phone != '')
       ORDER BY datetime(o.created_at) DESC
       LIMIT 1`
    )
    .get(orderIdentifier, orderIdentifier, orderIdentifier) as
    | {
        id: number;
        order_code: string;
        external_order_id: string;
        deal_id: number | null;
        user_id: number | null;
        email: string;
        total: number;
        refund_amount: number | null;
        price_sale: number | null;
        reviewer_name: string;
        status: string;
      }
    | undefined;

  if (!order) {
    return bad(
      `No matching order found for "${orderIdentifier}". Please check your order confirmation code or place an order first.`,
      404
    );
  }

  // Authorization: the claim must belong to the account that owns the order.
  // Previously this route accepted no session at all, so an anonymous caller
  // could name any delivered order and attach an arbitrary payout destination,
  // filing the claim against the victim's user_id.
  const session = await getSession();
  if (!session) {
    return bad("Please log in to submit a refund claim for your order.", 401);
  }

  const rlUser = await applyRateLimit("reimbursementClaim", `user:${session.userId}`);
  if (!rlUser.ok) {
    return NextResponse.json(
      { error: `Too many claim requests. Try again in ${rlUser.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rlUser.retryAfter) } }
    );
  }

  const orderOwnerId = order.user_id;
  const emailMatches =
    !!order.email && order.email.trim().toLowerCase() === session.email.trim().toLowerCase();

  if (orderOwnerId != null && orderOwnerId !== session.userId) {
    return bad("This order belongs to a different account. Please log in with the account used to place it.", 403);
  }
  if (orderOwnerId == null && !emailMatches) {
    return bad("This order was placed with a different email. Please log in with that account to claim it.", 403);
  }

  // Adopt unowned guest orders so later claims are bound to this account.
  if (orderOwnerId == null) {
    db.prepare("UPDATE orders SET user_id = ? WHERE id = ?").run(session.userId, order.id);
  }

  const userId = session.userId;

  // Validate order status - must be confirmed
  if (order.status !== "confirmed") {
    return bad(
      `Order must be confirmed before claiming reimbursement. Current status: ${order.status}`,
      400
    );
  }

  // Fraud prevention checks
  // 1. Max claims per user per 30 days
  const maxClaimsCheck = checkMaxClaimsPerUser(userId, 30, 10);
  if (!maxClaimsCheck.allowed) {
    return bad(
      `Monthly claim limit reached (${maxClaimsCheck.current}/10). Try again next month.`,
      429
    );
  }

  // 2. Daily claim limit
  const dailyLimitCheck = checkDailyClaimLimit(userId, 3);
  if (!dailyLimitCheck.allowed) {
    return bad(
      `Daily claim limit reached (${dailyLimitCheck.current}/3). Try again tomorrow.`,
      429
    );
  }

  // 3. Cooldown after rejection
  const cooldownCheck = checkCooldownAfterRejection(userId, 1);
  if (!cooldownCheck.allowed) {
    return bad(
      `Please wait ${cooldownCheck.daysRemaining} day(s) after a rejected claim before submitting a new one.`,
      429
    );
  }

  // 4. Check if reimbursement already exists for this order
  const existingReimb = db
    .prepare(
      "SELECT id, reimbursement_code, status FROM reimbursements WHERE order_id = ? AND status IN ('pending','approved','paid')"
    )
    .get(order.id) as { id: number; reimbursement_code: string; status: string } | undefined;

  if (existingReimb) {
    return bad(
      `A reimbursement claim (#${existingReimb.reimbursement_code}) is already in status "${existingReimb.status}" for this order.`,
      409
    );
  }

  // 5. Check for duplicate order ID across ALL reimbursements
  const dupCheck = checkDuplicateOrderInReimbursements(order.external_order_id);
  if (dupCheck.duplicate) {
    return bad(
      `This Order ID has already been used for a reimbursement claim.`,
      409
    );
  }

  // 6. Verify review exists and is approved for this order
  const review = db
    .prepare("SELECT id, status, rating, deal_id FROM reviews WHERE order_id = ? ORDER BY datetime(created_at) DESC LIMIT 1")
    .get(order.id) as { id: number; status: string; rating: number; deal_id: number } | undefined;

  if (!review) {
    return bad(
      "No review submitted for this order. Please submit a review first.",
      400
    );
  }

  if (review.status !== "approved") {
    return bad(
      `Review must be approved before claiming reimbursement. Current status: ${review.status}`,
      400
    );
  }

  if (review.rating < 5) {
    return bad(
      "Only 5-star reviews are eligible for full reimbursement.",
      400
    );
  }

  // Verify review deal matches order deal (linking integrity)
  if (review.deal_id !== order.deal_id) {
    return bad(
      "Review deal does not match order deal. Cannot claim reimbursement.",
      400
    );
  }

  // Compute reimbursement amount: capped at deal's refund_amount (never exceeds it)
  // Priority: custom amount > deal.refund_amount > deal.price_sale > order.total
  const maxAllowedAmount = order.refund_amount && order.refund_amount > 0
    ? order.refund_amount
    : order.price_sale && order.price_sale > 0
      ? order.price_sale
      : order.total > 0
        ? order.total
        : 0;

  const finalAmount = Math.min(
    customAmount > 0 ? customAmount : maxAllowedAmount,
    maxAllowedAmount
  );

  const finalReviewerName = reviewerName || order.reviewer_name || "Verified Reviewer";
  const reimbCode = generateCode("RM");

  // Both proofs are mandatory: the live review screenshot, and a screenshot of
  // the order page that proves the buyer owns this order (Order ID visible) and
  // that the marketplace return window has closed.
  const SAFE_UPLOAD_PATH = /^\/(?:api\/files|uploads)\/[A-Za-z0-9._-]+$/;
  if (!reviewScreenshotUrl) {
    return bad("Please upload a screenshot of your live review showing 5 stars and the 'Verified Purchase' badge.");
  }
  if (!SAFE_UPLOAD_PATH.test(reviewScreenshotUrl)) {
    return bad("Invalid review screenshot path.", 400);
  }
  if (!orderScreenshotUrl) {
    return bad("Please upload a screenshot of your order page showing the Order ID and that the return window has closed.");
  }
  if (!SAFE_UPLOAD_PATH.test(orderScreenshotUrl)) {
    return bad("Invalid order screenshot path.", 400);
  }
  if (!sellerFeedbackUrl) {
    return bad("Please upload a screenshot of the seller feedback form you submitted for this order.");
  }
  if (!SAFE_UPLOAD_PATH.test(sellerFeedbackUrl)) {
    return bad("Invalid seller feedback screenshot path.", 400);
  }
  if (reviewLink && !isUrl(reviewLink)) {
    return bad("Review link must be a valid http(s) URL.", 400);
  }

  // Every proof must be a real upload by this account. Checking only the path
  // shape let a caller reference another user's upload (or a non-existent file)
  // and still reach the OCR step.
  for (const [label, url] of [
    ["review", reviewScreenshotUrl],
    ["order", orderScreenshotUrl],
    ["seller feedback", sellerFeedbackUrl],
  ] as const) {
    const upload = db
      .prepare("SELECT user_id FROM uploads WHERE url = ?")
      .get(url) as { user_id: number | null } | undefined;
    if (!upload) {
      return bad(`The ${label} screenshot was not uploaded here. Please upload it again.`, 400);
    }
    if (upload.user_id != null && upload.user_id !== userId) {
      return bad(`The ${label} screenshot belongs to a different account.`, 403);
    }
  }

  // The same image cannot back claims for two different orders. Re-using a
  // screenshot for the *same* order is allowed, so a buyer can retry freely.
  if (isScreenshotUsedByAnotherClaim(reviewScreenshotUrl, order.external_order_id)) {
    return bad(
      "Duplicate review screenshot detected. This image has already been used for another order's claim.",
      409
    );
  }
  if (isScreenshotUsedByAnotherClaim(orderScreenshotUrl, order.external_order_id)) {
    return bad(
      "Duplicate order screenshot detected. This image has already been used for another order's claim.",
      409
    );
  }
  if (isScreenshotUsedByAnotherClaim(sellerFeedbackUrl, order.external_order_id)) {
    return bad(
      "Duplicate seller feedback screenshot detected. This image has already been used for another order's claim.",
      409
    );
  }

  // Resolve inside the uploads directory only. These URLs are caller-supplied
  // text, and a plain path.join would let `..` segments read arbitrary files and
  // forward them to the OCR provider.
  async function ocrScreenshot(url: string): Promise<{ text: string; ok: boolean }> {
    const filePath = uploadFilePath(url);
    if (!filePath) {
      return { text: "", ok: false };
    }
    try {
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
      const ocr = await runOcrOnBuffer(buf, mime);
      return { text: ocr.ok ? ocr.text || "" : "", ok: !!(ocr.ok && ocr.text) };
    } catch {
      return { text: "", ok: false };
    }
  }

  // Review screenshot: must be machine-readable, 5 stars and Verified Purchase.
  const reviewOcr = await ocrScreenshot(reviewScreenshotUrl);
  if (!reviewOcr.ok) {
    return bad(
      "We could not read your review screenshot. Please upload a clear image showing the 5-star rating and the 'Verified Purchase' badge."
    );
  }
  const reviewFlags = analyzeReviewText(reviewOcr.text);
  if (!reviewFlags.has5StarRating || !reviewFlags.hasVerifiedPurchase) {
    return bad(
      "Review screenshot must show a 5-star rating and a 'Verified Purchase' badge. Please upload a clear screenshot of the live review."
    );
  }

  // Order screenshot: must show this order's ID and a closed return window.
  const orderOcr = await ocrScreenshot(orderScreenshotUrl);
  if (!orderOcr.ok) {
    return bad(
      "We could not read your order screenshot. Please upload a clear screenshot of the order details page showing the Order ID and 'Return window closed'."
    );
  }
  const ocrOrderId = extractOrderId(orderOcr.text);
  if (!ocrOrderId) {
    return bad(
      "We could not find an Order ID in your order screenshot. Please upload a screenshot where the Order ID is clearly visible."
    );
  }
  const scannedId = normalizeOrderId(ocrOrderId);
  const expectedIds = [normalizeOrderId(order.external_order_id), normalizeOrderId(order.order_code)].filter(Boolean);
  if (!expectedIds.includes(scannedId)) {
    return bad(
      `The Order ID in your screenshot (${ocrOrderId}) does not match this order (${order.external_order_id || order.order_code}). Please upload the correct order's screenshot.`
    );
  }
  if (!hasReturnWindowClosed(orderOcr.text)) {
    return bad(
      "Your order screenshot must show that the return window has closed (e.g. 'Return window closed'). Please claim only after the return period ends."
    );
  }

  const ocrText = reviewOcr.text;
  const ocrStatus = "done";

  const insertStmt = db.prepare(`
    INSERT INTO reimbursements (
      reimbursement_code, order_id, user_id, deal_id, external_order_id,
      reviewer_name, review_rating, review_text, review_link, review_screenshot_url,
      order_screenshot_url, seller_feedback_url, mediator_name, ocr_text, order_ocr_text,
      ocr_status, payout_method, upi_id, bank_name, account_number, ifsc_code,
      account_holder, amount, status
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, 'pending'
    )
  `);

  const info = insertStmt.run(
    reimbCode,
    order.id,
    userId,
    order.deal_id,
    order.external_order_id,
    finalReviewerName,
    reviewRating,
    reviewText,
    reviewLink,
    reviewScreenshotUrl,
    orderScreenshotUrl,
    sellerFeedbackUrl,
    mediatorName,
    ocrText,
    orderOcr.text,
    ocrStatus,
    payoutMethod,
    upiId,
    bankName,
    accountNumber,
    ifscCode,
    accountHolder,
    finalAmount
  );

  return NextResponse.json({
    ok: true,
    reimbursement_code: reimbCode,
    reimbursement_id: Number(info.lastInsertRowid),
    amount: finalAmount,
    payout_method: payoutMethod,
    upi_id: upiId,
    message: "Refund request submitted successfully! Refund will be transferred via UPI after verification.",
  });
}

export async function GET() {
  const session = await getSession();
  if (!session) return bad("Please log in.", 401);

  const reimbursements = db
    .prepare(
      `SELECT r.*, o.order_code, o.platform, o.product_code,
              COALESCE(d.title, 'Campaign: ' || o.product_code) AS deal_title
       FROM reimbursements r
       JOIN orders o ON o.id = r.order_id
       LEFT JOIN deals d ON d.id = r.deal_id
       WHERE r.user_id = ?
       ORDER BY datetime(r.created_at) DESC`
    )
    .all(session.userId);

  return NextResponse.json({ reimbursements });
}