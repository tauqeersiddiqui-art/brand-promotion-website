import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "bp_session";

// Lazy load AUTH_SECRET to avoid throwing at module load time during build
function getSecret(): Uint8Array {
  const authSecret = process.env.AUTH_SECRET || "";
  return new TextEncoder().encode(authSecret);
}

async function readSession(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as { userId?: number; role?: string };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Legacy proof URLs stay valid but are served through the authorised file
  // route, so old screenshots are no longer world-readable.
  if (pathname.startsWith("/uploads/")) {
    const target = new URL(`/api/files/${pathname.slice("/uploads/".length)}`, req.url);
    return NextResponse.rewrite(target);
  }

  const needsAdmin =
    pathname.startsWith("/admin") && pathname !== "/admin/login";
  const needsMediator = pathname.startsWith("/mediator");
  const needsAuth = pathname.startsWith("/account") || needsMediator;
  const needsAdminApi = pathname.startsWith("/api/admin");
  const needsMediatorApi = pathname.startsWith("/api/mediator");
  // Authenticated API prefixes. Order, claim and track routes verify the
  // session inside the handler (after CSRF) so they can return richer errors.
  const needsUserApi =
    pathname.startsWith("/api/me") ||
    pathname.startsWith("/api/refunds") ||
    pathname.startsWith("/api/reviews") ||
    pathname.startsWith("/api/orders/me");

  if (!needsAdmin && !needsAuth && !needsAdminApi && !needsUserApi && !needsMediatorApi) {
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

  if (
    (needsMediator || needsMediatorApi) &&
    session.role !== "mediator" &&
    session.role !== "admin"
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Mediator access required." }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/account", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/account/:path*",
    "/mediator/:path*",
    "/api/admin/:path*",
    "/api/mediator/:path*",
    "/api/orders/me/:path*",
    "/api/refunds/:path*",
    "/api/reviews/:path*",
    "/api/me/:path*",
    "/uploads/:path*",
  ],
};