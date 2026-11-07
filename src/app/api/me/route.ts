import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The single source of truth for "who is logged in".
 *
 * There used to be two endpoints (/api/me and /api/auth/me) with different
 * shapes and caching, consumed by different components — which is how the
 * navbar could say "logged in" while the form below said "log in to continue".
 * Always returns `{ user: null }` for guests so callers need no status check.
 */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(
    {
      user: user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
