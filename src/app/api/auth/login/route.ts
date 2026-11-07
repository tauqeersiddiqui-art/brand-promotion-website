import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { str, isEmail } from "@/lib/validation";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { bad } from "@/lib/api-helpers";
import { sanitizeText, sanitizePhone } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";

// Dummy hash so timing is similar whether or not the account exists
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZUbE0fFbGmSvVAtLzKC9kOqFvWtN8O";

export async function POST(req: Request) {
  // CSRF protection
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = (await getCsrfTokenFromCookies());
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh and try again." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request body.");
  }
  const b = body as Record<string, unknown>;

  // Input sanitization
  const email = sanitizeText(str(b.email, 254), 254).toLowerCase().trim();
  const password = typeof b.password === "string" ? b.password : "";

  // Rate limiting: a per-IP bucket stops spraying, and a per-email bucket stops
  // a distributed attacker from hammering one account from rotating IPs.
  const ip = clientIpFromHeaders(reqHeaders);
  const rlIp = await applyRateLimit("loginIp", ip);
  const rlEmail = email ? await applyRateLimit("login", email) : { ok: true, retryAfter: 0 };
  if (!rlIp.ok || !rlEmail.ok) {
    const retryAfter = Math.max(rlIp.retryAfter, rlEmail.retryAfter);
    return NextResponse.json(
      { error: `Too many login attempts. Try again in ${retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  if (!isEmail(email) || !password) return bad("Enter your email and password.");

  const user = db
    .prepare("SELECT id, name, email, password_hash, role FROM users WHERE email = ?")
    .get(email) as
    | { id: number; name: string; email: string; password_hash: string; role: string }
    | undefined;

  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    return bad("Incorrect email or password.", 401);
  }

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    role: user.role === "admin" ? "admin" : user.role === "mediator" ? "mediator" : "user",
    name: user.name,
  });
  await setSessionCookie(token);

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}