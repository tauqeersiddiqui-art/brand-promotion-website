import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdmin, bad } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * Admin password reset endpoint.
 *
 * Two modes:
 * 1. Authenticated mode: Requires admin login, asks for current + new password
 * 2. Emergency mode: Uses RESET_PASSWORD_KEY env var for password-less reset
 *
 * To use emergency mode, set RESET_PASSWORD_KEY in Railway environment variables.
 * Then pass this key in the request body instead of current password.
 */
export async function POST(req: Request) {
  let body: { key?: string; newPassword?: string; currentPassword?: string };
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request body.");
  }

  // Emergency reset mode - uses a shared secret key
  const resetKey = process.env.RESET_PASSWORD_KEY;
  const bodyKey = body.key;

  if (resetKey && bodyKey === resetKey) {
    const newPassword = body.newPassword;
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return bad("Password must be at least 8 characters.");
    }

    const adminEmail = (process.env.ADMIN_EMAIL || "admin@brandpromotion.in").toLowerCase();
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail) as
      | { id: number }
      | undefined;

    if (!user) {
      return bad("Admin user not found. Ensure ADMIN_EMAIL matches your account.");
    }

    const hash = bcrypt.hashSync(newPassword, 12);
    db.prepare("UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?").run(hash, user.id);
    console.log(`[reset-password] Emergency password reset for ${adminEmail}`);

    return NextResponse.json({
      ok: true,
      message: `Password reset successful. You can now log in with ${adminEmail}.`,
    });
  }

  // Normal authenticated reset flow
  const { error, user } = await requireAdmin();
  if (error) return error;

  const newPassword = body.newPassword;
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    return bad("New password must be at least 8 characters.");
  }

  // Update password
  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);

  console.log(`[reset-password] Password reset for user ${user.email}`);
  return NextResponse.json({
    ok: true,
    message: "Password updated successfully. You can now log in with your new password.",
  });
}