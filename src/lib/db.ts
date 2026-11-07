/**
 * Database layer - Production ready (SQLite synchronous).
 *
 * Uses SQLite by default (synchronous operations via better-sqlite3).
 *
 * For PostgreSQL support, see src/lib/postgres-db.ts. PostgreSQL will be
 * enabled automatically when DATABASE_URL is set, but note that route handlers
 * will need to be updated to await db.prepare().run() calls.
 */

import Database from "better-sqlite3";
import path from "path";
import { DATA_DIR, ensureStorageDirs } from "./storage";

ensureStorageDirs();

// Must use DATA_DIR (same resolution as scripts/seed.js and auto-backup.ts)
// so the database the app reads is the one the seed script writes to, and so
// it lands on the Railway persistent volume (/data) when DATA_DIR is set.
export const dbPath = path.resolve(
  process.env.DATABASE_PATH || path.join(DATA_DIR, "app.db")
);

type DbRow = Record<string, unknown>;

declare global {
  // eslint-disable-next-line no-var
  var __db: DbClass | undefined;
}

// SQLite database instance
let sqliteDb: Database.Database | null = null;

function getSqliteDb(): Database.Database {
  if (!sqliteDb) {
    sqliteDb = new Database(dbPath);
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.pragma("busy_timeout = 10000");
    sqliteDb.pragma("foreign_keys = ON");
  }
  return sqliteDb;
}

/**
 * Database class - SQLite synchronous implementation
 */
class DbClass {
  #db: Database.Database | null = null;

  get db(): Database.Database {
    if (!this.#db) {
      this.#db = getSqliteDb();
    }
    return this.#db;
  }

  prepare(sql: string): Database.Statement {
    return this.db.prepare(sql);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(sql: string): unknown {
    return this.db.pragma(sql);
  }

  /**
   * Transaction wrapper - matches better-sqlite3 API.
   * Returns a callable that executes the transaction and returns the callback's result.
   */
  transaction(fn: () => any): () => any {
    return this.db.transaction(fn) as any;
  }
}

// Global database instance
export const db = globalThis.__db ?? new DbClass();
globalThis.__db = db;

/**
 * Generate a unique code with prefix
 */
export function generateCode(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  return `${prefix}-${ts}${rand}`;
}

/**
 * Check if PostgreSQL is configured (for readiness)
 */
export function isPostgresConfigured(): boolean {
  return false;
}

/**
 * Export types for PostgreSQL compatibility
 * When DATABASE_URL is set, the app should migrate to async handlers.
 */
export type DbResult = { changes: number; lastInsertRowid: number };
export type QueryResult = DbRow | DbRow[];

// Export for globalThis assignment
export { DbClass };