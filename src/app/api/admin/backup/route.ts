import { NextResponse } from "next/server";
import { requireAdmin, bad } from "@/lib/api-helpers";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getCsrfTokenFromCookies } from "@/lib/csrf";
import { headers } from "next/headers";
import {
  BACKUP_TABLES,
  DEPENDENT_ON_DEALS,
  buildFullBackup,
  parseBackupTables,
  restoreBackupTables,
  type BackupTable,
} from "@/lib/backup";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const backup = buildFullBackup();
  const stamp = new Date().toISOString().slice(0, 10);
  return NextResponse.json(backup, {
    headers: {
      "Content-Disposition": `attachment; filename="brand-promotion-backup-${stamp}.json"`,
    },
  });
}

export async function POST(req: Request) {
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = await getCsrfTokenFromCookies();
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const { error } = await requireAdmin();
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Backup file must be valid JSON.");
  }

  const parsed = parseBackupTables(body);
  if (typeof parsed === "string") return bad(parsed);

  const toDelete: BackupTable[] =
    parsed.mode === "deals" ? ["deals", ...DEPENDENT_ON_DEALS] : [...BACKUP_TABLES];

  let restored: Record<string, number>;
  try {
    restored = restoreBackupTables(parsed.tables, toDelete);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Restore failed.";
    return bad(`Restore failed and was rolled back: ${msg}`);
  }

  return NextResponse.json({ ok: true, mode: parsed.mode, restored });
}
