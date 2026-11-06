import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applyRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: idRaw } = await params;
  const id = parseInt(idRaw, 10);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  }
  const deal = db
    .prepare(
      `SELECT id, product_code, title, description, category, platform, deal_type,
              image_url, deal_url, target_keyword, instructions, coupon_code,
              price_original, price_sale, refund_amount, total_slots, claimed_slots,
              stock, featured, active, created_at
       FROM deals WHERE id = ? AND active = 1 AND approval_status = 'approved'`
    )
    .get(id);
  if (!deal) {
    return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  }
  return NextResponse.json({ deal });
}