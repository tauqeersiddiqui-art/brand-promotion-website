import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, bad } from "@/lib/api-helpers";
import { str } from "@/lib/validation";
import { getSettings, updateSettings, type SiteSettings } from "@/lib/settings";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { sanitizeHtml, sanitizeText } from "@/lib/sanitize";

/** Keep the country code intact: +91 85273 24446 -> 918527324446. */
function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

async function validateRequest(req: Request): Promise<NextResponse | null> {
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = (await getCsrfTokenFromCookies());
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  // Rate limiting
  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  return null;
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json({ settings: getSettings() });
}

export async function PATCH(req: Request) {
  const validationError = await validateRequest(req);
  if (validationError) return validationError;

  const { error } = await requireAdmin();
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request body.");
  }
  const b = body as Record<string, unknown>;

  const partial: Partial<SiteSettings> = {};
  (Object.keys(getSettings()) as (keyof SiteSettings)[]).forEach((key) => {
    if (key in b) {
      const maxLen = key === "rules_instructions" || key === "announcement" ? 5000 : 500;
      // Sanitize based on field type
      if (key === "rules_instructions" || key === "announcement") {
        partial[key] = sanitizeHtml(str(b[key], maxLen));
      } else if (key === "whatsapp") {
        partial[key] = normalizeWhatsapp(str(b[key], maxLen));
      } else {
        partial[key] = sanitizeText(str(b[key], maxLen), maxLen);
      }
    }
  });

  // Basic sanity: whatsapp should be digits after cleaning, with country code
  if (partial.whatsapp) {
    if (partial.whatsapp.length < 10 || partial.whatsapp.length > 15)
      return bad("WhatsApp number must be 10-15 digits (with country code).");
  }
  if (partial.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(partial.support_email))
    return bad("Support email is not valid.");

  updateSettings(partial);
  return NextResponse.json({ ok: true, settings: getSettings() });
}