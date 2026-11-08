#!/usr/bin/env node
/**
 * Production-Grade Encrypted Backup Script
 *
 * Creates WAL-consistent database snapshots with encryption and uploads to R2/S3.
 * Features:
 * - SQLite backup API for WAL-safe snapshots (no separate WAL file needed)
 * - AES-256-GCM encryption for local backups
 * - SHA-256 checksums for integrity verification
 * - R2/S3 upload with retry handling
 * - Retention policy enforcement
 *
 * Usage:
 *   node scripts/create-encrypted-backup.ts [--encrypt-key <hex-32-byte-key>]
 *
 * Environment Variables:
 *   BACKUP_DIR            - Backup storage directory (default: /data/backups)
 *   DATABASE_PATH         - SQLite database path (default: /data/app.db via DATA_DIR)
 *   DATA_DIR              - Base data directory
 *   R2_* or AWS_*         - S3/R2 configuration for remote storage
 *   ENCRYPTION_KEY        - 64-char hex string (32 bytes) for AES-256 encryption (optional)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';

// Configuration
const DATA_DIR = path.resolve(process.env.DATA_DIR || '/data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'app.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const RETENTION_COUNT = 20; // Keep last 20 backups
const MAX_BACKUP_AGE_DAYS = 7;

interface BackupManifest {
  timestamp: string;
  iso: string;
  checksum: string;
  fileSize: number;
  encrypted: boolean;
  retentionDays: number;
  tables: string[];
  version: string;
}

interface UploadResult {
  success: boolean;
  remotePath?: string;
  error?: string;
}

/**
 * Ensure backup directory exists
 */
function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`[backup] Created backup directory: ${BACKUP_DIR}`);
  }
}

/**
 * Generate timestamp for backup filename
 */
function getBackupTimestamp(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // Remove Z
  return `${ts}`;
}

/**
 * Get table names from database
 */
function getTableNames(db: Database.Database): string[] {
  try {
    const rows = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();
    return rows.map((r: any) => r.name);
  } catch {
    return [];
  }
}

/**
 * Create a WAL-consistent backup using SQLite's backup API.
 * This is the correct way to backup a database while WAL mode is enabled.
 */
function createDatabaseBackup(db: Database.Database, outputPath: string): { success: boolean; error?: string; fileSize?: number } {
  try {
    // Create a new database file - this is the WAL-safe backup method
    // SQLite backup API copies the main database AND applies all WAL frames
    const backupDb = new Database(outputPath, { readonly: false });

    db.backup(backupDb);
    backupDb.close();

    const stats = fs.statSync(outputPath);
    return { success: true, fileSize: stats.size };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Compute SHA-256 checksum of a file
 */
function computeChecksum(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Encrypt a file using AES-256-GCM
 * Returns the encrypted file path
 */
function encryptFile(inputPath: string, outputPath: string, keyHex: string): { success: boolean; error?: string } {
  try {
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
      return { success: false, error: 'Encryption key must be 32 bytes (64 hex chars)' };
    }

    const iv = crypto.randomBytes(12); // GCM nonce
    const plaintext = fs.readFileSync(inputPath);

    const cipher = crypto.createCipherGCM('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      iv, // Prepend IV for decryption
      cipher.update(plaintext),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    // Store IV (12 bytes) + encrypted data + auth tag (16 bytes)
    const finalBuffer = Buffer.concat([encrypted, authTag]);
    fs.writeFileSync(outputPath, finalBuffer);

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Encrypt and generate manifest, write to disk
 */
function writeEncryptedManifest(backupDir: string, baseName: string, checksum: string, fileSize: number, encrypted: boolean, tables: string[]): string {
  const manifest: BackupManifest = {
    timestamp: new Date().toISOString(),
    iso: new Date().toISOString().replace(/[-:.]/g, '').slice(0, - 5) + 'Z',
    checksum,
    fileSize,
    encrypted,
    retentionDays: MAX_BACKUP_AGE_DAYS,
    tables,
    version: '1.0'
  };

  const manifestPath = path.join(backupDir, `${baseName}.manifest.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

/**
 * Load S3/R2 client if configured
 */
async function getS3Client(): Promise<any | null> {
  const r2 = !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_ENDPOINT);
  const aws = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

  if (!r2 && !aws) return null;

  try {
    // Use dynamic import to avoid build-time errors
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

    const client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT || process.env.AWS_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });

    return { client, getSignedUrl, PutObjectCommand };
  } catch (e) {
    console.warn('[backup] S3 SDK not available:', e);
    return null;
  }
}

/**
 * Upload backup to R2/S3 with retry
 */
async function uploadToRemote(localPath: string, baseName: string, maxRetries = 3): Promise<UploadResult> {
  const s3 = await getS3Client();
  if (!s3) {
    return { success: false, error: 'R2/S3 not configured' };
  }

  const { client, PutObjectCommand } = s3;
  const bucketName = process.env.R2_BUCKET_NAME || process.env.AWS_BUCKET_NAME || 'backups';

  const content = fs.readFileSync(localPath);
  const key = `backups/${baseName}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: content,
        ContentType: 'application/octet-stream',
        CacheControl: 'no-cache',
        Metadata: {
          'upload-attempt': String(attempt),
          'backup-type': 'encrypted',
        },
      }));
      return { success: true, remotePath: `${bucketName}/${key}` };
    } catch (e: any) {
      console.warn(`[backup] Upload attempt ${attempt} failed:`, e.message);
      if (attempt >= maxRetries) {
        return { success: false, error: e.message };
      }
      // Exponential backoff
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Upload manifest to remote storage with same retry logic
 */
async function uploadManifest(manifestPath: string, baseName: string, maxRetries = 3): Promise<UploadResult> {
  const s3 = await getS3Client();
  if (!s3) return { success: true, remotePath: 'skipped (no remote config)' };

  const { client, PutObjectCommand } = s3;
  const bucketName = process.env.R2_BUCKET_NAME || process.env.AWS_BUCKET_NAME || 'backups';

  const content = fs.readFileSync(manifestPath);
  const key = `backups/${baseName}.manifest.json`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: content,
        ContentType: 'application/json',
        CacheControl: 'no-cache',
      }));
      return { success: true, remotePath: `${bucketName}/${key}` };
    } catch (e: any) {
      console.warn(`[backup] Manifest upload attempt ${attempt} failed:`, e.message);
      if (attempt >= maxRetries) {
        return { success: false, error: e.message };
      }
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Enforce retention policy - delete old backups beyond the count
 */
function enforceRetention(): void {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db') || f.endsWith('.json'))
    .sort();

  // Keep only the N most recent
  const toDelete = files.slice(0, -RETENTION_COUNT);
  for (const file of toDelete) {
    const filePath = path.join(BACKUP_DIR, file);
    try {
      fs.unlinkSync(filePath);
      console.log(`[backup] Deleted old backup: ${file}`);
    } catch (e) {
      console.warn(`[backup] Failed to delete ${file}:`, e);
    }
  }
}

/**
 * Cleanup orphaned files (manifest without db, or vice versa)
 */
function cleanupOrphans(): void {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const files = fs.readdirSync(BACKUP_DIR);
  const dbFiles = files.filter(f => f.endsWith('.db'));
  const manifestFiles = files.filter(f => f.endsWith('.manifest.json'));

  // Check for orphan manifests
  for (const mf of manifestFiles) {
    const dbName = mf.replace('.manifest.json', '.db');
    if (!dbFiles.includes(dbName)) {
      const mfPath = path.join(BACKUP_DIR, mf);
      fs.unlinkSync(mfPath);
      console.log(`[backup] Cleaned orphan manifest: ${mf}`);
    }
  }

  // Check for orphan db files
  for (const df of dbFiles) {
    const mName = df.replace('.db', '.db.manifest.json');
    if (!manifestFiles.includes(mName)) {
      // Check for non-encrypted manifest (just .json)
      const altMName = df.replace('.db', '.json');
      if (!manifestFiles.includes(altMName)) {
        const dfPath = path.join(BACKUP_DIR, df);
        fs.unlinkSync(dfPath);
        console.log(`[backup] Cleaned orphan database: ${df}`);
      }
    }
  }
}

/**
 * Send alert (placeholder - integrate with Resend, Telegram, etc. for real implementation)
 */
function sendAlert(message: string, success: boolean): void {
  // In production, this would send to configured notification channel
  console.log(`[backup] ${success ? 'SUCCESS' : 'ALERT'}: ${message}`);
}

/**
 * Main backup function
 */
async function createBackup(): Promise<void> {
  console.log('[backup] Starting backup process...');

  // Get encryption key from env or CLI
  const args = process.argv.slice(2);
  let encryptionKey = process.env.ENCRYPTION_KEY;

  if (args[0] === '--encrypt-key' && args[1]) {
    encryptionKey = args[1];
  }

  const useEncryption = !!(encryptionKey && encryptionKey.length === 64);
  const isEncrypted = useEncryption;

  // Open the database
  let db: Database.Database;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (e: any) {
    sendAlert(`Cannot open database at ${DB_PATH}: ${e.message}`, false);
    process.exit(1);
  }

  // Get table names for manifest
  const tables = getTableNames(db);

  // Create backup directory
  ensureBackupDir();

  // Generate backup filename
  const timestamp = getBackupTimestamp();
  const baseName = `backup-${timestamp}`;
  const rawPath = path.join(BACKUP_DIR, `${baseName}.db`);
  const encryptedPath = path.join(BACKUP_DIR, `${baseName}.db.enc`);
  const finalPath = useEncryption ? encryptedPath : rawPath;

  // Step 1: Create WAL-consistent backup
  console.log('[backup] Creating WAL-consistent snapshot...');
  const backupResult = createDatabaseBackup(db, rawPath);

  db.close();

  if (!backupResult.success) {
    sendAlert(`Snapshot failed: ${backupResult.error}`, false);
    process.exit(1);
  }

  // Step 2: Encrypt if key provided
  if (useEncryption) {
    console.log('[backup] Encrypting backup...');
    const encResult = encryptFile(rawPath, encryptedPath, encryptionKey);
    if (!encResult.success) {
      fs.unlinkSync(rawPath);
      sendAlert(`Encryption failed: ${encResult.error}`, false);
      process.exit(1);
    }
    // Delete unencrypted version
    fs.unlinkSync(rawPath);
    console.log('[backup] Encryption complete');
  }

  // Step 3: Compute checksum
  const checksum = computeChecksum(finalPath);
  console.log(`[backup] Checksum: ${checksum.slice(0, 16)}...`);

  // Step 4: Write manifest
  const manifestPath = writeEncryptedManifest(
    BACKUP_DIR,
    isEncrypted ? `${baseName}.db.enc.manifest.json` : `${baseName}.db.manifest.json`,
    checksum,
    backupResult.fileSize,
    isEncrypted,
    tables
  );

  // Step 5: Upload to remote storage if configured
  const uploadEnabled = !!(process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID);
  if (uploadEnabled) {
    console.log('[backup] Uploading to remote storage...');
    const uploadResult = await uploadToRemote(finalPath, isEncrypted ? `${baseName}.db.enc` : `${baseName}.db`);
    const manifestUploadResult = await uploadManifest(manifestPath, baseName);

    if (uploadResult.success && manifestUploadResult.success) {
      console.log(`[backup] Remote backup: ${uploadResult.remotePath}`);
    } else {
      console.warn(`[backup] Remote upload failed: ${uploadResult.error || manifestUploadResult.error || 'unknown'}`);
    }
  }

  // Step 6: Enforce retention
  enforceRetention();

  // Step 7: Cleanup orphans
  cleanupOrphans();

  // Success
  console.log(`[backup] Complete: ${finalPath}`);
  console.log(`[backup] Size: ${backupResult.fileSize} bytes`);
  console.log(`[backup] Encryption: ${isEncrypted ? 'AES-256-GCM' : 'None'}`);

  sendAlert(`Backup ${baseName} created (${backupResult.fileSize} bytes)`, true);
}

// Run if called directly
if (require.main === module) {
  createBackup().catch(e => {
    console.error('[backup] Fatal error:', e);
    process.exit(1);
  });
}

export { createBackup, computeChecksum, encryptFile, writeEncryptedManifest };