import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, bad } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/rate-limit";
import { getCsrfTokenFromCookies } from "@/lib/csrf";
import { postDealToTelegram, type TelegramDeal } from "@/lib/telegram";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/** Re-post a campaign to the Telegram channel. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = await getCsrfTokenFromCookies();
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const { error } = await requireAdmin();
  if (error) return error;

  const { id: idRaw } = await params;
  const id = parseInt(idRaw, 10);
  if (!Number.isInteger(id) || id < 1) return bad("Invalid deal id.");

  const deal = db
    .prepare(
      `SELECT id, title, platform, deal_type, price_sale, cashback_amount,
              image_url, target_keyword, total_slots
       FROM deals WHERE id = ? AND approval_status = 'approved'`
    )
    .get(id) as TelegramDeal | undefined;
  if (!deal) return bad("Campaign not found or not approved yet.");

  const result = await postDealToTelegram(deal);

  if (result.skipped) {
    return NextResponse.json(
      {
        ok: false,
        skipped: true,
        error:
          "Telegram is not configured yet. Create a bot with @BotFather, add it to your channel as an admin, then set TELEGRAM_BOT_TOKEN on the server.",
      },
      { status: 400 }
    );
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
