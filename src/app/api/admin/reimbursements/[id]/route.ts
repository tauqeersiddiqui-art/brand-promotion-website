import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, bad } from "@/lib/api-helpers";
import { str, parseId } from "@/lib/validation";
import { applyRateLimit } from "@/lib/rate-limit";
import { sanitizeText, sanitizeHtml } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "under_review", "approved", "paid", "rejected"] as const;

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
  if (id === null) return bad("Invalid reimbursement ID.");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid request body.");
  }

  const status = typeof body.status === "string" ? body.status : undefined;
  const utrNumber = typeof body.utr_number === "string" ? sanitizeText(str(body.utr_number, 60), 60).trim() : undefined;
  const adminNote = typeof body.admin_note === "string" ? sanitizeHtml(str(body.admin_note, 1000)) : undefined;
  const amount = typeof body.amount === "number" ? body.amount : undefined;

  if (status && !(STATUSES as readonly string[]).includes(status as (typeof STATUSES)[number])) {
    return bad("Invalid reimbursement status.");
  }

  // Get current reimbursement
  const current = db
    .prepare("SELECT status, utr_number, amount FROM reimbursements WHERE id = ?")
    .get(id) as { status: string; utr_number: string; amount: number } | undefined;

  if (!current) return bad("Reimbursement not found.", 404);

  // Validate state transitions
  const validTransitions: Record<string, string[]> = {
    pending: ["under_review", "rejected"],
    under_review: ["approved", "rejected"],
    approved: ["paid", "rejected"],
    paid: [], // Terminal state
    rejected: [], // Terminal state
  };

  if (status && status !== current.status) {
    const allowed = validTransitions[current.status] || [];
    if (!allowed.includes(status)) {
      return bad(
        `Invalid status transition: "${current.status}" → "${status}". Allowed: ${allowed.join(", ") || "none (terminal state)"}`,
        400
      );
    }
  }

  // Require UTR when transitioning to paid
  if (status === "paid" && current.status !== "paid") {
    const finalUtr = utrNumber || current.utr_number;
    if (!finalUtr || finalUtr.trim() === "") {
      return bad("UTR number is required when marking reimbursement as paid.", 400);
    }
  }

  // Prevent amount changes after approval
  if (amount !== undefined && ["approved", "paid"].includes(current.status)) {
    return bad("Cannot change amount after reimbursement is approved or paid.", 400);
  }

  // Prevent double payment
  if (status === "paid" && current.status === "paid") {
    return bad("Reimbursement is already paid.", 409);
  }

  const updates: string[] = ["updated_at = datetime('now')"];
  const paramsList: (string | number)[] = [];

  if (status) {
    updates.push("status = ?");
    paramsList.push(status);
  }
  if (utrNumber !== undefined) {
    updates.push("utr_number = ?");
    paramsList.push(utrNumber);
  }
  if (adminNote !== undefined) {
    updates.push("admin_note = ?");
    paramsList.push(adminNote);
  }
  if (amount !== undefined && amount >= 0) {
    updates.push("amount = ?");
    paramsList.push(amount);
  }

  paramsList.push(id);

  const res = db
    .prepare(`UPDATE reimbursements SET ${updates.join(", ")} WHERE id = ?`)
    .run(...paramsList);

  if (res.changes === 0) return bad("Reimbursement not found.", 404);

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
  if (id === null) return bad("Invalid reimbursement ID.");

  const res = db.prepare("DELETE FROM reimbursements WHERE id = ?").run(id);
  if (res.changes === 0) return bad("Reimbursement not found.", 404);

  return NextResponse.json({ ok: true });
}