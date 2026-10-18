import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { ENV } from "@/lib/env";

const COOKIE_NAME = "bp_session";
const secret = new TextEncoder().encode(ENV.AUTH_SECRET);

async function readSession(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as { userId?: number; role?: string };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const needsAdmin =
    pathname.startsWith("/admin") && pathname !== "/admin/login";
  const needsAuth = pathname.startsWith("/account");
  const needsAdminApi = pathname.startsWith("/api/admin");
  // Guest order submissions are allowed (Google-Form style); everything else needs auth.
  const needsUserApi =
    pathname.startsWith("/api/me") ||
    pathname.startsWith("/api/refunds") ||
    pathname.startsWith("/api/reviews") ||
    pathname.startsWith("/api/orders/me");

  if (!needsAdmin && !needsAuth && !needsAdminApi && !needsUserApi) {
    return NextResponse.next();
  }

  const session = await readSession(req);

  if (!session?.userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if ((needsAdmin || needsAdminApi) && session.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/admin/login?error=admin-only", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/account/:path*",
    "/api/admin/:path*",
    "/api/orders/me/:path*",
    "/api/refunds/:path*",
    "/api/reviews/:path*",
    "/api/me/:path*",
  ],
};