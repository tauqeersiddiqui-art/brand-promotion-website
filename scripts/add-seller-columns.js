#!/usr/bin/env node
/**
 * Add seller contact columns to the deals table.
 *
 * Safe to run on an existing database — it skips columns that already exist.
 * Run:  node scripts/add-seller-columns.js
 */
const path = require("path");
const Database = require("better-sqlite3");

const DATA_DIR = path.resolve(
  process.env.DATA_DIR || path.join(process.cwd(), "data")
);
const dbPath = process.env.DATABASE_PATH || path.join(DATA_DIR, "app.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const columns = [
  { name: "seller_name", sql: "ALTER TABLE deals ADD COLUMN seller_name TEXT NOT NULL DEFAULT ''" },
  { name: "seller_contact", sql: "ALTER TABLE deals ADD COLUMN seller_contact TEXT NOT NULL DEFAULT ''" },
  { name: "seller_telegram", sql: "ALTER TABLE deals ADD COLUMN seller_telegram TEXT NOT NULL DEFAULT ''" },
];

for (const { name, sql } of columns) {
  try {
    db.exec(sql);
    console.log(`✓ Added column deals.${name}`);
  } catch (e) {
    if (/duplicate column|already exists/i.test(e.message)) {
      console.log(`- Column deals.${name} already exists — skipped`);
    } else {
      console.error(`✗ Failed to add deals.${name}: ${e.message}`);
      process.exit(1);
    }
  }
}

db.close();
console.log("Done. Seller columns are ready.");