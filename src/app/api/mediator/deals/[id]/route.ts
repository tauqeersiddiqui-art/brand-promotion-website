import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireMediator, bad } from "@/lib/api-helpers";
import { parseId } from "@/lib/validation";
import { getCsrfTokenFromCookies } from "@/lib/csrf";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/** A mediator may withdraw a campaign that is still pending or was rejected. */
export async function DELETE(
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

  const { user, error } = await requireMediator();
  if (error) return error;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return bad("Invalid campaign id.");

  const res = db
    .prepare(
      `DELETE FROM deals
        WHERE id = ? AND submitted_by = ?
          AND approval_status IN ('pending','rejected')`
    )
    .run(id, user.id);

  if (res.changes === 0) {
    return bad("Campaign not found or already approved.", 404);
  }
  return NextResponse.json({ ok: true });
}
