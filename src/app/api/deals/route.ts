import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { applyRateLimit } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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

  const sp = req.nextUrl.searchParams;
  const search = sanitizeText((sp.get("search") || "").trim().slice(0, 80), 80);
  const category = sanitizeText((sp.get("category") || "").trim().slice(0, 40), 40);
  const platform = sanitizeText((sp.get("platform") || "").trim().slice(0, 40), 40);
  const sort = sp.get("sort") || "featured";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  // Honour an explicit `limit` (clamped). The order-proof form requests
  // `?limit=50` to populate its campaign dropdown; previously the param was
  // ignored and only the first 12 deals were offered.
  const requestedLimit = parseInt(sp.get("limit") || "", 10);
  const perPage =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(100, requestedLimit)
      : 12;

  const where: string[] = ["active = 1"];
  const params: (string | number)[] = [];

  if (search) {
    where.push("(title LIKE ? OR description LIKE ? OR product_code LIKE ? OR target_keyword LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category && category !== "All") {
    where.push("category = ?");
    params.push(category);
  }
  if (platform && platform !== "All") {
    where.push("platform = ?");
    params.push(platform);
  }

  const orderBy =
    sort === "price-low"
      ? "price_sale ASC"
      : sort === "price-high"
        ? "price_sale DESC"
        : sort === "slots"
          ? "(total_slots - claimed_slots) DESC"
          : sort === "discount"
            ? "CASE WHEN price_original > 0 THEN (price_original - price_sale) * 1.0 / price_original ELSE 0 END DESC"
            : "featured DESC, datetime(created_at) DESC";

  const whereSql = where.join(" AND ");

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM deals WHERE ${whereSql}`).get(...params) as {
      c: number;
    }
  ).c;

  const deals = db
    .prepare(
      `SELECT id, product_code, title, description, category, platform, deal_type,
              image_url, deal_url, target_keyword, instructions, coupon_code,
              price_original, price_sale, cashback_amount, total_slots, claimed_slots,
              stock, featured, created_at
       FROM deals WHERE ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    )
    .all(...params, perPage, (page - 1) * perPage);

  const categories = (
    db
      .prepare("SELECT DISTINCT category FROM deals WHERE active = 1 ORDER BY category")
      .all() as { category: string }[]
  ).map((r) => r.category);

  const platforms = (
    db
      .prepare("SELECT DISTINCT platform FROM deals WHERE active = 1 ORDER BY platform")
      .all() as { platform: string }[]
  ).map((r) => r.platform);

  return NextResponse.json({
    deals,
    categories,
    platforms,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
  });
}