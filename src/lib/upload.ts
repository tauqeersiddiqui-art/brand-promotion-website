import { UPLOAD_DIR, ensureStorageDirs, isS3Configured, uploadToS3, isR2Url, r2KeyFromUrl, deleteFromS3 } from "./storage";
import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const MAGIC: { magic: number[]; ext: string }[] = [
  { magic: [0x89, 0x50, 0x4e, 0x47], ext: "png" },
  { magic: [0xff, 0xd8, 0xff], ext: "jpg" },
  { magic: [0x52, 0x49, 0x46, 0x46], ext: "webp" },
  { magic: [0x47, 0x49, 0x46, 0x38], ext: "gif" },
];

export type UploadResult = { ok: true; url: string; buffer: Buffer; ext: string } | { ok: false; error: string };

/**
 * Validates and saves an uploaded image:
 * - size cap before reading
 * - magic-byte sniffing (never trusts client MIME)
 * - random hex filename (no user-controlled path)
 * Returns the buffer too so callers can run OCR on the same bytes.
 *
 * If S3/R2 is configured, attempts to upload there first; otherwise falls back to local disk.
 */
export async function saveUploadedImage(file: File): Promise<UploadResult> {
  if (!file || typeof file.arrayBuffer !== "function") {
    return { ok: false, error: "No file provided." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Image too large. Maximum size is 5 MB." };
  }
  if (file.size === 0) {
    return { ok: false, error: "Empty file." };
  }

  const buf = Buffer.from(await file.arrayBuffer());

  const match = MAGIC.find((m) => m.magic.every((byte, i) => buf[i] === byte));
  if (!match) {
    return { ok: false, error: "Only PNG, JPG, WebP or GIF images are allowed." };
  }
  if (match.ext === "webp" && buf.slice(8, 12).toString("ascii") !== "WEBP") {
    return { ok: false, error: "Corrupted WebP file." };
  }

  // Try R2/S3 first if configured
  if (isS3Configured()) {
    const r2Result = await uploadToS3(buf, file.name, file.type);
    if (r2Result) {
      return { ok: true, url: r2Result.url, buffer: buf, ext: r2Result.ext };
    }
    // Fall through to local storage if R2 fails
  }

  ensureStorageDirs();

  const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}.${match.ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);

  return { ok: true, url: `/api/files/${name}`, buffer: buf, ext: match.ext };
}

/**
 * Remove a previously saved upload, given its public `/uploads/<name>` URL.
 * Used to roll back a file when the request is rejected after the write
 * (duplicate detection, failed validation) so orphans do not accumulate.
 */
export function deleteUploadedImage(url: string): void {
  try {
    const name = path.basename(url);
    const ext = path.extname(name).slice(1).toLowerCase();
    if (!["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return;

    // Delete from R2 if it's an R2 URL
    if (isR2Url(url)) {
      const key = r2KeyFromUrl(url);
      if (key) {
        // Sync delete - fire and forget
        deleteFromS3(key).catch(() => {});
      }
      return;
    }

    // Delete from local storage
    const target = path.join(UPLOAD_DIR, name);
    // Defence in depth: never unlink anything outside the uploads directory.
    if (path.dirname(target) !== UPLOAD_DIR) return;
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch {
    // Best effort cleanup.
  }
}