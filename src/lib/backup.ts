import { db } from "./db";

export const BACKUP_TABLES = [
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

export type BackupTable = (typeof BACKUP_TABLES)[number];

export type FullBackup = {
  app: "brand-promotion";
  kind: "full-backup";
  version: 1;
  exported_at: string;
  tables: Record<BackupTable, Record<string, unknown>[]>;
};

export type BackupTables = Partial<Record<BackupTable, Record<string, unknown>[]>>;

// Tables that would violate foreign keys if only `deals` is replaced.
export const DEPENDENT_ON_DEALS: BackupTable[] = [
  "orders",
  "reimbursements",
  "refunds",
  "reviews",
  "click_tracking",
];

function columnsOf(table: BackupTable): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalize(v: unknown): unknown {
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

export function buildFullBackup(): FullBackup {
  const tables = {} as Record<BackupTable, Record<string, unknown>[]>;
  for (const t of BACKUP_TABLES) {
    tables[t] = db.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[];
  }
  return {
    app: "brand-promotion",
    kind: "full-backup",
    version: 1,
    exported_at: new Date().toISOString(),
    tables,
  };
}

/**
 * Replaces the content of the given tables with the backup rows. Throws (and
 * rolls back) when the result would violate foreign keys.
 */
export function restoreBackupTables(
  tableData: BackupTables,
  toDelete: BackupTable[]
): Record<string, number> {
  const restored: Record<string, number> = {};

  // PRAGMA foreign_keys is a no-op inside a transaction, so toggle it outside.
  db.pragma("foreign_keys = OFF");
  try {
    const restore = db.transaction(() => {
      for (const name of toDelete) db.prepare(`DELETE FROM ${name}`).run();

      for (const name of Object.keys(tableData) as BackupTable[]) {
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
  } finally {
    db.pragma("foreign_keys = ON");
  }

  return restored;
}

export function parseBackupTables(body: unknown): { mode: "full" | "deals"; tables: BackupTables } | string {
  if (Array.isArray(body)) {
    const deals = body.filter(isPlainObject);
    if (deals.length === 0) return "Deals backup is empty or invalid.";
    if (!deals.every((d) => typeof d.title === "string" && d.title.trim().length > 0)) {
      return "Every deal in the backup needs a title.";
    }
    return { mode: "deals", tables: { deals } };
  }

  if (isPlainObject(body) && isPlainObject(body.tables)) {
    const t = body.tables;
    const tables: BackupTables = {};
    for (const name of BACKUP_TABLES) {
      const rows = t[name];
      if (rows === undefined) continue;
      if (!Array.isArray(rows) || rows.some((r) => !isPlainObject(r))) {
        return `Backup table "${name}" must be an array of row objects.`;
      }
      tables[name] = rows;
    }
    if (Object.keys(tables).length === 0) return "Backup contains no tables.";
    return { mode: "full", tables };
  }

  return "Unrecognized backup format. Upload a full backup JSON (from Download) or a deals array.";
}

export function isFullBackup(v: unknown): v is FullBackup {
  return (
    isPlainObject(v) &&
    v.kind === "full-backup" &&
    isPlainObject(v.tables) &&
    Array.isArray((v.tables as Record<string, unknown>).users)
  );
}
