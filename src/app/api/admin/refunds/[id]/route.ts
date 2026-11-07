import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, bad } from "@/lib/api-helpers";
import { str, oneOf, parseId } from "@/lib/validation";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { sanitizeHtml, sanitizeText } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";
import { releaseDealSlot } from "@/lib/deal-slots";

export const dynamic = "force-dynamic";

const DECISIONS = ["approved", "rejected", "processed"] as const;

async function validateRequest(req: Request): Promise<NextResponse | null> {
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = (await getCsrfTokenFromCookies());
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  // Rate limiting
  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  return null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validationError = await validateRequest(req);
  if (validationError) return validationError;

  const { error } = await requireAdmin();
  if (error) return error;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return bad("Invalid refund id.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request body.");
  }
  const b = body as Record<string, unknown>;
  const decision = oneOf(b.status, DECISIONS, "" as never) as (typeof DECISIONS)[number] | "";
  if (!decision) return bad("Invalid decision.");
  const adminNote = sanitizeHtml(str(b.admin_note, 500));

  const refund = db.prepare("SELECT id, order_id FROM refunds WHERE id = ?").get(id) as
    | { id: number; order_id: number }
    | undefined;
  if (!refund) return bad("Refund not found.", 404);

  db.prepare(
    "UPDATE refunds SET status = ?, admin_note = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(decision, adminNote, id);

  // If refund processed/approved, cancel the linked order so stock/status stay consistent
  if (decision === "processed" || decision === "approved") {
    const order = db
      .prepare("SELECT status, deal_id FROM orders WHERE id = ?")
      .get(refund.order_id) as { status: string; deal_id: number | null } | undefined;
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(refund.order_id);
    // Frees the campaign slot so a paid-out order is no longer counted as claimed.
    if (order && order.status !== "cancelled" && order.status !== "rejected") {
      releaseDealSlot(order.deal_id);
    }
  }

  return NextResponse.json({ ok: true });
}