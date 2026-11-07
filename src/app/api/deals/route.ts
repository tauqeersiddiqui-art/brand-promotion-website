import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { queryDeals } from "@/lib/deals-query";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Rate limiting
  const reqHeaders = await headers();
  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("apiGeneral", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const sp = req.nextUrl.searchParams;
  // Honour an explicit `limit` (clamped). The order-proof form requests
  // `?limit=50` to populate its campaign dropdown.
  const requestedLimit = parseInt(sp.get("limit") || "", 10);
  const perPage =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(100, requestedLimit)
      : 12;

  return NextResponse.json(
    queryDeals({
      search: sp.get("search"),
      category: sp.get("category"),
      platform: sp.get("platform"),
      sort: sp.get("sort"),
      page: Math.max(1, parseInt(sp.get("page") || "1", 10) || 1),
      limit: perPage,
    })
  );
}
