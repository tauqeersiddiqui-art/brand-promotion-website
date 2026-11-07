import { db } from "./db";
import { sanitizeText } from "./sanitize";

/**
 * Shared deal listing query.
 *
 * Extracted from /api/deals so the server-rendered /browse page and the JSON
 * API return exactly the same data — before this, /browse was client-only and
 * crawlers saw an empty shell.
 */

export type DealListItem = {
  id: number;
  product_code: string;
  title: string;
  description: string;
  category: string;
  platform: string;
  deal_type: string;
  image_url: string;
  deal_url: string;
  target_keyword: string;
  instructions: string;
  coupon_code: string;
  price_original: number;
  price_sale: number;
  refund_amount: number;
  review_amount: number;
  rating_amount: number;
  only_order_amount: number;
  order_form_url: string;
  refund_form_url: string;
  total_slots: number;
  claimed_slots: number;
  stock: number;
  featured: number;
  created_at: string;
};

export type DealsQueryInput = {
  search?: string | null;
  category?: string | null;
  platform?: string | null;
  sort?: string | null;
  page?: number;
  limit?: number;
};

export type DealsQueryResult = {
  deals: DealListItem[];
  categories: string[];
  platforms: string[];
  total: number;
  page: number;
  pages: number;
};

export function queryDeals(input: DealsQueryInput = {}): DealsQueryResult {
  const search = sanitizeText((input.search || "").trim().slice(0, 80), 80);
  const category = sanitizeText((input.category || "").trim().slice(0, 40), 40);
  const platform = sanitizeText((input.platform || "").trim().slice(0, 40), 40);
  const sort = input.sort || "featured";
  const page = Math.max(1, Math.floor(input.page || 1) || 1);
  const perPage = Math.min(100, Math.max(1, Math.floor(input.limit || 12)));

  const where: string[] = ["active = 1", "approval_status = 'approved'"];
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

  // Whitelisted, never interpolated from user input.
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
              price_original, price_sale, refund_amount, review_amount, rating_amount,
              only_order_amount, order_form_url, refund_form_url, total_slots, claimed_slots,
              stock, featured, created_at
       FROM deals WHERE ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    )
    .all(...params, perPage, (page - 1) * perPage) as DealListItem[];

  const categories = (
    db
      .prepare(
        "SELECT DISTINCT category FROM deals WHERE active = 1 AND approval_status = 'approved' ORDER BY category"
      )
      .all() as { category: string }[]
  ).map((r) => r.category);

  const platforms = (
    db
      .prepare(
        "SELECT DISTINCT platform FROM deals WHERE active = 1 AND approval_status = 'approved' ORDER BY platform"
      )
      .all() as { platform: string }[]
  ).map((r) => r.platform);

  return {
    deals,
    categories,
    platforms,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}
