import { db } from "./db";

export type SiteSettings = {
  site_name: string;
  tagline: string;
  announcement: string;
  whatsapp: string;
  telegram: string;
  support_email: string;
  instagram: string;
  mediators: string;
  rules_instructions: string;
};

const DEFAULTS: SiteSettings = {
  site_name: "Brand Promotion",
  tagline: "India's #1 Influencer Cashback & Brand Promotion Platform",
  announcement: "🔥 100% Cashback Campaign Live! Buy on Amazon/Flipkart, share review & get instant UPI payout.",
  whatsapp: "918527324446",
  telegram: "brandreviewer",
  support_email: "support@brandpromotion.in",
  instagram: "brandpromotion.in",
  mediators: "Direct,Amit Mediator,Rahul Agency,Pooja Deals,VIP Campaigns,Social Reach",
  rules_instructions: "1. Check available slots before ordering.\n2. Search product with specified keyword on Amazon/Flipkart.\n3. Upload the order confirmation screenshot (must show the Order ID).\n4. After delivery, post a genuine 5-star review with photos.\n5. Once the return window closes, claim cashback with your review screenshot and an order-page screenshot showing the Order ID and 'Return window closed'.",
};

export function getSettings(): SiteSettings {
  try {
    const rows = db.prepare("SELECT key, value FROM settings").all() as {
      key: string;
      value: string;
    }[];
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { ...DEFAULTS, ...map } as SiteSettings;
  } catch {
    return DEFAULTS;
  }
}

export function updateSettings(partial: Partial<SiteSettings>) {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  for (const [key, value] of Object.entries(partial)) {
    if (key in DEFAULTS && typeof value === "string") {
      stmt.run(key, value.slice(0, 5000));
    }
  }
}

export function whatsappLink(num: string, text?: string): string {
  let clean = num.replace(/[^0-9]/g, "");
  // wa.me requires a country code. Older saves of "918527324446" were reduced
  // to the bare 10-digit local number by the generic phone sanitizer, which
  // turned into a US number. Restore the Indian country code on read.
  if (clean.length === 10) clean = `91${clean}`;
  if (clean.length === 11 && clean.startsWith("0")) clean = `91${clean.slice(1)}`;
  const t = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${clean}${t}`;
}

export function telegramLink(handle: string): string {
  const clean = handle.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
  return `https://t.me/${clean}`;
}
