import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-helpers";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const STATUSES = ["confirmed", "rejected", "cancelled"] as const;

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

  const sp = req.nextUrl.searchParams;
  const search = sanitizeText((sp.get("search") || "").trim().slice(0, 80), 80);
  const status = sp.get("status") || "";
  const platform = sp.get("platform") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const perPage = 25;

  const where: string[] = ["1=1"];
  const params: (string | number)[] = [];

  if (search) {
    where.push(
      "(o.order_code LIKE ? OR o.external_order_id LIKE ? OR o.product_code LIKE ? OR o.reviewer_name LIKE ? OR o.full_name LIKE ? OR o.email LIKE ? OR o.phone LIKE ? OR o.mediator_name LIKE ?)"
    );
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like, like, like);
  }
  if ((STATUSES as readonly string[]).includes(status)) {
    where.push("o.status = ?");
    params.push(status);
  }
  if (platform && platform !== "All") {
    where.push("o.platform = ?");
    params.push(platform);
  }

  const whereSql = where.join(" AND ");
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM orders o WHERE ${whereSql}`).get(...params) as {
      c: number;
    }
  ).c;

  const orders = db
    .prepare(
      `SELECT o.*,
              COALESCE(d.title, 'Campaign: ' || o.product_code) AS deal_title,
              d.image_url AS deal_image
       FROM orders o
       LEFT JOIN deals d ON d.id = o.deal_id
       WHERE ${whereSql}
       ORDER BY datetime(o.created_at) DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, perPage, (page - 1) * perPage) as Record<string, unknown>[];

  const reimbStmt = db.prepare("SELECT id, reimbursement_code, status, upi_id, amount, utr_number FROM reimbursements WHERE order_id = ?");
  for (const o of orders) {
    o.reimbursements = reimbStmt.all(o.id as number);
  }

  return NextResponse.json({
    orders,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
  });
}