import { db } from "./lib/db";

/**
 * Runs once per server start (not during `next build`).
 *
 * Automatic backups are written to `BACKUP_DIR` (defaults to
 * `data/backups`) and, when the database looks freshly seeded/wiped, the
 * newest automatic backup is restored together with its uploaded images.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initAutoBackup } = await import("./lib/auto-backup");
    initAutoBackup();
    ensureOtpTable();
  }
}

function ensureOtpTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'login',
        attempts INTEGER NOT NULL DEFAULT 0,
        consumed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      )
    `);
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, purpose, created_at DESC)"
    );
    // Ensure users table has phone column for OTP lookup
    try {
      db.exec(`ALTER TABLE users ADD COLUMN phone TEXT`);
    } catch (_) {
      // Column may already exist
    }
  } catch (err) {
    console.warn("[instrumentation] DB migration warning:", err);
  }
}

