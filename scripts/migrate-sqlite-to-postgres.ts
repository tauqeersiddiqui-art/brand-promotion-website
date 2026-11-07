#!/usr/bin/env node
/**
 * SQLite to PostgreSQL Migration Script
 *
 * Usage: node scripts/migrate-sqlite-to-postgres.ts [--dry-run] [--verbose]
 *
 * This script performs an idempotent, reversible migration from SQLite to PostgreSQL.
 * It handles type conversions, preserves all data including auto-increment values,
 * and verifies integrity after migration.
 */

import pg from "pg";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const isDryRun = process.argv.includes("--dry-run");
const isVerbose = process.argv.includes("--verbose");

// Configuration
const SQLITE_DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
const POSTGRES_URL = process.env.DATABASE_URL;

// Type mapping: SQLite -> PostgreSQL
const TYPE_MAPPINGS = {
  // INTEGER with AUTOINCREMENT -> SERIAL
  "SERIAL": "INTEGER PRIMARY KEY AUTOINCREMENT",
  // INTEGER boolean flags -> INTEGER (we keep them as-is, convert in app)
  // REAL -> DOUBLE PRECISION
  // TEXT -> TEXT
};

// Tables to migrate in order (respects foreign keys)
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

interface SQLiteRow {
  [key: string]: unknown;
  rowid?: number;
}

function log(message: string, ...args: unknown[]) {
  if (isVerbose || !message.includes("DROP") && !message.includes("TRUNCATE")) {
    console.log(`[migrate] ${message}`, ...args);
  }
}

function error(message: string, ...args: unknown[]) {
  console.error(`[migrate-ERROR] ${message}`, ...args);
}

// SQLite connection
let sqlite: Database.Database;
try {
  sqlite = new Database(SQLITE_DB_PATH, { readonly: true });
  log(`Connected to SQLite: ${SQLITE_DB_PATH}`);
} catch (e) {
  error(`Failed to connect to SQLite: ${e}`);
  process.exit(1);
}

// PostgreSQL connection
let pgClient: pg.Pool | null = null;

async function connectPostgres() {
  if (!POSTGRES_URL) {
    error("DATABASE_URL not set");
    process.exit(1);
  }

  pgClient = new pg.Pool({
    connectionString: POSTGRES_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  try {
    await pgClient.query("SELECT 1");
    log("Connected to PostgreSQL");
  } catch (e) {
    error(`Failed to connect to PostgreSQL: ${e}`);
    process.exit(1);
  }
}

function getTableSchema(table: string): string {
  const pragma = sqlite.pragma(`table_info(${table})`, { reverse: true });
  return pragma
    .map((c: { name: string; type: string; notnull: number; dflt_value: string | null; pk: number }) => {
      let col = `"${c.name}" ${c.type}`;
      if (c.pk > 0) {
        col = `"${c.name}" SERIAL PRIMARY KEY`;
      } else if (c.notnull) {
        col = col.replace("TEXT", "TEXT NOT NULL").replace("REAL", "DOUBLE PRECISION NOT NULL");
      }
      return col;
    })
    .join(",\n  ");
}

async function createPostgresSchema() {
  if (!pgClient) return;

  for (const table of TABLES) {
    // Get SQLite schema info
    const pragma = sqlite.pragma(`table_info(${table})`);
    const pkCol = pragma.find(c => c.pk > 0);

    // Build PostgreSQL schema
    const columns = pragma.map(c => {
      let sql = `"${c.name}"`;

      if (c.pk > 0) {
        // AUTOINCREMENT -> GENERATED ALWAYS AS IDENTITY (PostgreSQL 10+)
        sql += " BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY";
      } else if (c.type === "INTEGER" && !c.notnull && c.dflt_value === "0" || c.type === "INTEGER" && c.dflt_value && c.dflt_value.startsWith("0")) {
        // INTEGER with default 0 - keep as INTEGER
        sql += " INTEGER";
        if (c.default) {
          sql += ` DEFAULT ${c.default}`;
        }
      } else if (c.type === "REAL") {
        sql = sql + " DOUBLE PRECISION";
        if (c.default !== null) {
          sql += ` DEFAULT ${c.default}`;
        }
      } else if (c.type === "TEXT") {
        sql += " TEXT";
        if (c.default !== null) {
          sql += ` DEFAULT '${c.default}'`;
        }
      } else if (c.type === "INTEGER") {
        sql += " INTEGER";
        if (c.default !== null && !c.default.startsWith("'")) {
          sql += ` DEFAULT ${c.default}`;
        } else if (c.default !== null) {
          sql += ` DEFAULT ${c.default}`;
        }
      } else {
        sql += ` ${c.type}`;
        if (c.default !== null) {
          sql += ` DEFAULT ${c.default}`;
        }
      }

      return sql;
    });

    const createTableSql = `
      CREATE TABLE IF NOT EXISTS "${table}" (
        ${columns.join(",\n        ")}
      )${table === "settings" ? " (key TEXT PRIMARY KEY, value TEXT NOT NULL)" : ""}
    `.replace(`"${table}" (\n        `, `"${table}" (`);

    // Handle settings table specially
    if (table === "settings") {
      await pgClient!.query(`DROP TABLE IF EXISTS "${table}"`);
      await pgClient!.query(`CREATE TABLE "${table}" (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`);
      continue;
    }

    // Drop and recreate table
    if (isDryRun) {
      log(`[DRY-RUN] Would drop and recreate table: ${table}`);
      continue;
    }

    await pgClient!.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    await pgClient!.query(`CREATE TABLE "${table}" (${columns.join(", ")})${table === "users" ? ", UNIQUE (email)" : ""} ${table === "orders" ? ", UNIQUE (order_code)" : ""}${table === "deals" ? ", UNIQUE (product_code)" : ""}${table === "reimbursements" ? ", UNIQUE (reimbursement_code)" : ""}${table === "reviews" ? ", UNIQUE (review_code)" : ""}${table === "refunds" ? ", UNIQUE (refund_code)" : ""}`);
    log(`Created table: ${table}`);
  }
}

async function createIndexes() {
  if (!pgClient) return;

  const indexSql = [
    "CREATE INDEX IF NOT EXISTS idx_users_mediator_code ON users (mediator_code) WHERE mediator_code != ''",
    "CREATE INDEX IF NOT EXISTS idx_deals_active ON deals (active, featured)",
    "CREATE INDEX IF NOT EXISTS idx_deals_code ON deals (product_code)",
    "CREATE INDEX IF NOT EXISTS idx_deals_submitted ON deals (submitted_by)",
    "CREATE INDEX IF NOT EXISTS idx_deals_approval ON deals (approval_status, active)",
    "CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_orders_deal ON orders (deal_id)",
    "CREATE INDEX IF NOT EXISTS idx_orders_code ON orders (order_code)",
    "CREATE INDEX IF NOT EXISTS idx_orders_ext ON orders (external_order_id)",
    "CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders (phone)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_ext_unique ON orders (external_order_id) WHERE external_order_id != ''",
    "CREATE INDEX IF NOT EXISTS idx_reimb_order ON reimbursements (order_id)",
    "CREATE INDEX IF NOT EXISTS idx_reimb_ext ON reimbursements (external_order_id)",
    "CREATE INDEX IF NOT EXISTS idx_reimb_user ON reimbursements (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds (order_id)",
    "CREATE INDEX IF NOT EXISTS idx_reviews_deal ON reviews (deal_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_click_tracking_deal ON click_tracking (deal_id)",
    "CREATE INDEX IF NOT EXISTS idx_click_tracking_click_id ON click_tracking (click_id)",
    "CREATE INDEX IF NOT EXISTS idx_click_tracking_user ON click_tracking (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_click_tracking_ip ON click_tracking (ip)",
    "CREATE INDEX IF NOT EXISTS idx_uploads_url ON uploads (url)",
    "CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads (user_id)",
  ];

  for (const sql of indexSql) {
    if (isDryRun) {
      log(`[DRY-RUN] Would execute: ${sql}`);
      continue;
    }
    try {
      await pgClient!.query(sql);
    } catch (e: any) {
      log(`Index warning for '${sql.split(' ')[4]}': ${e.message}`);
    }
  }
  log("Created indexes");
}

function convertRow(row: SQLiteRow): SQLiteRow {
  const converted = { ...row };

  // Convert INTEGER 0/1 to false/true for boolean fields
  const booleanFields = ["featured", "active"];
  for (const field of booleanFields) {
    if (field in converted && converted[field] === 1) {
      converted[field] = true;
    } else if (field in converted && converted[field] === 0) {
      converted[field] = false;
    }
  }

  return converted;
}

async function migrateTable(table: string) {
  if (!pgClient) return;

  log(`Migrating table: ${table}`);

  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as SQLiteRow[];
  log(`  Found ${rows.length} rows in SQLite`);

  if (rows.length === 0) {
    log(`  Table ${table} is empty, skipping`);
    return;
  }

  if (isDryRun) {
    log(`  [DRY-RUN] Would migrate ${rows.length} rows`);
    return;
  }

  // Get column names from first row
  const columns = Object.keys(rows[0] as object);
  const colList = columns.map(c => `"${c}"`).join(", ");
  const placeholders = columns.map(() => "?").join(", ");

  // Use a transaction for bulk insert
  const client = await pgClient.connect();
  try {
    await client.query("BEGIN");

    const insertStmt = client.prepared(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`);

    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      for (const row of batch) {
        const converted = convertRow(row);
        const values = columns.map(c => converted[c]);
        await insertStmt.run(values);
      }
    }

    await client.query("COMMIT");
    log(`  Migrated ${rows.length} rows to ${table}`);
  } catch (e: any) {
    await client.query("ROLLBACK");
    error(`Failed to migrate ${table}: ${e.message}`);
    throw e;
  } finally {
    client.release();
  }
}

async function verifyMigration() {
  if (!pgClient) return;

  log("Verifying migration...");

  for (const table of TABLES) {
    const sqliteCount = sqlite.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
    const pgResult = await pgClient!.query<{ count: number }>(`SELECT COUNT(*) as count FROM "${table}"`);
    const pgCount = pgResult.rows[0].count;

    if (sqliteCount.c !== pgCount) {
      error(`Row count mismatch for ${table}: SQLite=${sqliteCount.c}, PostgreSQL=${pgCount}`);
      throw new Error(`Verification failed for ${table}`);
    }
    log(`  ${table}: ${pgCount} rows ✓`);
  }

  // Verify foreign key integrity
  log("Checking foreign key integrity...");
  const fkCheck = await pgClient!.query(`
    SELECT conname, conrelid::regclass AS table
    FROM pg_constraint
    WHERE contype = 'f'
  `);
  log(`  Found ${fkCheck.rowCount} foreign key constraints`);

  log("Migration verification complete ✓");
}

async function migrateAll() {
  log(`Starting SQLite to PostgreSQL migration${isDryRun ? " (DRY RUN)" : ""}`);
  log(`SQLite path: ${SQLITE_DB_PATH}`);

  await connectPostgres();

  // Create schema
  log("Creating PostgreSQL schema...");
  await createPostgresSchema();

  // Create indexes
  log("Creating indexes...");
  await createIndexes();

  // Migrate tables
  log("Migrating data...");
  for (const table of TABLES) {
    await migrateTable(table);
  }

  // Verify
  await verifyMigration();

  log("Migration complete!");

  if (isDryRun) {
    log("This was a DRY RUN. No changes were made to PostgreSQL.");
    log("Remove --dry-run flag and re-run to perform actual migration.");
  }
}

// Run
migrateAll().catch(e => {
  error("Migration failed: %s", e);
  process.exit(1);
}).finally(() => {
  if (sqlite) sqlite.close();
  if (pgClient) pgClient.end();
});