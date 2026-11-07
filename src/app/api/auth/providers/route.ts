import { NextResponse } from "next/server";
import { googleConfigured } from "@/lib/google-auth";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { headers } from "next/headers";

/** Public: tells the login UI whether Google sign-in is available. */
export async function GET() {
  // Light rate limiting
  const reqHeaders = await headers();
  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("apiGeneral", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  return NextResponse.json({ google: googleConfigured() });
}