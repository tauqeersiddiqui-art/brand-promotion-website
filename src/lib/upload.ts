import fs from "fs";
import path from "path";
import crypto from "crypto";
import { UPLOAD_DIR, ensureStorageDirs, uploadNameFromUrl } from "./storage";

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
    const name = uploadNameFromUrl(url);
    if (!name) return;
    const target = path.join(UPLOAD_DIR, name);
    // Defence in depth: never unlink anything outside the uploads directory.
    if (path.dirname(target) !== UPLOAD_DIR) return;
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch {
    // Best effort cleanup.
  }
}
