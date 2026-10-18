import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  // Rate limiting
  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") || "";
  const allowed = ["requested", "approved", "rejected", "processed"];

  const where = allowed.includes(status) ? "WHERE r.status = ?" : "";
  const params = allowed.includes(status) ? [status] : [];

  // LEFT JOIN: orders.deal_id is nullable, and an inner join silently hid those
  // refunds from the admin list while the dashboard badge still counted them,
  // so they could never be actioned.
  const refunds = db
    .prepare(
      `SELECT r.*, o.order_code, o.full_name, o.email, o.total, o.status AS order_status,
              COALESCE(d.title, 'Campaign: ' || o.product_code) AS deal_title
       FROM refunds r
       JOIN orders o ON o.id = r.order_id
       LEFT JOIN deals d ON d.id = o.deal_id
       ${where}
       ORDER BY CASE r.status WHEN 'requested' THEN 0 ELSE 1 END, datetime(r.created_at) DESC`
    )
    .all(...params);

  return NextResponse.json({ refunds });
}