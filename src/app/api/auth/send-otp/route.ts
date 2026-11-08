import { NextResponse } from "next/server";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";
import { bad } from "@/lib/api-helpers";
import { storeAndSendOtp, validatePhone } from "@/lib/otp";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = await getCsrfTokenFromCookies();
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request body.");
  }
  const b = body as Record<string, unknown>;
  const rawPhone = typeof b.phone === "string" ? b.phone.trim() : "";
  const purpose = typeof b.purpose === "string" ? b.purpose : "login";

  if (!rawPhone) return bad("Phone number is required.");

  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("loginIp", ip);
  if (!rl.ok) {
    return NextResponse.json({ error: `Too many requests. Try again in ${rl.retryAfter}s.` }, { status: 429 });
  }

  const phoneCheck = validatePhone(rawPhone);
  if (!phoneCheck.ok) return bad(phoneCheck.error!);

  const result = await storeAndSendOtp(phoneCheck.phone!, purpose);
  if (!result.ok) return bad(result.error || "Failed to send OTP.");

  // Debug mode: return OTP code to client for testing (set NEXT_PUBLIC_LOG_OTP=true)
  const debugMode = process.env.NEXT_PUBLIC_LOG_OTP === "true";
  if (debugMode && result.code) {
    return NextResponse.json({
      ok: true,
      message: `OTP delivered via ${result.delivery || "console"}.`,
      delivery: result.delivery,
      debug: true,
      code: result.code,
    });
  }

  // Fallback: if no delivery method worked, return code for debugging
  if (!result.delivery || result.delivery === "none") {
    return NextResponse.json({
      ok: true,
      message: "OTP generated. Check console logs or debug mode.",
      delivery: "none",
      debug: true,
      code: result.code,
    });
  }

  return NextResponse.json({
    ok: true,
    message: result.delivery === "telegram" ? "OTP sent via Telegram." : "OTP sent successfully.",
    delivery: result.delivery,
  });
}
