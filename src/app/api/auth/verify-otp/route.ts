import { NextResponse } from "next/server";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";
import { bad } from "@/lib/api-helpers";
import { verifyOtp } from "@/lib/otp";
import { createSessionToken, setSessionCookie } from "@/lib/auth";

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
  const code = typeof b.code === "string" ? b.code.trim() : "";
  const purpose = typeof b.purpose === "string" ? b.purpose : "login";

  if (!rawPhone) return bad("Phone number is required.");
  if (!code || code.length !== 6) return bad("Enter the 6-digit OTP code.");

  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length !== 10) return bad("Please enter a valid 10-digit mobile number.");

  const result = await verifyOtp(rawPhone, code, purpose);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const token = await createSessionToken({
    userId: result.userId!,
    email: result.email || `${rawPhone}@magic.phone`,
    role: (result.role as "user" | "admin" | "mediator") || "user",
    name: result.userName || rawPhone,
  });
  await setSessionCookie(token);

  return NextResponse.json({
    ok: true,
    user: {
      id: result.userId,
      name: result.userName || rawPhone,
      email: result.email || `${rawPhone}@magic.phone`,
      role: result.role || "user",
      isNewUser: result.isNewUser,
    },
  });
}
