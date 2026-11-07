#!/usr/bin/env node
/**
 * Create Admin Account Script
 *
 * Creates or updates the admin account from environment variables.
 * Safe to run multiple times - will update password if ADMIN_PASSWORD changes.
 *
 * Usage: NODE_ENV=production node scripts/create-admin.js
 */

const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'app.db');
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@brandpromotion.in').toLowerCase().trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

if (!ADMIN_PASSWORD) {
  console.error('[create-admin] ADMIN_PASSWORD not set - nothing to do');
  process.exit(0);
}

function main() {
  const db = new Database(DB_PATH);

  try {
    const existing = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(ADMIN_EMAIL);
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);

    if (!existing) {
      db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, "admin")')
        .run('Administrator', ADMIN_EMAIL, hash);
      console.log(`[create-admin] Created admin account: ${ADMIN_EMAIL}`);
    } else if (existing.password_hash !== hash) {
      db.prepare('UPDATE users SET name = "Administrator", password_hash = ?, role = "admin" WHERE id = ?')
        .run(hash, existing.id);
      console.log(`[create-admin] Updated admin password for: ${ADMIN_EMAIL}`);
    } else {
      console.log(`[create-admin] Admin account already up to date: ${ADMIN_EMAIL}`);
    }
  } finally {
    db.close();
  }
}

main();