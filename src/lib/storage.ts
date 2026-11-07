import fs from "fs";
import path from "path";

/**
 * Central storage layout.
 *
 * Production (Railway) should mount a persistent disk and set DATA_DIR to its
 * mount path (e.g. /data). Without that, SQLite and uploaded evidence are
 * erased on every deploy.
 *
 * R2/S3 storage is configured via environment variables:
 * - R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (or AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * - R2_BUCKET_NAME
 * - R2_ENDPOINT (e.g., https://<account-id>.r2.cloudflarestorage.com)
 *
 * When configured, uploads go to R2; otherwise they go to local disk.
 */
export const DATA_DIR = path.resolve(
  process.env.DATA_DIR || path.join(process.cwd(), "data")
);

export const UPLOAD_DIR = path.resolve(
  process.env.UPLOAD_DIR || path.join(DATA_DIR, "uploads")
);

/** Legacy files kept in public/uploads before private storage was introduced. */
export const LEGACY_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/** R2 upload directory inside UPLOAD_DIR for S3-migration tracking */
export const R2_DIR = path.join(UPLOAD_DIR, ".r2-migrated");

export function ensureStorageDirs(): void {
  for (const dir of [DATA_DIR, UPLOAD_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

// URL patterns for different storage backends
const LOCAL_URL_RE = /^\/(?:api\/files)\/[A-Za-z0-9._-]+$/;
export const R2_URL_RE = /^\/api\/files\/r2\/[A-Za-z0-9._-]+$/;
const LEGACY_URL_RE = /^\/uploads\/[A-Za-z0-9._-]+$/;

export function isStoredUploadUrl(url: string): boolean {
  return LOCAL_URL_RE.test(url) || R2_URL_RE.test(url) || LEGACY_URL_RE.test(url);
}

export function uploadNameFromUrl(url: string): string {
  if (!isStoredUploadUrl(url)) return "";
  return path.basename(url);
}

/** Extract S3 key from /api/files/r2/<key> URL */
export function r2KeyFromUrl(url: string): string | null {
  if (!R2_URL_RE.test(url)) return null;
  return url.replace(/^\/api\/files\/r2\//, "");
}

/** Check if a URL points to an R2-persisted object */
export function isR2Url(url: string): boolean {
  return R2_URL_RE.test(url);
}

/**
 * Check if S3/R2 is configured.
 *
 * Previously this returned true when ANY one key was present, so a half-filled
 * env tried to use object storage and silently fell back to disk on every
 * upload. Require the complete R2 set, or the complete AWS set.
 */
export function isS3Configured(): boolean {
  const r2 =
    !!process.env.R2_ACCESS_KEY_ID &&
    !!process.env.R2_SECRET_ACCESS_KEY &&
    !!process.env.R2_BUCKET_NAME &&
    !!process.env.R2_ENDPOINT;
  const aws =
    !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
  return r2 || aws;
}

/** Absolute path for an upload, checking private storage then the legacy dir. */
export function uploadFilePath(url: string): string {
  // R2 URLs are virtual - don't resolve to local path
  if (isR2Url(url)) return "";

  const name = uploadNameFromUrl(url);
  if (!name) return "";

  // Check local uploads first
  const primary = path.join(UPLOAD_DIR, name);
  if (fs.existsSync(primary)) return primary;

  // Check legacy public/uploads
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

// Lazy-load S3 functions to avoid webpack errors when AWS SDK is not installed
let s3Module: Record<string, unknown> | null = null;

async function loadS3Module() {
  if (s3Module !== null) return s3Module;
  if (!isS3Configured()) {
    s3Module = { loaded: false, error: "S3 not configured" };
    return s3Module;
  }

  try {
    // Dynamic import - will fail gracefully if packages not installed
    const s3 = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    s3Module = { client: s3.S3Client, getSignedUrl, loaded: true };
  } catch (e) {
    console.warn("[storage] S3 SDK not available, falling back to local storage:", e);
    s3Module = { loaded: false, error: String(e) };
  }
  return s3Module;
}

export interface S3UploadResult {
  ok: true;
  url: string;
  key: string;
  ext: string;
}

/**
 * Upload an image buffer to R2/S3-compatible storage.
 * Falls back to returning null if S3 is not configured or unavailable.
 */
export async function uploadToS3(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<S3UploadResult | null> {
  const mod = await loadS3Module();
  if (!mod.loaded || !mod.client) return null;

  const { S3Client, PutObjectCommand } = mod.client as any;

  const config = {
    region: "auto",
    endpoint: process.env.R2_ENDPOINT || process.env.AWS_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  };

  const client = new S3Client(config);

  const MAX_BYTES = 5 * 1024 * 1024;
  if (buffer.length > MAX_BYTES) return null;

  // Magic byte detection
  const MAGIC: { magic: number[]; ext: string }[] = [
    { magic: [0x89, 0x50, 0x4e, 0x47], ext: "png" },
    { magic: [0xff, 0xd8, 0xff], ext: "jpg" },
    { magic: [0x52, 0x49, 0x46, 0x46], ext: "webp" },
    { magic: [0x47, 0x49, 0x46, 0x38], ext: "gif" },
  ];

  const match = MAGIC.find((m) => m.magic.every((byte, i) => buffer[i] === byte));
  if (!match) return null;

  if (match.ext === "webp" && buffer.slice(8, 12).toString("ascii") !== "WEBP") {
    return null;
  }

  const ext = match.ext;
  const key = `${Date.now().toString(36)}-${require('crypto').randomBytes(8).toString("hex")}.${ext}`;
  const bucketName = process.env.R2_BUCKET_NAME || process.env.AWS_BUCKET_NAME || "uploads";

  try {
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: ext === "jpg" ? "image/jpeg" : `image/${ext}`,
      CacheControl: "public, max-age=31536000, immutable",
    }));

    return { ok: true, url: `/api/files/r2/${key}`, key, ext };
  } catch (e) {
    console.error("[upload] S3 upload failed:", e);
    return null;
  }
}

/**
 * Get a signed URL for accessing an S3 object privately.
 * Returns null if S3 is not configured.
 */
export async function getSignedS3Url(key: string, expiresIn: number = 3600): Promise<string | null> {
  const mod = await loadS3Module();
  if (!mod.loaded || !mod.getSignedUrl || !mod.client) return null;

  const { S3Client, GetObjectCommand } = mod.client as any;
  const { getSignedUrl: signUrl } = mod as { getSignedUrl: (client: any, command: any, options?: any) => Promise<string> };

  const config = {
    region: "auto",
    endpoint: process.env.R2_ENDPOINT || process.env.AWS_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  };

  const client = new S3Client(config);
  const bucketName = process.env.R2_BUCKET_NAME || process.env.AWS_BUCKET_NAME || "uploads";

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    return signUrl(client, command, { expiresIn });
  } catch (e) {
    console.error("[getSignedS3Url] Failed:", e);
    return null;
  }
}

/**
 * Delete an object from R2/S3 storage.
 */
export async function deleteFromS3(key: string): Promise<boolean> {
  const mod = await loadS3Module();
  if (!mod.loaded || !mod.client) return false;

  const { S3Client, DeleteObjectCommand } = mod.client as any;

  const config = {
    region: "auto",
    endpoint: process.env.R2_ENDPOINT || process.env.AWS_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  };

  const client = new S3Client(config);
  const bucketName = process.env.R2_BUCKET_NAME || process.env.AWS_BUCKET_NAME || "uploads";

  try {
    await client.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }));
    return true;
  } catch {
    return false;
  }
}