import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { getCsrfTokenFromCookies } from "@/lib/csrf";
import { requireAdmin } from "@/lib/api-helpers";
import { fetchProductDetails } from "@/lib/product-fetch";

/** Fetch product details from an Amazon/Flipkart product URL. */
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  // CSRF protection
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = await getCsrfTokenFromCookies();
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh and try again." },
      { status: 403 }
    );
  }

  // Rate limiting
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = await applyRateLimit("apiGeneral", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { url } = body as { url?: string };
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Product URL is required." }, { status: 400 });
  }

  const result = await fetchProductDetails(url);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.hint ? { hint: result.hint } : {}) },
      { status: result.status }
    );
  }

  const { ok: _ok, ...data } = result;
  void _ok;
  return NextResponse.json({ ok: true, ...data });
}
