import fs from "fs";
import path from "path";

/**
 * Central storage layout.
 *
 * Production (Render) should mount a persistent disk and set DATA_DIR to its
 * mount path (e.g. /var/data). Without that, SQLite and uploaded evidence are
 * erased on every deploy.
 */
export const DATA_DIR = path.resolve(
  process.env.DATA_DIR || path.join(process.cwd(), "data")
);

export const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR || path.join(DATA_DIR, "uploads")
);

/** Legacy files kept in public/uploads before private storage was introduced. */
export const LEGACY_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export function ensureStorageDirs(): void {
  for (const dir of [DATA_DIR, UPLOAD_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

const STORED_URL_RE = /^\/(?:api\/files|uploads)\/[A-Za-z0-9._-]+$/;

export function isStoredUploadUrl(url: string): boolean {
  return STORED_URL_RE.test(url);
}

export function uploadNameFromUrl(url: string): string {
  if (!isStoredUploadUrl(url)) return "";
  return path.basename(url);
}

/** Absolute path for an upload, checking private storage then the legacy dir. */
export function uploadFilePath(url: string): string {
  const name = uploadNameFromUrl(url);
  if (!name) return "";
  const primary = path.join(UPLOAD_DIR, name);
  if (fs.existsSync(primary)) return primary;
  const legacy = path.join(LEGACY_UPLOAD_DIR, name);
  if (fs.existsSync(legacy)) return legacy;
  return "";
}

export function mimeForFile(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "application/octet-stream";
}
