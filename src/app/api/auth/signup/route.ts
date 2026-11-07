import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  hashPassword,
  createSessionToken,
  setSessionCookie,
  isAdminEmail,
} from "@/lib/auth";
import { str, isEmail, isStrongPassword } from "@/lib/validation";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { bad } from "@/lib/api-helpers";
import { sanitizeText, sanitizePhone } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";

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

  // Rate limiting
  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("signup", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many signup attempts. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
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
  const name = sanitizeText(str(b.name, 80), 80);
  const email = str(b.email, 254).toLowerCase().trim();
  const phone = sanitizePhone(str(b.phone, 15));
  const password = typeof b.password === "string" ? b.password : "";

  // Validation
  if (name.length < 2) return bad("Please enter your full name (at least 2 characters).");
  if (!isEmail(email)) return bad("Please enter a valid email address.");
  if (!isStrongPassword(password))
    return bad("Password must be 8-128 characters and include at least one letter and one number.");
  if (phone && phone.length !== 10) return bad("Please enter a valid 10-digit Indian phone number.");

  // Check existing user
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
  if (existing) return bad("An account with this email already exists.", 409);

  // Admin assignment logic
  let role: "user" | "admin" = "user";
  if (isAdminEmail(email)) {
    const anyAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as { id: number } | undefined;
    if (!anyAdmin) role = "admin";
  }

  const passwordHash = await hashPassword(password);
  const info = db
    .prepare("INSERT INTO users (name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)")
    .run(name, email, passwordHash, phone || null, role);

  const token = await createSessionToken({
    userId: Number(info.lastInsertRowid),
    email,
    role,
    name,
  });
  await setSessionCookie(token);

  return NextResponse.json({
    user: { id: Number(info.lastInsertRowid), name, email, role },
  });
}