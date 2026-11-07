import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-helpers";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/** Admin: list reviews with screenshot + OCR text, filter by status. */
export async function GET(req: NextRequest) {
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

  const status = req.nextUrl.searchParams.get("status") || "";
  const allowed = ["pending", "approved", "rejected"];

  const where = allowed.includes(status) ? "WHERE rv.status = ?" : "";
  const params = allowed.includes(status) ? [status] : [];

  const reviews = db
    .prepare(
      `SELECT rv.*, u.name AS user_name, u.email AS user_email,
              o.order_code, d.title AS deal_title
       FROM reviews rv
       JOIN users u ON u.id = rv.user_id
       JOIN orders o ON o.id = rv.order_id
       JOIN deals d ON d.id = rv.deal_id
       ${where}
       ORDER BY CASE rv.status WHEN 'pending' THEN 0 ELSE 1 END, datetime(rv.created_at) DESC`
    )
    .all(...params);

  return NextResponse.json({ reviews });
}