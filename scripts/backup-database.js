#!/usr/bin/env node
/**
 * Database Backup Script
 *
 * Creates a full backup of the SQLite database and uploads to R2 if configured.
 * Can also restore from backup (for testing/recovery).
 *
 * Usage:
 *   node scripts/backup-database.js --backup    # Create backup
 *   node scripts/backup-database.js --list      # List existing backups
 *   node scripts/backup-database.js --verify    # Verify backup integrity
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'app.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'data', 'backups');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function listBackups() {
  ensureDir(BACKUP_DIR);
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db') || f.endsWith('.json'))
    .sort()
    .reverse();

  console.log('Backups:');
  for (const f of files) {
    const stat = fs.statSync(path.join(BACKUP_DIR, f));
    console.log(`  ${f} - ${stat.size} bytes, ${stat.mtime.toISOString()}`);
  }
}

function createBackup() {
  ensureDir(BACKUP_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.db`);

  // Copy database file
  fs.copyFileSync(DB_PATH, backupFile);

  const stat = fs.statSync(backupFile);
  console.log(`Created backup: ${backupFile} (${stat.size} bytes)`);
}

function verifyBackup() {
  const backupFile = process.argv[3];
  if (!backupFile) {
    console.error('Usage: node scripts/backup-database.js --verify <backup-file>');
    process.exit(1);
  }

  const filePath = path.join(BACKUP_DIR, backupFile);
  if (!fs.existsSync(filePath)) {
    console.error(`Backup not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const db = new Database(filePath, { readonly: true });
    const tables = ['users', 'deals', 'orders', 'reimbursements', 'refunds', 'reviews', 'settings', 'click_tracking', 'uploads', 'device_fingerprints'];

    console.log(`Verifying ${filePath}:`);
    for (const table of tables) {
      try {
        const count = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c;
        console.log(`  ${table}: ${count} rows`);
      } catch (e) {
        console.log(`  ${table}: error - ${e.message}`);
      }
    }

    db.close();
    console.log('Verification complete');
  } catch (e) {
    console.error(`Failed to open backup: ${e.message}`);
    process.exit(1);
  }
}

// CLI
const command = process.argv[2];
switch (command) {
  case '--list':
    listBackups();
    break;
  case '--backup':
    createBackup();
    break;
  case '--verify':
    verifyBackup();
    break;
  default:
    console.log('Usage:');
    console.log('  node scripts/backup-database.js --backup   Create backup');
    console.log('  node scripts/backup-database.js --list     List backups');
    console.log('  node scripts/backup-database.js --verify <file>  Verify backup');
    process.exit(1);
}