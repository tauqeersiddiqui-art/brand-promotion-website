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

// Single source of truth for the top banner. Edit this line and redeploy —
// it always wins over any stale value persisted in the database.
export const ANNOUNCEMENT = "🔥 New deals added daily! Find verified discounts on Amazon, Flipkart, and brand stores.";

const DEFAULTS: SiteSettings = {
  site_name: "Brand Deals Hub",
  tagline: "India's #1 Verified Deal Discovery Platform",
  announcement: ANNOUNCEMENT,
  whatsapp: "918527324446",
  telegram: "branddeals",
  support_email: "support@branddeals.in",
  instagram: "branddeals.in",
  mediators: "Support Team,Deal Curators,VIP Shoppers",
  rules_instructions: "1. Browse verified deals on our platform.\n2. Click 'Shop on' to visit the store directly.\n3. Apply the deal code at checkout.\n4. Contact store support for order issues.",
};

// Settings are read by the layout, the footer and several pages on every
// request; a 30s cache removes repeated SQLite round-trips without making admin
// edits feel stale (updateSettings clears it immediately).
const CACHE_MS = 30_000;
let cached: { value: SiteSettings; at: number } | null = null;

export function getSettings(): SiteSettings {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  try {
    const rows = db.prepare("SELECT key, value FROM settings").all() as {
      key: string;
      value: string;
    }[];
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    // The announcement is code-driven (see ANNOUNCEMENT above) so a deploy
    // always reflects the latest header line; never trust a persisted value.
    const value = { ...DEFAULTS, ...map, announcement: ANNOUNCEMENT } as SiteSettings;
    cached = { value, at: now };
    return value;
  } catch {
    return DEFAULTS;
  }
}

export function updateSettings(partial: Partial<SiteSettings>) {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  for (const [key, value] of Object.entries(partial)) {
    if (key === "announcement") continue; // code-driven, not persisted
    if (key in DEFAULTS && typeof value === "string") {
      stmt.run(key, value.slice(0, 5000));
    }
  }
  cached = null;
}

export function whatsappLink(num: string, text?: string): string {
  let clean = num.replace(/[^0-9]/g, "");
  if (clean.length === 10) clean = `91${clean}`;
  if (clean.length === 11 && clean.startsWith("0")) clean = `91${clean.slice(1)}`;
  const t = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${clean}${t}`;
}

export function telegramLink(handle: string): string {
  const clean = handle.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
  return `https://t.me/${clean}`;
}
