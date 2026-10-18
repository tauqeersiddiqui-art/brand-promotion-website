import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { bad } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/** My orders (with attached reimbursements, refunds and reviews). */
export async function GET() {
  // Rate limiting
  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = await applyRateLimit("apiGeneral", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const session = await getSession();
  if (!session) return bad("Please log in.", 401);

  const orders = db
    .prepare(
      // Explicit columns rather than `o.*`. The wildcard leaked server-internal
      // fields to the customer: ip, device_fingerprint, fraud_score and
      // validation_details (which embeds the full OCR and fraud result).
      `SELECT o.id, o.order_code, o.external_order_id, o.product_code, o.deal_id,
              o.reviewer_name, o.full_name, o.platform, o.deal_type, o.mediator_name,
              o.order_date, o.quantity, o.variant, o.total, o.status, o.created_at,
              o.order_screenshot_url, o.price_screenshot_url, o.ocr_order_match,
              COALESCE(d.title, 'Campaign: ' || o.product_code) AS deal_title,
              COALESCE(d.image_url, '') AS deal_image,
              d.platform AS deal_platform
       FROM orders o
       LEFT JOIN deals d ON d.id = o.deal_id
       WHERE o.user_id = ? OR (o.email = (SELECT email FROM users WHERE id = ?))
       ORDER BY datetime(o.created_at) DESC`
    )
    .all(session.userId, session.userId) as Record<string, unknown>[];

  const reimbStmt = db.prepare(
    // admin_note is an internal moderation field and is not the customer's.
    `SELECT id, reimbursement_code, order_id, reviewer_name, review_rating,
            review_link, review_screenshot_url, ocr_status,
            payout_method, upi_id, amount, status, utr_number, created_at
     FROM reimbursements WHERE order_id = ?`
  );

  const refundStmt = db.prepare(
    "SELECT refund_code, reason, status, created_at FROM refunds WHERE order_id = ?"
  );

  const reviewStmt = db.prepare(
    "SELECT review_code, status, rating FROM reviews WHERE order_id = ?"
  );

  for (const o of orders) {
    o.reimbursements = reimbStmt.all(o.id as number);
    o.refunds = refundStmt.all(o.id as number);
    o.review = reviewStmt.get(o.id as number) ?? null;
  }

  return NextResponse.json({ orders });
}