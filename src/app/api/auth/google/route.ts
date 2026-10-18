import { NextResponse, type NextRequest } from "next/server";
import { SignJWT } from "jose";
import { googleConfigured, googleAuthUrl, canonicalOrigin } from "@/lib/google-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { ENV } from "@/lib/env";
import { headers } from "next/headers";

const secret = new TextEncoder().encode(ENV.AUTH_SECRET);

/** Step 1: redirect the user to Google with a signed CSRF state. */
export async function GET(req: NextRequest) {
  // Rate limiting
  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = await applyRateLimit("apiGeneral", ip);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const origin = canonicalOrigin(req.nextUrl.origin);

  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/login?error=google-not-configured", origin));
  }

  // `next` limited to internal paths to prevent open redirects
  const nextRaw = req.nextUrl.searchParams.get("next") || "";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "";

  // Signed, single-use-ish state: random nonce, 10-minute expiry
  const nonce = crypto.randomUUID();
  const state = await new SignJWT({ n: nonce, next })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);

  const res = NextResponse.redirect(googleAuthUrl(origin, state));
  // Short-lived cookie is compared against state at callback (double-submit CSRF)
  res.cookies.set("g_oauth_state", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}