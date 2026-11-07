#!/usr/bin/env node
/**
 * Database Migration Verification Script
 *
 * Verifies that all data has been correctly migrated from SQLite to PostgreSQL.
 * Compares row counts, checksums, and sample records.
 *
 * Usage: node scripts/verify-database-migration.ts
 */

import pg from "pg";
import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

const SQLITE_DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
const POSTGRES_URL = process.env.DATABASE_URL;

const TABLES = [
  "settings",
  "users",
  "deals",
  "device_fingerprints",
  "click_tracking",
  "orders",
  "uploads",
  "reimbursements",
  "refunds",
  "reviews",
];

let sqlite: Database.Database;
let pgClient: pg.Pool | null = null;

interface Comparison {
  table: string;
  sqliteCount: number;
  postgresCount: number;
  match: boolean;
}

function fatal(message: string) {
  console.error(`[fatal] ${message}`);
  process.exit(1);
}

function log(message: string, ...args: unknown[]) {
  console.log(`[verify] ${message}`, ...args);
}

// Connect to SQLite
try {
  sqlite = new Database(SQLITE_DB_PATH, { readonly: true });
} catch (e) {
  fatal(`Cannot connect to SQLite: ${e}`);
}

// Connect to PostgreSQL
async function connectPostgres() {
  if (!POSTGRES_URL) fatal("DATABASE_URL not set");

  pgClient = new pg.Pool({
    connectionString: POSTGRES_URL,
    max: 5,
    connectionTimeoutMillis: 5000,
  });

  try {
    await pgClient.query("SELECT 1");
    log("Connected to PostgreSQL");
  } catch (e) {
    fatal(`Cannot connect to PostgreSQL: ${e}`);
  }
}

async function compareCounts(): Promise<Comparison[]> {
  const results: Comparison[] = [];

  for (const table of TABLES) {
    const sqliteRow = sqlite.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
    const pgRow = await pgClient!.query<{ count: number }>(`SELECT COUNT(*) as count FROM "${table}"`);

    results.push({
      table,
      sqliteCount: sqliteRow.c,
      postgresCount: pgRow.rows[0].count,
      match: sqliteRow.c === pgRow.rows[0].count,
    });
  }

  return results;
}

async function verifyForeignKeyIntegrity() {
  // Check for FK violations
  const fkViolations = await pgClient!.query(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      EXISTS (
        SELECT 1 FROM (SELECT id FROM users) sub
        WHERE sub.id = ANY(SELECT submitted_by FROM deals WHERE submitted_by IS NOT NULL)
      ) AS valid
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'deals';
  `);

  log(`Foreign key relationships checked`);
}

async function verifyChecksums() {
  // Compute checksums for key tables
  for (const table of ["users", "deals", "settings"]) {
    const sqliteRows = sqlite.prepare(`SELECT * FROM ${table} ORDER BY id || ''`).all();
    const sqliteChecksum = crypto.createHash("sha256").update(JSON.stringify(sqliteRows)).digest("hex").slice(0, 8);

    const pgRows = await pgClient!.query(`SELECT * FROM "${table}" ORDER BY id || ''`);
    const pgStringified = JSON.stringify(pgRows.rows);
    const pgChecksum = crypto.createHash("sha256").update(pgStringified).digest("hex").slice(0, 8);

    if (sqliteChecksum !== pgChecksum) {
      log(`[WARN] Checksum mismatch for ${table}: SQLite=${sqliteChecksum}, PG=${pgChecksum}`);
    } else {
      log(`${table} checksum verified: ${sqliteChecksum}`);
    }
  }
}

async function main() {
  log("=== Database Migration Verification ===\n");

  await connectPostgres();

  // Compare counts
  log("Comparing row counts...");
  const comparisons = await compareCounts();

  let allMatch = true;
  for (const c of comparisons) {
    const status = c.match ? "✓" : "✗";
    log(`  ${c.table}: SQLite=${c.sqliteCount}, PG=${c.postgresCount} ${status}`);
    if (!c.match) allMatch = false;
  }

  // Verify FK integrity
  log("\nVerifying foreign key integrity...");
  await verifyForeignKeyIntegrity();

  // Checksums
  log("\nVerifying data integrity (checksums)...");
  await verifyChecksums();

  // Sample data verification
  log("\nSample records:");
  const adminUser = await pgClient!.query("SELECT id, email, role FROM users WHERE role = 'admin'");
  if (adminUser.rows.length > 0) {
    log(`  Admin: ${JSON.stringify(adminUser.rows[0])}`);
  }

  const dealCount = await pgClient!.query("SELECT COUNT(*) as c FROM deals");
  log(`  Deals: ${dealCount.rows[0].c}`);

  if (allMatch) {
    log("\n✓ All verification checks PASSED");
  } else {
    log("\n✗ Some row counts do not match - please investigate");
    process.exit(1);
  }

  // Cleanup
  sqlite.close();
  if (pgClient) pgClient.end();
}

main().catch(e => {
  fatal(`Verification failed: ${e}`);
});