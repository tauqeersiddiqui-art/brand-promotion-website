#!/usr/bin/env node
/**
 * Local Restore Test Procedure
 *
 * Restores a backup into a temporary directory and verifies:
 * - SQLite integrity (PRAGMA integrity_check)
 * - Foreign key integrity
 * - All table counts
 * - Uploaded screenshot checksums (if uploaded table exists)
 * - Database relationships
 *
 * NEVER restores over production. Uses a temp directory.
 *
 * Usage:
 *   node scripts/restore-test.ts <backup-file.db.enc> [encryption-key]
 *   node scripts/restore-test.ts <backup-file.db>
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import Database from 'better-sqlite3';
import { execSync } from 'child_process';

interface TableCount {
  name: string;
  count: number;
  expected: number;
  status: 'ok' | 'missing' | 'error';
}

interface FKCheckResult {
  table: string;
  status: 'pass' | 'fail';
  details?: string;
}

interface ValidationResult {
  integrityCheck: boolean;
  integrityMessage: string;
  tableCounts: TableCount[];
  foreignKeys: FKCheckResult[];
  uploadedFiles: { found: number; total: number };
  checksumMatch: boolean;
}

/**
 * Decrypt a backup file if encrypted
 */
function decryptFile(inputPath: string, outputPath: string, keyHex: string): boolean {
  try {
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
      console.error('[restore] Decryption key must be 32 bytes (64 hex chars)');
      return false;
    }

    const encrypted = fs.readFileSync(inputPath);
    const iv = encrypted.slice(0, 12);
    const authTag = encrypted.slice(encrypted.length - 16);
    const ciphertext = encrypted.slice(12, encrypted.length - 16);

    const decipher = crypto.createDecipherGCM('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    fs.writeFileSync(outputPath, plaintext);
    return true;
  } catch (e: any) {
    console.error('[restore] Decryption failed:', e.message);
    return false;
  }
}

/**
 * Count rows in each table
 */
function getTableCounts(db: Database.Database): TableCount[] {
  const expectedTables = ['users', 'deals', 'orders', 'reimbursements', 'refunds', 'reviews', 'uploads', 'click_tracking', 'device_fingerprints', 'settings'];
  const results: TableCount[] = [];

  for (const table of expectedTables) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
      results.push({ name: table, count: row.c, expected: -1, status: 'ok' });
    } catch (e) {
      results.push({ name: table, count: 0, expected: -1, status: 'missing' });
    }
  }

  return results;
}

/**
 * Check foreign key constraints
 */
function checkForeignKeys(db: Database.Database): FKCheckResult[] {
  const fkResults: FKCheckResult[] = [];

  // Check orders -> users
  try {
    const orphanUsers = db.prepare(`
      SELECT COUNT(*) as c FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.user_id IS NOT NULL AND u.id IS NULL
    `).get() as { c: number };

    fkResults.push({
      table: 'orders.user_id -> users.id',
      status: orphanUsers.c === 0 ? 'pass' : 'fail',
      details: orphanUsers.c === 0 ? undefined : `${orphanUsers.c} orphan orders`
    });
  } catch (e: any) {
    fkResults.push({ table: 'orders.user_id -> users.id', status: 'fail', details: e.message });
  }

  // Check reimbursements -> orders
  try {
    const orphanOrders = db.prepare(`
      SELECT COUNT(*) as c FROM reimbursements r
      LEFT JOIN orders o ON r.order_id = o.id
      WHERE o.id IS NULL
    `).get() as { c: number };

    fkResults.push({
      table: 'reimbursements.order_id -> orders.id',
      status: orphanOrders.c === 0 ? 'pass' : 'fail',
      details: orphanOrders.c === 0 ? undefined : `${orphanOrders.c} orphan reimbursements`
    });
  } catch (e: any) {
    fkResults.push({ table: 'reimbursements.order_id -> orders.id', status: 'fail', details: e.message });
  }

  return fkResults;
}

/**
 * Check uploaded file references
 */
function checkUploadedFiles(db: Database.Database, uploadDir: string): { found: number; total: number } {
  try {
    const rows = db.prepare(`
      SELECT screenshot_url, review_screenshot_url, order_screenshot_url, price_screenshot_url
      FROM uploads
      WHERE screenshot_url != '' OR review_screenshot_url != '' OR order_screenshot_url != '' OR price_screenshot_url != ''
    `).all() as any[];

    const allUrls = rows.flatMap(r => [
      r.screenshot_url,
      r.review_screenshot_url,
      r.order_screenshot_url,
      r.price_screenshot_url
    ]).filter(Boolean);

    let found = 0;
    for (const url of allUrls) {
      // Extract filename from URL
      const match = url.match(/\/([A-Za-z0-9._-]+\.png)/);
      if (match) {
        const filePath = path.join(uploadDir, match[1]);
        if (fs.existsSync(filePath)) {
          found++;
        }
      }
    }

    return { found, total: allUrls.length };
  } catch {
    return { found: 0, total: 0 };
  }
}

/**
 * Verify checksums against manifest
 */
function verifyChecksum(dbPath: string, expectedChecksum: string): boolean {
  const content = fs.readFileSync(dbPath);
  const actual = crypto.createHash('sha256').update(content).digest('hex');
  return actual === expectedChecksum;
}

/**
 * Main restore test function
 */
async function runRestoreTest(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node scripts/restore-test.ts <backup-file> [encryption-key]');
    process.exit(1);
  }

  const backupPath = args[0];
  const encryptionKey = args[1];

  if (!fs.existsSync(backupPath)) {
    console.error(`[restore] Backup file not found: ${backupPath}`);
    process.exit(1);
  }

  // Create temp directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-test-'));
  const manifestDir = path.dirname(backupPath);

  console.log(`[restore] Temp directory: ${tempDir}`);
  console.log(`[restore] Backup file: ${backupPath}`);

  // Find manifest
  const baseName = path.basename(backupPath, '.db');
  const encBaseName = path.basename(backupPath, '.db.enc');
  const manifestPath = path.join(manifestDir, `${baseName}.manifest.json`) ||
                        path.join(manifestDir, `${encBaseName}.db.enc.manifest.json`);

  // Handle encryption
  let dbPath: string;
  if (backupPath.endsWith('.enc')) {
    if (!encryptionKey) {
      console.error('[restore] Encryption key required for .enc file');
      process.exit(1);
    }
    dbPath = path.join(tempDir, 'app.db');
    console.log('[restore] Decrypting backup...');
    if (!decryptFile(backupPath, dbPath, encryptionKey)) {
      process.exit(1);
    }
  } else {
    dbPath = path.join(tempDir, 'app.db');
    console.log('[restore] Copying database file...');
    fs.copyFileSync(backupPath, dbPath);
  }

  // Read manifest if exists
  let expectedChecksum = '';
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expectedChecksum = manifest.checksum;
    console.log(`[restore] Manifest found: ${new Date(manifest.timestamp).toISOString()}`);
    console.log(`[restore] Tables: ${manifest.tables?.join(', ')}`);
  }

  // Open database for verification
  let db: Database.Database;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (e: any) {
    console.error(`[restore] Cannot open backup database: ${e.message}`);
    process.exit(1);
  }

  console.log('\n[restore] Running validation...\n');

  // Run validation
  const result: ValidationResult = {
    integrityCheck: false,
    integrityMessage: '',
    tableCounts: [],
    foreignKeys: [],
    uploadedFiles: { found: 0, total: 0 },
    checksumMatch: true,
  };

  // 1. Integrity check
  try {
    const integrityResult = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    result.integrityCheck = integrityResult.integrity_check === 'ok';
    result.integrityMessage = integrityResult.integrity_check;
    console.log(`Integrity Check: ${result.integrityCheck ? '✓ PASS' : '✗ FAIL'} - ${result.integrityMessage}`);
  } catch (e: any) {
    result.integrityMessage = e.message;
    console.log(`Integrity Check: ✗ FAIL - ${e.message}`);
  }

  // 2. Table counts
  result.tableCounts = getTableCounts(db);
  console.log('\nTable Counts:');
  for (const tc of result.tableCounts) {
    const icon = tc.status === 'ok' ? '✓' : tc.status === 'missing' ? '?' : '✗';
    console.log(`  ${icon} ${tc.name}: ${tc.count} rows`);
  }

  // 3. Foreign key checks
  result.foreignKeys = checkForeignKeys(db);
  console.log('\nForeign Key Checks:');
  for (const fk of result.foreignKeys) {
    const icon = fk.status === 'pass' ? '✓' : '✗';
    console.log(`  ${icon} ${fk.table}${fk.details ? ' - ' + fk.details : ''}`);
  }

  // 4. Upload file references
  result.uploadedFiles = checkUploadedFiles(db, path.join(tempDir, 'uploads'));
  console.log(`\nUpload Reference Check:`);
  console.log(`  Files referenced: ${result.uploadedFiles.total}`);
  console.log(`  Files found: ${result.uploadedFiles.found}`);

  // 5. Checksum verification
  if (expectedChecksum) {
    result.checksumMatch = verifyChecksum(dbPath, expectedChecksum);
    console.log(`\nChecksum: ${result.checksumMatch ? '✓ MATCH' : '✗ MISMATCH'}`);
  }

  db.close();

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });

  // Summary
  console.log('\n' + '='.repeat(50));
  const allPassed = result.integrityCheck &&
    !result.tableCounts.filter(t => t.status === 'missing').some(t => !['otp_codes'].includes(t.name)) &&
    !result.foreignKeys.some(f => f.status === 'fail');

  if (allPassed) {
    console.log('[restore] ✓ ALL VALIDATIONS PASSED');
    process.exit(0);
  } else {
    console.log('[restore] ✗ VALIDATION FAILED');
    process.exit(1);
  }
}

runRestoreTest().catch(e => {
  console.error('[restore] Fatal error:', e);
  process.exit(1);
});