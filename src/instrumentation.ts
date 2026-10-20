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
  }
}
