import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, bad } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/rate-limit";
import { parseId } from "@/lib/validation";
import { getCsrfTokenFromCookies } from "@/lib/csrf";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const ROLES = ["user", "admin", "mediator"] as const;
const MEDIATOR_STATUSES = ["active", "suspended"] as const;

/** Promote/demote an account or suspend a mediator. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = await getCsrfTokenFromCookies();
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const { user: admin, error } = await requireAdmin();
  if (error) return error;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return bad("Invalid user id.");

  const target = db
    .prepare("SELECT id, role, mediator_code, mediator_status FROM users WHERE id = ?")
    .get(id) as
    | { id: number; role: string; mediator_code: string; mediator_status: string }
    | undefined;
  if (!target) return bad("User not found.", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Invalid form data.");
  }

  const role = String(form.get("role") || "");
  const mediatorStatus = String(form.get("mediator_status") || "");
  if (role && !ROLES.includes(role as (typeof ROLES)[number])) {
    return bad("Invalid role.");
  }
  if (mediatorStatus && !MEDIATOR_STATUSES.includes(mediatorStatus as (typeof MEDIATOR_STATUSES)[number])) {
    return bad("Invalid mediator status.");
  }

  const nextRole = role || target.role;
  const nextMediatorStatus =
    mediatorStatus || (nextRole === "mediator" ? target.mediator_status || "active" : target.mediator_status);
  const nextCode =
    target.mediator_code || (nextRole === "mediator" ? `MED-${String(id).padStart(4, "0")}` : "");

  if (id === admin.id && nextRole !== "admin") {
    return bad("You cannot remove your own admin access.");
  }
  if (target.role === "admin" && nextRole !== "admin") {
    const admins = (db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get() as {
      c: number;
    }).c;
    if (admins <= 1) return bad("At least one admin account is required.");
  }

  db.prepare(
    `UPDATE users
        SET role = ?, mediator_code = ?, mediator_status = ?
      WHERE id = ?`
  ).run(nextRole, nextCode, nextMediatorStatus, id);

  return NextResponse.json({
    ok: true,
    user: { id, role: nextRole, mediator_code: nextCode, mediator_status: nextMediatorStatus },
    note:
      nextRole !== target.role
        ? "The account must sign out and back in for the new role to take effect."
        : "",
  });
}
