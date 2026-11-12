import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-helpers";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "under_review", "approved", "paid", "rejected"] as const;

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
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const perPage = 25;

  const where: string[] = ["1=1"];
  const params: (string | number)[] = [];

  if (search) {
    where.push(
      "(r.reimbursement_code LIKE ? OR r.external_order_id LIKE ? OR r.reviewer_name LIKE ? OR r.upi_id LIKE ? OR r.utr_number LIKE ? OR o.order_code LIKE ? OR o.phone LIKE ?)"
    );
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like, like);
  }
  if ((STATUSES as readonly string[]).includes(status)) {
    where.push("r.status = ?");
    params.push(status);
  }

  const whereSql = where.join(" AND ");
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM reimbursements r JOIN orders o ON o.id = r.order_id WHERE ${whereSql}`).get(...params) as {
      c: number;
    }
  ).c;

  const reimbursements = db
    .prepare(
      `SELECT r.*,
              o.order_code, o.platform, o.product_code, o.full_name AS order_customer,
              o.phone AS customer_phone, o.email AS customer_email,
              o.order_screenshot_url AS order_proof_url, o.price_screenshot_url,
              COALESCE(d.title, 'Campaign: ' || o.product_code) AS deal_title,
              d.seller_name, d.seller_contact, d.seller_telegram
       FROM reimbursements r
       JOIN orders o ON o.id = r.order_id
       LEFT JOIN deals d ON d.id = r.deal_id
       WHERE ${whereSql}
       ORDER BY datetime(r.created_at) DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, perPage, (page - 1) * perPage);

  return NextResponse.json({
    reimbursements,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
  });
}