import { NextResponse } from "next/server";
import { db, generateCode } from "@/lib/db";
import { requireUser, bad } from "@/lib/api-helpers";
import { str, int } from "@/lib/validation";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { saveUploadedImage } from "@/lib/upload";
import { runOcrOnBuffer } from "@/lib/ocr";
import { computeImageHash } from "@/lib/ocr-validation";
import { sanitizeText, sanitizeHtml } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const ELIGIBLE_STATUSES = ["confirmed"];

/**
 * Submit a review for a deal the user actually bought.
 * multipart/form-data: order_id, rating, text, screenshot (file)
 * The screenshot is saved and OCR'd; extracted text is stored for the admin.
 */
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

  const { user, error } = await requireUser();
  if (error) return error;

  // Rate limiting
  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("apiGeneral", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many reviews submitted. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Invalid form data.");
  }

  const orderId = int(form.get("order_id"), 1, 1_000_000_000, 0);
  const rating = int(form.get("rating"), 1, 5, 0);
  const text = sanitizeHtml(str(form.get("text"), 1000));

  if (!orderId) return bad("Missing order.");
  if (!rating) return bad("Please select a star rating.");
  if (text.length < 5) return bad("Please write a short review (at least 5 characters).");

  // Verified-buyer check: order must belong to user and be in an eligible status
  const order = db
    .prepare("SELECT id, deal_id, user_id, status FROM orders WHERE id = ?")
    .get(orderId) as
    | { id: number; deal_id: number; user_id: number | null; status: string }
    | undefined;
  if (!order || order.user_id !== user.id) {
    return bad("Order not found.", 404);
  }
  if (!ELIGIBLE_STATUSES.includes(order.status)) {
    return bad("You can review this deal once your order is confirmed.");
  }

  const existing = db
    .prepare("SELECT id FROM reviews WHERE order_id = ?")
    .get(orderId) as { id: number } | undefined;
  if (existing) return bad("You already submitted a review for this order.", 409);

  // reviews.deal_id is NOT NULL, and legacy rows can carry a null deal_id.
  // Comparing orderDeal.deal_id against order.deal_id compared a column with
  // itself, so it never caught the real failure: an unhandled
  // "NOT NULL constraint failed: reviews.deal_id" at INSERT time.
  const orderDeal = db.prepare("SELECT deal_id FROM orders WHERE id = ?").get(orderId) as
    | { deal_id: number | null }
    | undefined;
  if (!orderDeal || orderDeal.deal_id == null) {
    return bad("This order is not linked to a campaign and cannot be reviewed.", 400);
  }

  // Screenshot is optional but recommended; OCR runs on it when present
  let screenshotUrl = "";
  let ocrText = "";
  let ocrStatus: "pending" | "done" | "failed" = "pending";
  let ocrError: string | undefined;

  const file = form.get("screenshot");
  if (file instanceof File && file.size > 0) {
    const saved = await saveUploadedImage(file);
    if (!saved.ok) return bad(saved.error);
    screenshotUrl = saved.url;

    const ocr = await runOcrOnBuffer(saved.buffer, `image/${saved.ext === "jpg" ? "jpeg" : saved.ext}`);
    if (ocr.ok) {
      ocrText = ocr.text;
      ocrStatus = "done";
    } else {
      ocrStatus = "failed";
      ocrError = ocr.error;
    }

    // Record the file like /api/upload does. Without this row the screenshot
    // had no content hash, so the same image could be reused across reviews
    // without any system noticing.
    db.prepare(
      `INSERT INTO uploads (url, user_id, original_name, mime_type, size, ocr_text, ocr_order_id, ocr_amount, ocr_date, ocr_status, p_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      saved.url,
      user.id,
      file.name.slice(0, 200),
      file.type.slice(0, 100),
      saved.buffer.length,
      ocrText,
      ocr.ok ? ocr.extractedOrderId || "" : "",
      ocr.ok ? ocr.extractedAmount || 0 : 0,
      ocr.ok ? ocr.extractedDate || "" : "",
      ocrStatus,
      computeImageHash(saved.buffer)
    );
  }

  const reviewCode = generateCode("RV");
  const info = db
    .prepare(
      `INSERT INTO reviews (review_code, user_id, order_id, deal_id, rating, text, screenshot_url, ocr_text, ocr_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(reviewCode, user.id, orderId, order.deal_id, rating, text, screenshotUrl, ocrText, ocrStatus);

  return NextResponse.json({
    ok: true,
    review_code: reviewCode,
    review_id: Number(info.lastInsertRowid),
    ocr_status: ocrStatus,
    ocr_error: ocrError ?? null,
    note:
      ocrStatus === "failed" && ocrError
        ? `Review saved, but OCR could not read the screenshot: ${ocrError} The admin can re-run OCR from the panel.`
        : undefined,
  });
}