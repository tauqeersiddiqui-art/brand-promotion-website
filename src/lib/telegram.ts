/**
 * Telegram channel auto-posting.
 *
 * Setup (5 minutes):
 * 1. Open Telegram, chat with @BotFather -> /newbot -> copy the bot token
 * 2. Add the bot to your channel (@brandreviewer) as an admin with the
 *    "Post messages" permission
 * 3. Set the env vars:
 *      TELEGRAM_BOT_TOKEN=123456:ABC...
 *      TELEGRAM_CHAT_ID=@brandreviewer   (optional, this is the default)
 *
 * New campaigns are auto-posted when created in Admin -> Deals, and any
 * campaign can be re-posted with the "Post TG" button next to it.
 */

export type TelegramDeal = {
  id: number;
  title: string;
  platform?: string;
  deal_type?: string;
  price_sale: number;
  cashback_amount?: number;
  image_url?: string;
  target_keyword?: string;
  total_slots?: number;
};

const DEFAULT_CHAT_ID = "@brandreviewer";

export function telegramConfigured(): boolean {
  return Boolean((process.env.TELEGRAM_BOT_TOKEN || "").trim());
}

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function inr(n: number): string {
  return "\u20B9" + n.toLocaleString("en-IN");
}

export async function postDealToTelegram(
  deal: TelegramDeal
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    return { ok: false, skipped: true, error: "TELEGRAM_BOT_TOKEN is not configured." };
  }
  const chatId = (process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID).trim();

  const dealUrl = `${siteBase()}/deal/${deal.id}`;
  const lines: (string | null)[] = [
    `\u{1F525} NEW CAMPAIGN: ${deal.title}`,
    "",
    `\u{1F4B0} Price: ${inr(deal.price_sale)}`,
    deal.cashback_amount && deal.cashback_amount > 0
      ? `\u{1F381} Cashback: ${inr(deal.cashback_amount)}`
      : null,
    deal.platform ? `\u{1F6D2} Buy on: ${deal.platform}` : null,
    deal.total_slots && deal.total_slots > 0 ? `\u{1F3AB} Slots: ${deal.total_slots}` : null,
    deal.target_keyword ? `\u{1F50D} Keyword: ${deal.target_keyword}` : null,
    "",
    "\u{2705} Buy it, review it honestly, get cashback via UPI.",
    dealUrl,
  ];
  const caption = lines.filter((l): l is string => l !== null).join("\n").slice(0, 1024);

  const replyMarkup = { inline_keyboard: [[{ text: "View deal", url: dealUrl }]] };
  const hasPhoto = Boolean(deal.image_url && /^https?:\/\//i.test(deal.image_url));

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/${hasPhoto ? "sendPhoto" : "sendMessage"}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          hasPhoto
            ? { chat_id: chatId, photo: deal.image_url, caption, reply_markup: replyMarkup }
            : {
                chat_id: chatId,
                text: caption,
                disable_web_page_preview: false,
                reply_markup: replyMarkup,
              }
        ),
        signal: AbortSignal.timeout(10000),
      }
    );
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.description || `Telegram API error (HTTP ${res.status})` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error while calling Telegram.",
    };
  }
}
