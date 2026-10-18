import { NextResponse } from "next/server";
import { db, generateCode } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { str, int } from "@/lib/validation";
import { applyRateLimit } from "@/lib/rate-limit";
import { bad } from "@/lib/api-helpers";
import { sanitizeText } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";

/** Submit a refund request for an order (owner must match logged-in user or email). */
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
  const rl = await applyRateLimit("apiGeneral", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request body.");
  }
  const b = body as Record<string, unknown>;

  const orderId = int(b.order_id, 1, 1_000_000_000, 0);
  const reason = sanitizeText(str(b.reason, 200), 200);
  const details = sanitizeText(str(b.details, 1000), 1000);

  if (!orderId) return bad("Missing order.");
  if (reason.length < 3) return bad("Please select a reason.");

  const session = await getSession();
  const order = db
    .prepare("SELECT id, user_id, email, status FROM orders WHERE id = ?")
    .get(orderId) as
    | { id: number; user_id: number | null; email: string; status: string }
    | undefined;

  if (!order) return bad("Order not found.", 404);
  if (order.status === "cancelled")
    return bad("Refunds are not available for cancelled orders.");
  // Refund only allowed after delivery
  if (order.status !== "delivered") {
    return bad("Refund can only be requested after order is delivered.", 400);
  }
  // Check return window (14 days after delivery)
  const orderRecord = db
    .prepare("SELECT created_at, updated_at, delivered_at FROM orders WHERE id = ?")
    .get(orderId) as { created_at: string; updated_at: string; delivered_at: string } | undefined;
  if (orderRecord) {
    // Prefer the immutable delivery stamp. `updated_at` was previously used and
    // is bumped by every admin status change and note edit, so a reviewer
    // annotating a delivered order restarted the buyer's 14-day clock.
    const anchor = orderRecord.delivered_at || orderRecord.created_at;
    // SQLite `datetime('now')` yields "YYYY-MM-DD HH:MM:SS" in UTC with no
    // zone suffix; append Z so it is not silently parsed as local time.
    const deliveryDate = new Date(anchor.replace(" ", "T") + "Z");
    const now = new Date();
    const daysSinceDelivery = Math.floor((now.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceDelivery < 14) {
      return bad(
        `Return window not over. Please wait ${14 - daysSinceDelivery} more day(s) after delivery to request refund.`,
        400
      );
    }
  }
  if (session) {
    if (order.user_id !== session.userId && order.email !== session.email)
      return bad("You can only request refunds for your own orders.", 403);
  } else {
    return bad("Please log in to request a refund.", 401);
  }

  // Check-and-insert in one transaction. `refunds` has no unique index on
  // order_id, so two concurrent requests could both pass the check.
  const refundCode = generateCode("RF");
  try {
    const insertRefund = db.transaction(() => {
      const existing = db
        .prepare(
          "SELECT id FROM refunds WHERE order_id = ? AND status IN ('requested','approved','processed')"
        )
        .get(orderId);
      if (existing) return null;
      db.prepare(
        "INSERT INTO refunds (refund_code, order_id, reason, details) VALUES (?, ?, ?, ?)"
      ).run(refundCode, orderId, reason, details);
      return refundCode;
    });
    const code = insertRefund();
    if (!code) return bad("A refund request already exists for this order.", 409);
  } catch {
    return bad("We could not save your refund request. Please try again.", 500);
  }

  return NextResponse.json({ ok: true, refund_code: refundCode });
}