import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
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
  const search = sanitizeText((sp.get("search") || "").trim().slice(0, 80), 80);
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const perPage = 20;

  const where = search ? "WHERE u.name LIKE ? OR u.email LIKE ?" : "";
  const params = search ? [`%${search}%`, `%${search}%`] : [];

  const total = (
    db.prepare(`SELECT COUNT(DISTINCT u.id) AS c FROM users u ${where}`).get(...params) as { c: number }
  ).c;

  const users = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
              COUNT(o.id) AS order_count
       FROM users u LEFT JOIN orders o ON o.user_id = u.id
       ${where}
       GROUP BY u.id
       ORDER BY datetime(u.created_at) DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, perPage, (page - 1) * perPage);

  return NextResponse.json({
    users,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
  });
}