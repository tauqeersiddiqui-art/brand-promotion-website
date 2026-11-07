import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-helpers";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  // Rate limiting
  const reqHeaders = await headers();
  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const count = (sql: string, ...params: (string | number)[]) =>
    (db.prepare(sql).get(...params) as { c: number }).c;

  const totalDisbursed = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS r FROM reimbursements
         WHERE status = 'paid'`
      )
      .get() as { r: number }
  ).r;

  const totalOrderValue = (
    db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS r FROM orders
         WHERE status NOT IN ('cancelled', 'rejected')`
      )
      .get() as { r: number }
  ).r;

  const recentOrders = db
    .prepare(
      `SELECT o.id, o.order_code, o.external_order_id, o.platform, o.reviewer_name,
              o.full_name, o.total, o.status, o.created_at,
              COALESCE(d.title, 'Campaign: ' || o.product_code) AS deal_title
       FROM orders o
       LEFT JOIN deals d ON d.id = o.deal_id
       ORDER BY datetime(o.created_at) DESC LIMIT 8`
    )
    .all();

  const recentReimbursements = db
    .prepare(
      `SELECT r.id, r.reimbursement_code, r.external_order_id, r.reviewer_name,
              r.upi_id, r.amount, r.status, r.created_at,
              o.order_code, COALESCE(d.title, 'Campaign: ' || o.product_code) AS deal_title
       FROM reimbursements r
       JOIN orders o ON o.id = r.order_id
       LEFT JOIN deals d ON d.id = r.deal_id
       ORDER BY datetime(r.created_at) DESC LIMIT 8`
    )
    .all();

  return NextResponse.json({
    deals: count("SELECT COUNT(*) AS c FROM deals"),
    activeDeals: count("SELECT COUNT(*) AS c FROM deals WHERE active = 1"),
    users: count("SELECT COUNT(*) AS c FROM users"),
    orders: count("SELECT COUNT(*) AS c FROM orders"),
    pendingOrders: count("SELECT COUNT(*) AS c FROM orders WHERE status = 'confirmed'"),
    verifiedOrders: count("SELECT COUNT(*) AS c FROM orders WHERE status = 'confirmed'"),
    reimbursements: count("SELECT COUNT(*) AS c FROM reimbursements"),
    pendingReimbursements: count("SELECT COUNT(*) AS c FROM reimbursements WHERE status = 'pending'"),
    paidReimbursements: count("SELECT COUNT(*) AS c FROM reimbursements WHERE status = 'paid'"),
    totalDisbursed: Math.round(totalDisbursed * 100) / 100,
    totalOrderValue: Math.round(totalOrderValue * 100) / 100,
    pendingReviews: count("SELECT COUNT(*) AS c FROM reviews WHERE status = 'pending'"),
    pendingRefunds: count("SELECT COUNT(*) AS c FROM refunds WHERE status = 'requested'"),
    recentOrders,
    recentReimbursements,
  });
}