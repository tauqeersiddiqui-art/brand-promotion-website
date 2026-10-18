import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { getCsrfTokenFromCookies } from "@/lib/csrf";
import { headers } from "next/headers";

export async function POST(req: Request) {
  // CSRF protection
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = (await getCsrfTokenFromCookies());
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}