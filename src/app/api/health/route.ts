import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DATA_DIR, UPLOAD_DIR, isS3Configured } from "@/lib/storage";
import * as fs from "fs";

export const dynamic = "force-dynamic";

// Unhandled-error visibility without dumping internals: reports DB + storage
// writability so a dead volume/restore is caught by uptime monitors before
// users notice data loss.
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  try {
    db.prepare("SELECT 1 AS v").get();
    checks.db = { ok: true, detail: "read ok" };
  } catch (e) {
    checks.db = { ok: false, detail: e instanceof Error ? e.message.slice(0, 120) : "db error" };
  }

  for (const [name, dir] of [["dataDir", DATA_DIR], ["uploadDir", UPLOAD_DIR]] as const) {
    try {
      fs.accessSync(dir, fs.constants.W_OK);
      checks[name] = { ok: true, detail: dir };
    } catch {
      checks[name] = { ok: false, detail: `${dir} not writable` };
    }
  }

  checks.storage = isS3Configured()
    ? { ok: true, detail: "R2/S3 configured" }
    : { ok: !!process.env.DATA_DIR, detail: process.env.DATA_DIR ? "local disk (DATA_DIR set)" : "LOCAL EPHEMERAL — set DATA_DIR + volume in prod" };

  const ok = checks.db.ok && checks.dataDir.ok && checks.uploadDir.ok;
  return NextResponse.json({ ok, checkedAt: new Date().toISOString(), checks }, { status: ok ? 200 : 503 });
}