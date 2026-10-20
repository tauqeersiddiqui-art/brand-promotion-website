import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db } from "./db";
import { DATA_DIR, UPLOAD_DIR } from "./storage";
import {
  BACKUP_TABLES,
  buildFullBackup,
  isFullBackup,
  restoreBackupTables,
  type FullBackup,
} from "./backup";

const DB_PATH = path.resolve(
  process.env.DATABASE_PATH || path.join(DATA_DIR, "app.db")
);
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(DATA_DIR, "backups"));
const UPLOAD_BACKUP_DIR = path.join(BACKUP_DIR, "uploads");

const KEEP_BACKUPS = 20;
const RESTORE_WINDOW_MS = 60 * 60 * 1000;
const AUTO_RESTORE = process.env.AUTO_RESTORE !== "0";
const INTERVAL_MIN = Math.min(
  240,
  Math.max(1, parseInt(process.env.AUTO_BACKUP_MINUTES || "5", 10) || 5)
);

let lastFingerprint = "";

function log(message: string) {
  console.log(`[auto-backup] ${message}`);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fingerprint(): string {
  const tables = {} as Record<string, unknown>;
  for (const t of BACKUP_TABLES) {
    tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  return crypto.createHash("sha256").update(JSON.stringify(tables)).digest("hex");
}

function backupUploads() {
  if (!fs.existsSync(UPLOAD_DIR)) return 0;
  ensureDir(UPLOAD_BACKUP_DIR);
  let copied = 0;
  for (const name of fs.readdirSync(UPLOAD_DIR)) {
    const src = path.join(UPLOAD_DIR, name);
    const dest = path.join(UPLOAD_BACKUP_DIR, name);
    try {
      if (!fs.statSync(src).isFile()) continue;
      const current = fs.existsSync(dest) ? fs.statSync(dest) : null;
      if (current && current.size === fs.statSync(src).size) continue;
      fs.copyFileSync(src, dest);
      copied++;
    } catch {
      // A file that disappears between readdir and stat is simply skipped.
    }
  }
  return copied;
}

function restoreUploads(): number {
  if (!fs.existsSync(UPLOAD_BACKUP_DIR)) return 0;
  ensureDir(UPLOAD_DIR);
  let copied = 0;
  for (const name of fs.readdirSync(UPLOAD_BACKUP_DIR)) {
    const src = path.join(UPLOAD_BACKUP_DIR, name);
    const dest = path.join(UPLOAD_DIR, name);
    try {
      if (!fs.statSync(src).isFile() || fs.existsSync(dest)) continue;
      fs.copyFileSync(src, dest);
      copied++;
    } catch {
      // Ignore unreadable entries; the database rows remain valid regardless.
    }
  }
  return copied;
}

function backupFiles(): string[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => /^auto-.*\.json$/.test(name))
    .sort()
    .reverse();
}

function pruneBackups() {
  const files = backupFiles();
  for (const name of files.slice(KEEP_BACKUPS)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, name));
    } catch {
      // Best effort.
    }
  }
}

/** Write immediately after an important change; never fail the request over it. */
export function writeAutoBackupSafe(reason: string): string | null {
  try {
    return writeAutoBackup(reason);
  } catch (e) {
    log(`immediate backup failed (${reason}): ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export function writeAutoBackup(reason: string): string | null {
  ensureDir(BACKUP_DIR);
  const current = fingerprint();
  if (current === lastFingerprint) return null;

  const backup = buildFullBackup();
  if (backup.tables.users.length === 0 && backup.tables.deals.length === 0) {
    log("database is empty; skipping backup");
    return null;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(BACKUP_DIR, `auto-${stamp}.json`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(backup));
  fs.renameSync(tmp, file);
  lastFingerprint = current;

  const uploads = backupUploads();
  pruneBackups();
  log(
    `wrote ${path.basename(file)} (${reason}); ${backup.tables.orders.length} orders, ` +
      `${backup.tables.deals.length} deals, ${uploads} new upload(s)`
  );
  return file;
}

function latestBackup(): FullBackup | null {
  for (const name of backupFiles()) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, name), "utf8")) as unknown;
      if (isFullBackup(parsed)) return parsed;
    } catch {
      // Corrupt or partially written file: try the next one.
    }
  }
  return null;
}

function looksFreshlySeeded(): boolean {
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;

  if (count("orders") > 0 || count("reviews") > 0) return false;
  if (count("reimbursements") > 0 || count("refunds") > 0) return false;
  if (count("users") > 1) return false;

  try {
    const stat = fs.statSync(DB_PATH);
    const born = stat.birthtimeMs || stat.ctimeMs;
    return Date.now() - born < RESTORE_WINDOW_MS;
  } catch {
    return false;
  }
}

function hasUsefulData(backup: FullBackup): boolean {
  const t = backup.tables;
  return (
    (t.users?.length ?? 0) > 1 ||
    (t.orders?.length ?? 0) > 0 ||
    (t.reviews?.length ?? 0) > 0 ||
    (t.reimbursements?.length ?? 0) > 0 ||
    (t.refunds?.length ?? 0) > 0
  );
}

function restoreLatestIfNeeded(): boolean {
  if (!AUTO_RESTORE) {
    log("auto-restore disabled (AUTO_RESTORE=0)");
    return false;
  }
  if (!looksFreshlySeeded()) return false;

  const backup = latestBackup();
  if (!backup) {
    log("database looks freshly seeded but no automatic backup was found");
    return false;
  }
  if (!hasUsefulData(backup)) {
    log("newest backup has no orders/accounts; keeping the freshly seeded database");
    return false;
  }

  const restored = restoreBackupTables(backup.tables, [...BACKUP_TABLES]);
  const uploads = restoreUploads();
  lastFingerprint = fingerprint();
  log(
    `restored automatic backup from ${backup.exported_at}: ` +
      `${restored.orders ?? 0} orders, ${restored.users ?? 0} users, ` +
      `${restored.deals ?? 0} deals, ${uploads} upload file(s)`
  );
  return true;
}

export function initAutoBackup() {
  const state = globalThis as { __autoBackupStarted?: boolean };
  if (state.__autoBackupStarted) return;
  state.__autoBackupStarted = true;

  ensureDir(BACKUP_DIR);
  ensureDir(UPLOAD_BACKUP_DIR);
  log(
    `dir=${BACKUP_DIR} interval=${INTERVAL_MIN}m autoRestore=${AUTO_RESTORE ? "on" : "off"}`
  );

  let restored = false;
  try {
    restored = restoreLatestIfNeeded();
  } catch (e) {
    log(`restore failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!restored) {
    try {
      writeAutoBackup("boot");
    } catch (e) {
      log(`boot backup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const timer = setInterval(() => {
    try {
      writeAutoBackup("interval");
    } catch (e) {
      log(`scheduled backup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, INTERVAL_MIN * 60 * 1000);
  timer.unref?.();
}
