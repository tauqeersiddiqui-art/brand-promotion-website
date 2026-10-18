import { NextResponse } from "next/server";
import { db, generateCode } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { str, int } from "@/lib/validation";
import { applyRateLimit } from "@/lib/rate-limit";
import { bad } from "@/lib/api-helpers";
import { runOcrOnBuffer, analyzeReviewText } from "@/lib/ocr";
import fs from "fs";
import path from "path";
import { sanitizeText, sanitizePhone, sanitizeUpiId, sanitizeIfsc, sanitizeAccountNumber, sanitizeHtml } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";
import { checkMaxClaimsPerUser, checkCooldownAfterRejection, checkDailyClaimLimit, checkDuplicateOrderInReimbursements } from "@/lib/ocr-validation";

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
  const rl = await applyRateLimit("reimbursementClaim", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many claim requests. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
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
      `SELECT o.*, d.cashback_amount, d.price_sale
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
        cashback_amount: number | null;
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
    return bad("Please log in to submit a cashback claim for your order.", 401);
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

  // Validate order status - must be delivered or verified
  if (!["delivered", "verified"].includes(order.status)) {
    return bad(
      `Order must be delivered or verified before claiming reimbursement. Current status: ${order.status}`,
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

  // Compute reimbursement amount: capped at deal's cashback_amount (never exceeds it)
  // Priority: custom amount > deal.cashback_amount > deal.price_sale > order.total
  const maxAllowedAmount = order.cashback_amount && order.cashback_amount > 0
    ? order.cashback_amount
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

  // Attempt OCR if a local upload screenshot is provided
  let ocrText = "";
  let ocrStatus = "pending";
  let has5StarRating = false;
  let hasVerifiedPurchase = false;

  if (reviewScreenshotUrl && /^\/uploads\/[A-Za-z0-9._-]+$/.test(reviewScreenshotUrl)) {
    try {
      // Resolve inside the uploads directory only. `reviewScreenshotUrl` is
      // caller-supplied text, and a plain path.join would let `..` segments
      // read arbitrary files and forward them to the OCR provider.
      const uploadsRoot = path.join(process.cwd(), "public", "uploads");
      const filePath = path.join(process.cwd(), "public", reviewScreenshotUrl);
      if (!filePath.startsWith(uploadsRoot + path.sep)) {
        return bad("Invalid review screenshot path.", 400);
      }
      if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        const ext = path.extname(filePath).slice(1);
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
        const ocr = await runOcrOnBuffer(buf, mime);
        if (ocr.ok && ocr.text) {
          ocrText = ocr.text;
          ocrStatus = "done";
          has5StarRating = ocr.has5StarRating || false;
          hasVerifiedPurchase = ocr.hasVerifiedPurchase || false;
        }
        // Duplicate detection: the same review screenshot must not be reused
        // across different orders. The old uploads-table hash check always
        // matched this screenshot's own upload row and rejected every claim.
        // Resubmitting the same screenshot for the *same* order is allowed.
        const reused = db
          .prepare(
            "SELECT id FROM reimbursements WHERE review_screenshot_url = ? AND external_order_id != ? LIMIT 1"
          )
          .get(reviewScreenshotUrl, order.external_order_id) as { id: number } | undefined;
        if (reused) {
          return bad(
            "Duplicate review screenshot detected. This image has already been used for another order's claim.",
            409
          );
        }
      }
    } catch {
      ocrStatus = "pending";
    }
  }

  // A submitted review screenshot must be machine-readable. An OCR failure is
  // not treated as verified evidence — low-confidence results never auto-pass.
  if (reviewScreenshotUrl && ocrStatus !== "done") {
    return bad(
      "We could not read your review screenshot. Please upload a clearer image showing the 5-star rating and 'Verified Purchase' badge."
    );
  }

  // OCR validation: must show 5-star and verified purchase
  if (ocrStatus === "done" && (!has5StarRating || !hasVerifiedPurchase)) {
    return bad(
      "Review screenshot must show a 5-star rating and 'Verified Purchase' badge. Please upload a clear screenshot of the live review."
    );
  }

  const insertStmt = db.prepare(`
    INSERT INTO reimbursements (
      reimbursement_code, order_id, user_id, deal_id, external_order_id,
      reviewer_name, review_rating, review_text, review_link, review_screenshot_url,
      ocr_text, ocr_status, payout_method, upi_id, bank_name,
      account_number, ifsc_code, account_holder, amount, status
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, 'pending'
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
    ocrText,
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
    message: "Reimbursement claim submitted successfully! Cashback will be transferred via UPI after verification.",
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