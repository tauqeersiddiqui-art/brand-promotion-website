/**
 * Minimal Google OAuth 2.0 client (no external dependency).
 *
 * Setup (5 minutes):
 * 1. Go to https://console.cloud.google.com/apis/credentials
 * 2. Create OAuth client ID → Web application
 * 3. Add Authorized redirect URI:  http://localhost:3000/api/auth/google/callback
 *    (and your production URL, e.g. https://yourdomain.com/api/auth/google/callback)
 * 4. Copy Client ID + Client Secret into .env:
 *      GOOGLE_CLIENT_ID=...
 *      GOOGLE_CLIENT_SECRET=...
 * 5. Restart the server — "Continue with Google" buttons activate automatically.
 */

import { siteUrl } from "./site-url";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Public origin for building OAuth redirect URIs and user-facing redirects.
 *
 * Behind hosting proxies (e.g. Railway), the request URL points at an internal
 * host like https://localhost:10000, which would produce redirect_uri values
 * Google rejects. NEXT_PUBLIC_BASE_URL is the canonical public address; on
 * Railway, RAILWAY_PUBLIC_DOMAIN (e.g. brand-promotion-website-production.up.railway.app)
 * is used automatically via siteUrl(); fall back to the request origin locally.
 */
export function canonicalOrigin(fallbackOrigin: string): string {
  const u = siteUrl();
  if (u && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(u)) return u.replace(/\/+$/, "");
  const configured = (process.env.NEXT_PUBLIC_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  return fallbackOrigin;
}

export function googleRedirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

/** URL to send the user to; `state` is a signed CSRF token (see the start route). */
export function googleAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type GoogleProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

export async function exchangeCodeForProfile(
  code: string,
  origin: string
): Promise<GoogleProfile | { error: string }> {
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: googleRedirectUri(origin),
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!tokenRes.ok) return { error: "Google token exchange failed." };
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) return { error: "Google did not return an access token." };

    const uiRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!uiRes.ok) return { error: "Failed to fetch Google profile." };

    const profile = (await uiRes.json()) as GoogleProfile;
    if (!profile.sub || !profile.email) return { error: "Google profile incomplete." };
    return profile;
  } catch {
    return { error: "Could not reach Google. Please try again." };
  }
}
