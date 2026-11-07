import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import {
  createSessionToken,
  setSessionCookie,
  hashPassword,
} from "@/lib/auth";
import { exchangeCodeForProfile, googleConfigured, canonicalOrigin } from "@/lib/google-auth";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import crypto from "crypto";
import { ENV } from "@/lib/env";
import { headers } from "next/headers";

const secret = new TextEncoder().encode(ENV.AUTH_SECRET);

function fail(req: NextRequest, reason: string) {
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(reason)}`, canonicalOrigin(req.nextUrl.origin))
  );
}

/** Step 2: verify state, exchange code, link or create the user, issue session. */
export async function GET(req: NextRequest) {
  if (!googleConfigured()) return fail(req, "google-not-configured");

  // Rate limiting
  const reqHeaders = await headers();
  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("apiGeneral", ip);
  if (!rl.ok) return fail(req, "Too many attempts. Try again shortly.");

  const params = req.nextUrl.searchParams;
  const oauthError = params.get("error");
  if (oauthError) return fail(req, oauthError === "access_denied" ? "Google sign-in was cancelled." : oauthError);

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail(req, "Invalid Google response.");

  // Verify signed state + double-submit cookie
  let nonce = "";
  let next = "";
  try {
    const { payload } = await jwtVerify(state, secret);
    if (typeof payload.n === "string") nonce = payload.n;
    if (typeof payload.next === "string") next = payload.next;
  } catch {
    return fail(req, "Sign-in session expired. Please try again.");
  }
  const cookieNonce = req.cookies.get("g_oauth_state")?.value || "";
  if (!nonce || nonce !== cookieNonce) {
    return fail(req, "Security check failed (state mismatch). Please try again.");
  }

  const profile = await exchangeCodeForProfile(code, canonicalOrigin(req.nextUrl.origin));
  if ("error" in profile) return fail(req, profile.error);

  const email = profile.email.toLowerCase().trim();

  // Linking a Google identity to an existing password account is only safe when
  // Google has verified the address; otherwise an unverified profile could
  // take over an account that happens to use the same email.
  if (!profile.email_verified) {
    return fail(req, "Your Google email is not verified.");
  }

  // 1) Already linked via Google?
  let user = db
    .prepare("SELECT id, name, email, role FROM users WHERE google_id = ?")
    .get(profile.sub) as { id: number; name: string; email: string; role: string } | undefined;

  // 2) Existing credentials account with the same email → link it
  if (!user) {
    const byEmail = db
      .prepare("SELECT id, name, email, role, password_hash, google_id FROM users WHERE email = ?")
      .get(email) as
      | { id: number; name: string; email: string; role: string; password_hash: string; google_id: string | null }
      | undefined;

    if (byEmail) {
      if (!byEmail.google_id) {
        db.prepare("UPDATE users SET google_id = ?, provider = 'google' WHERE id = ?").run(
          profile.sub,
          byEmail.id
        );
      }
      user = { id: byEmail.id, name: byEmail.name, email: byEmail.email, role: byEmail.role };
    }
  }

  // 3) New user → auto-create account (Google verifies the email for us)
  if (!user) {
    const name = (profile.name || email.split("@")[0]).slice(0, 80);
    const randomPassword = await hashPassword(crypto.randomBytes(24).toString("hex"));
    const info = db
      .prepare(
        "INSERT INTO users (name, email, password_hash, provider, google_id) VALUES (?, ?, ?, 'google', ?)"
      )
      .run(name, email, randomPassword, profile.sub);
    user = {
      id: Number(info.lastInsertRowid),
      name,
      email,
      role: "user",
    };
  }

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    role: user.role === "admin" ? "admin" : "user",
    name: user.name,
  });
  const target = next || "/account";
  const res = NextResponse.redirect(new URL(target, canonicalOrigin(req.nextUrl.origin)));
  await setSessionCookie(token);
  res.cookies.set("g_oauth_state", "", { path: "/", maxAge: 0 });
  return res;
}