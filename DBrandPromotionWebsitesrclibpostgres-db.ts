/**
 * PostgreSQL database layer - compatible with SQLite API
 * Used when DATABASE_URL is set in environment
 */

import pg from "pg";

const { Pool } = pg;

// Global pool instance
let pool: Pool | null = null;

export function getPgPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL not set");
    }
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export function isPostgresConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

/**
 * PostgreSQL statement wrapper that mimics better-sqlite3 API
 */
export class PgStatement {
  private sql: string;
  private pool: Pool;

  constructor(pool: Pool, sql: string) {
    this.sql = sql;
    this.pool = pool;
  }

  async get(params?: unknown[]): Promise<Record<string, unknown> | undefined> {
    const result = await this.pool.query(this.sql, params || []);
    return result.rows[0];
  }

  async all(params?: unknown[]): Promise<Record<string, unknown>[]> {
    const result = await this.pool.query(this.sql, params || []);
    return result.rows;
  }

  async run(params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number }> {
    const result = await this.pool.query(this.sql, params || []);
    return {
      changes: result.rowCount || 0,
      lastInsertRowid: result.rows[0]?.id as number || 0,
    };
  }
}

export class PgDatabase {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  prepare(sql: string): PgStatement {
    return new PgStatement(this.pool, sql);
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }
}

let pgDb: PgDatabase | null = null;

export function getPgDb(): PgDatabase {
  if (!pgDb) {
    pgDb = new PgDatabase(getPgPool());
  }
  return pgDb;
}
