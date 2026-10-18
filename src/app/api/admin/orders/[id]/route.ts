import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, bad } from "@/lib/api-helpers";
import { str, parseId } from "@/lib/validation";
import { applyRateLimit } from "@/lib/rate-limit";
import { sanitizeText, sanitizeHtml } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "confirmed", "verified", "shipped", "delivered", "rejected", "cancelled"] as const;

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
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
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
  if (id === null) return bad("Invalid order id.");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid request body.");
  }

  const status = typeof body.status === "string" ? body.status : undefined;
  const adminNote = typeof body.admin_note === "string" ? sanitizeHtml(str(body.admin_note, 1000)) : undefined;
  const externalOrderId = typeof body.external_order_id === "string" ? sanitizeText(str(body.external_order_id, 80), 80) : undefined;

  if (status && !(STATUSES as readonly string[]).includes(status as (typeof STATUSES)[number])) {
    return bad("Invalid status.");
  }

  const updates: string[] = ["updated_at = datetime('now')"];
  const paramsList: (string | number)[] = [];

  if (status) {
    updates.push("status = ?");
    paramsList.push(status);
    // Stamp the delivery time once, on the transition into `delivered`, so the
    // refund return window has a stable anchor.
    if (status === "delivered") {
      updates.push("delivered_at = COALESCE(NULLIF(delivered_at, ''), datetime('now'))");
    }
  }
  if (adminNote !== undefined) {
    updates.push("admin_note = ?");
    paramsList.push(adminNote);
  }
  if (externalOrderId !== undefined) {
    updates.push("external_order_id = ?");
    paramsList.push(externalOrderId);
  }

  paramsList.push(id);

  const res = db
    .prepare(`UPDATE orders SET ${updates.join(", ")} WHERE id = ?`)
    .run(...paramsList);

  if (res.changes === 0) return bad("Order not found.", 404);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validationError = await validateRequest(req);
  if (validationError) return validationError;

  const { error } = await requireAdmin();
  if (error) return error;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return bad("Invalid order id.");

  const res = db.prepare("DELETE FROM orders WHERE id = ?").run(id);
  if (res.changes === 0) return bad("Order not found.", 404);

  return NextResponse.json({ ok: true });
}