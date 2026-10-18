import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { bad } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: number;
  order_code: string;
  external_order_id: string;
  product_code: string;
  deal_id: number | null;
  user_id: number | null;
  reviewer_name: string;
  full_name: string;
  platform: string;
  deal_type: string;
  mediator_name: string;
  order_date: string;
  quantity: number;
  unit_price: number;
  total: number;
  order_screenshot_url: string;
  price_screenshot_url: string;
  status: string;
  created_at: string;
  deal_title: string;
  deal_image: string;
};

export async function GET(req: NextRequest) {
  // Rate limiting
  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = await applyRateLimit("apiSearch", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many tracking requests. Please wait a moment." },
      { status: 429 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const q = sanitizeText((sp.get("q") || "").trim(), 80);

  // Tracking is private: only a logged-in user can look up their own orders.
  // The endpoint used to accept anonymous queries, which made order codes and
  // phone numbers an enumeration surface for customer records.
  const session = await getSession();
  if (!session) {
    return bad("Please log in to track your orders.", 401);
  }

  if (!q || q.length < 6) {
    return bad("Please enter a full Order ID, Tracking Code, or registered Phone Number.", 400);
  }

  // Scoped to the caller's own orders. Exact-match lookups only: a substring
  // search was previously a discovery oracle for unrelated customers.
  const orders = db
    .prepare(
      `SELECT o.id, o.order_code, o.external_order_id, o.product_code, o.deal_id, o.user_id,
              o.reviewer_name, o.full_name, o.platform, o.deal_type, o.mediator_name,
              o.order_date, o.quantity, o.unit_price, o.total, o.order_screenshot_url,
              o.price_screenshot_url, o.status, o.created_at,
              COALESCE(d.title, 'Campaign: ' || o.product_code) AS deal_title,
              COALESCE(d.image_url, '') AS deal_image
       FROM orders o
       LEFT JOIN deals d ON d.id = o.deal_id
       WHERE o.user_id = ?
         AND (o.order_code = ?
           OR o.external_order_id = ?
           OR o.phone = ?
           OR o.email = ?)
       ORDER BY datetime(o.created_at) DESC
       LIMIT 10`
    )
    .all(session.userId, q, q, q, q.toLowerCase()) as OrderRow[];

  if (!orders || orders.length === 0) {
    return NextResponse.json(
      { error: "No orders found matching your search. Please check the Order ID or phone number." },
      { status: 404 }
    );
  }

  const reimbStmt = db.prepare(
    `SELECT id, reimbursement_code, order_id, review_rating, ocr_status,
            payout_method, upi_id, amount, status, utr_number, created_at
     FROM reimbursements WHERE order_id = ?`
  );

  const attachReimbursements = (o: OrderRow) => {
    const rows = reimbStmt.all(o.id) as Record<string, unknown>[];
    // Every returned order belongs to the caller, so the payout destination is
    // safe to show in full. Bank account numbers, IFSC and internal admin
    // notes are never returned.
    return rows.map((r) => ({
      id: r.id,
      reimbursement_code: r.reimbursement_code,
      order_id: r.order_id,
      review_rating: r.review_rating,
      ocr_status: r.ocr_status,
      payout_method: r.payout_method,
      upi_id: String(r.upi_id || ""),
      amount: r.amount,
      status: r.status,
      utr_number: r.utr_number,
      created_at: r.created_at,
    }));
  };

  const ordersWithReimbursements = orders.map((o) => {
    const { user_id: _userId, ...rest } = o;
    return {
      ...rest,
      reimbursements: attachReimbursements(o),
    };
  });

  // Shape expected by src/components/QuickTrackForm.tsx
  const single = ordersWithReimbursements.length === 1 ? ordersWithReimbursements[0] : null;

  return NextResponse.json({
    ok: true,
    found: true,
    type: single ? "single" : "multiple",
    order: single,
    orders: ordersWithReimbursements,
    reimbursements: single ? single.reimbursements : [],
  });
}