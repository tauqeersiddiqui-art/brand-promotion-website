import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, bad } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/** Orders eligible for review (confirmed/shipped/delivered, not yet reviewed). */
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

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

  const orders = db
    .prepare(
      `SELECT o.id, o.order_code, o.deal_id, o.status, o.created_at,
              d.title AS deal_title, d.image_url AS deal_image,
              r.id AS review_id
       FROM orders o
       JOIN deals d ON d.id = o.deal_id
       LEFT JOIN reviews r ON r.order_id = o.id
       WHERE o.user_id = ? AND o.status IN ('confirmed','shipped','delivered')
       ORDER BY datetime(o.created_at) DESC`
    )
    .all(user.id) as (Record<string, unknown> & { review_id: number | null })[];

  const eligible = orders.filter((o) => o.review_id === null);

  return NextResponse.json({ eligible });
}