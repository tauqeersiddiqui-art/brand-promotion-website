import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { headers } from "next/headers";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/** Counts a click and 302s to the external deal URL with click tracking.
 *  Guest clicks are attributed with a null user_id so tracking never blocks
 *  navigation to a deal. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idRaw } = await params;
  const id = parseInt(idRaw, 10);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.redirect(new URL("/browse", req.url));
  }

  const deal = db
    .prepare("SELECT deal_url FROM deals WHERE id = ? AND active = 1")
    .get(id) as { deal_url: string } | undefined;

  if (!deal || !deal.deal_url || !/^https?:\/\//i.test(deal.deal_url)) {
    return NextResponse.redirect(new URL("/browse", req.url));
  }

  const reqHeaders = await headers();

  let userId: number | null = null;
  try {
    const session = await getSession();
    if (session?.userId) userId = session.userId;
  } catch {
    // Auth unavailable; record the click anonymously.
  }

  const clickId = crypto.randomUUID();

  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const userAgent = reqHeaders.get("user-agent") || "";
  const referrer = reqHeaders.get("referer") || "";

  try {
    db.prepare(`
      INSERT INTO click_tracking (click_id, deal_id, user_id, ip, user_agent, referrer)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(clickId, id, userId, ip, userAgent, referrer);
  } catch {
    // Ignore tracking errors, don't block redirect.
  }

  const redirectUrl = new URL(deal.deal_url);
  redirectUrl.searchParams.set("ref", clickId);

  return NextResponse.redirect(redirectUrl.toString(), 302);
}
