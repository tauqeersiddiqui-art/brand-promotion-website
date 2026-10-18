import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, bad } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/rate-limit";
import { getCsrfTokenFromCookies } from "@/lib/csrf";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const TABLES = [
  "users",
  "deals",
  "orders",
  "reimbursements",
  "refunds",
  "reviews",
  "settings",
  "click_tracking",
  "uploads",
  "device_fingerprints",
] as const;
type TableName = (typeof TABLES)[number];

// Tables that would violate foreign keys if only `deals` is replaced.
const DEPENDENT_ON_DEALS: TableName[] = [
  "orders",
  "reimbursements",
  "refunds",
  "reviews",
  "click_tracking",
];

function columnsOf(table: TableName): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalize(v: unknown): unknown {
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return NextResponse.json(
    {
      app: "brand-promotion",
      kind: "full-backup",
      version: 1,
      exported_at: new Date().toISOString(),
      tables,
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="brand-promotion-backup-${stamp}.json"`,
      },
    }
  );
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

  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
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

  const legacy = Array.isArray(body);
  let tableData: Partial<Record<TableName, Record<string, unknown>[]>> = {};

  if (legacy) {
    const deals = (body as unknown[]).filter(isPlainObject);
    if (deals.length === 0) return bad("Deals backup is empty or invalid.");
    if (!deals.every((d) => typeof d.title === "string" && d.title.trim().length > 0)) {
      return bad("Every deal in the backup needs a title.");
    }
    tableData = { deals };
  } else if (isPlainObject(body) && isPlainObject(body.tables)) {
    const t = body.tables;
    for (const name of TABLES) {
      const rows = t[name];
      if (rows === undefined) continue;
      if (!Array.isArray(rows) || rows.some((r) => !isPlainObject(r))) {
        return bad(`Backup table "${name}" must be an array of row objects.`);
      }
      tableData[name] = rows;
    }
    if (Object.keys(tableData).length === 0) return bad("Backup contains no tables.");
  } else {
    return bad(
      "Unrecognized backup format. Upload a full backup JSON (from Download) or a deals array."
    );
  }

  const toDelete: TableName[] = legacy
    ? ["deals", ...DEPENDENT_ON_DEALS]
    : [...TABLES];
  const restored: Record<string, number> = {};

  // PRAGMA foreign_keys is a no-op inside a transaction, so toggle it outside.
  db.pragma("foreign_keys = OFF");
  try {
    const restore = db.transaction(() => {
      for (const name of toDelete) db.prepare(`DELETE FROM ${name}`).run();

      for (const name of Object.keys(tableData) as TableName[]) {
        const rows = tableData[name] ?? [];
        const cols = columnsOf(name);
        for (const row of rows) {
          const used = cols.filter((c) => row[c] !== undefined);
          if (used.length === 0) continue;
          const colList = used.map((c) => `"${c}"`).join(", ");
          const placeholders = used.map(() => "?").join(", ");
          db.prepare(`INSERT INTO ${name} (${colList}) VALUES (${placeholders})`).run(
            ...used.map((c) => normalize(row[c]))
          );
        }
        restored[name] = rows.length;
      }

      const violations = db.prepare("PRAGMA foreign_key_check").all() as unknown[];
      if (violations.length > 0) {
        throw new Error(`${violations.length} foreign-key violations found`);
      }
    });
    restore();
  } catch (e) {
    db.pragma("foreign_keys = ON");
    const msg = e instanceof Error ? e.message : "Restore failed.";
    return bad(`Restore failed and was rolled back: ${msg}`);
  }
  db.pragma("foreign_keys = ON");

  return NextResponse.json({ ok: true, mode: legacy ? "deals" : "full", restored });
}
