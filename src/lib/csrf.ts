import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const CSRF_COOKIE_NAME = "bp_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Generate a cryptographically secure CSRF token.
 * Uses Web Crypto API for proper entropy.
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Set the CSRF token as a secure HttpOnly cookie.
 * Also sets a non-HttpOnly "synchronizer" cookie for JavaScript access.
 */
export async function setCsrfCookie(token: string) {
  const store = await cookies();

  // HttpOnly cookie for server-side validation (sent automatically with requests)
  store.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict", // Strict prevents CSRF from external origins
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  // Non-HttpOnly cookie for JavaScript to read and send in headers
  store.set(`${CSRF_COOKIE_NAME}_js`, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

/**
 * Read CSRF token from cookies (server-side).
 */
export async function getCsrfTokenFromCookies(): Promise<string | null> {
  const store = await cookies();
  return store.get(CSRF_COOKIE_NAME)?.value ?? null;
}

/**
 * Validate CSRF token from request.
 * Checks both cookie (auto-sent) and header (for fetch/ajax).
 */
export async function validateCsrfToken(req: NextRequest): Promise<boolean> {
  const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = req.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(cookieToken, headerToken);
}

/**
 * Constant-time string comparison.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Middleware to protect mutating endpoints with CSRF validation.
 * Returns NextResponse with 403 if validation fails, null if passes.
 */
export async function csrfProtection(req: NextRequest): Promise<NextResponse | null> {
  // Only protect mutating methods
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return null;
  }

  // Skip for certain paths that don't need CSRF (e.g., webhooks, OAuth callbacks)
  const pathname = req.nextUrl.pathname;
  const skipPaths = [
    "/api/auth/google/callback",
    "/api/auth/logout", // logout is safe (destroys session)
    "/api/upload", // handled separately with its own validation
    "/api/track", // public tracking
    "/api/reviews/eligible", // public
  ];
  if (skipPaths.some((p) => pathname.startsWith(p))) {
    return null;
  }

  const valid = await validateCsrfToken(req);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Get CSRF token for client-side use (e.g., in forms or fetch headers).
 * This should be called from a server component or API route that sets the cookie.
 */
export async function getCsrfTokenForClient(): Promise<string> {
  let token = await getCsrfTokenFromCookies();
  if (!token) {
    token = generateCsrfToken();
    await setCsrfCookie(token);
  }
  return token;
}

/**
 * Helper to add CSRF token to fetch requests from client components.
 * Usage: const headers = await getCsrfHeaders(); fetch('/api/...', { headers, ... })
 */
export async function getCsrfHeaders(): Promise<HeadersInit> {
  // Client-side: read from the non-HttpOnly cookie
  if (typeof window !== "undefined") {
    const cookies = document.cookie.split("; ").reduce((acc, c) => {
      const [k, ...v] = c.split("=");
      acc[k] = v.join("=");
      return acc;
    }, {} as Record<string, string>);

    const token = cookies[`${CSRF_COOKIE_NAME}_js`];
    if (token) {
      return { [CSRF_HEADER_NAME]: token };
    }
  }
  return {};
}