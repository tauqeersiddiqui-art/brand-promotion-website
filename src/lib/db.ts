import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, "app.db");

declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

/**
 * Canonical table definitions.
 *
 * Kept as a re-runnable string because the migration in
 * `reconcileCheckConstraints` re-executes it after renaming a legacy table
 * aside, which is how the up-to-date definition is applied to an existing
 * database. Every statement is therefore `IF NOT EXISTS`.
 */
const SCHEMA_DDL = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
      provider TEXT NOT NULL DEFAULT 'credentials',
      google_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_code TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'General',
      platform TEXT NOT NULL DEFAULT 'Amazon',
      deal_type TEXT NOT NULL DEFAULT '100% Cashback',
      image_url TEXT NOT NULL DEFAULT '',
      deal_url TEXT NOT NULL DEFAULT '',
      target_keyword TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      coupon_code TEXT NOT NULL DEFAULT '',
      price_original REAL NOT NULL DEFAULT 0,
      price_sale REAL NOT NULL DEFAULT 0,
      cashback_amount REAL NOT NULL DEFAULT 0,
      total_slots INTEGER NOT NULL DEFAULT 50,
      claimed_slots INTEGER NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT NOT NULL UNIQUE,
      external_order_id TEXT NOT NULL DEFAULT '',
      product_code TEXT NOT NULL DEFAULT '',
      deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      click_id TEXT REFERENCES click_tracking(click_id) ON DELETE SET NULL,
      reviewer_name TEXT NOT NULL DEFAULT '',
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'Amazon',
      deal_type TEXT NOT NULL DEFAULT '100% Cashback',
      mediator_name TEXT NOT NULL DEFAULT 'Direct',
      order_date TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      pincode TEXT NOT NULL DEFAULT '',
      variant TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '',
      unit_price REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      order_screenshot_url TEXT NOT NULL DEFAULT '',
      price_screenshot_url TEXT NOT NULL DEFAULT '',
      ocr_order_id TEXT NOT NULL DEFAULT '',
      ocr_order_match INTEGER NOT NULL DEFAULT 0,
      ocr_amount REAL NOT NULL DEFAULT 0,
      ocr_amount_match INTEGER NOT NULL DEFAULT 0,
      device_fingerprint TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      fraud_score INTEGER NOT NULL DEFAULT 0,
      validation_score INTEGER NOT NULL DEFAULT 0,
      validation_details TEXT NOT NULL DEFAULT '',
      admin_note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','verified','shipped','delivered','rejected','cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      -- Stamped once when the order first reaches 'delivered'. Part of the
      -- canonical definition (not an ALTER) so the CHECK-constraint rebuild
      -- migration does not drop it.
      delivered_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reimbursements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reimbursement_code TEXT NOT NULL UNIQUE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
      external_order_id TEXT NOT NULL DEFAULT '',
      reviewer_name TEXT NOT NULL DEFAULT '',
      review_rating INTEGER NOT NULL DEFAULT 5 CHECK (review_rating BETWEEN 1 AND 5),
      review_text TEXT NOT NULL DEFAULT '',
      review_link TEXT NOT NULL DEFAULT '',
      review_screenshot_url TEXT NOT NULL DEFAULT '',
      order_screenshot_url TEXT NOT NULL DEFAULT '',
      seller_feedback_url TEXT NOT NULL DEFAULT '',
      mediator_name TEXT NOT NULL DEFAULT '',
      ocr_text TEXT NOT NULL DEFAULT '',
      order_ocr_text TEXT NOT NULL DEFAULT '',
      ocr_status TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending','done','failed')),
      payout_method TEXT NOT NULL DEFAULT 'upi' CHECK (payout_method IN ('upi','bank')),
      upi_id TEXT NOT NULL DEFAULT '',
      bank_name TEXT NOT NULL DEFAULT '',
      account_number TEXT NOT NULL DEFAULT '',
      ifsc_code TEXT NOT NULL DEFAULT '',
      account_holder TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','approved','paid','rejected')),
      utr_number TEXT NOT NULL DEFAULT '',
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refund_code TEXT NOT NULL UNIQUE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','processed')),
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_code TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
      text TEXT NOT NULL DEFAULT '',
      screenshot_url TEXT NOT NULL DEFAULT '',
      ocr_text TEXT NOT NULL DEFAULT '',
      ocr_status TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending','done','failed')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS click_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      click_id TEXT NOT NULL UNIQUE,
      deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      referrer TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      ocr_text TEXT NOT NULL DEFAULT '',
      ocr_order_id TEXT NOT NULL DEFAULT '',
      ocr_amount REAL NOT NULL DEFAULT 0,
      ocr_date TEXT NOT NULL DEFAULT '',
      ocr_status TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending','done','failed')),
      p_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS device_fingerprints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL UNIQUE,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      order_count INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `;

/**
 * `next build` collects pages in parallel workers and each one opens the same
 * SQLite file, so two workers can race to add the same column. The loser gets
 * "duplicate column name", which is harmless: the column now exists.
 */
function execTolerateDuplicate(database: Database.Database, sql: string) {
  try {
    database.exec(sql);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/duplicate column name/i.test(message)) throw err;
  }
}

function createDb(): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 10000");
  db.pragma("foreign_keys = ON");

  db.exec(SCHEMA_DDL);

  // Column migrations for dynamic upgrades of existing tables
  const userCols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  if (!userCols.includes("provider")) {
    db.exec("ALTER TABLE users ADD COLUMN provider TEXT NOT NULL DEFAULT 'credentials'");
  }
  if (!userCols.includes("google_id")) {
    db.exec("ALTER TABLE users ADD COLUMN google_id TEXT");
  }

  const dealCols = (db.prepare("PRAGMA table_info(deals)").all() as { name: string }[]).map((c) => c.name);
  if (!dealCols.includes("product_code")) {
    db.exec("ALTER TABLE deals ADD COLUMN product_code TEXT NOT NULL DEFAULT ''");
  }
  if (!dealCols.includes("platform")) {
    db.exec("ALTER TABLE deals ADD COLUMN platform TEXT NOT NULL DEFAULT 'Amazon'");
  }
  if (!dealCols.includes("deal_type")) {
    db.exec("ALTER TABLE deals ADD COLUMN deal_type TEXT NOT NULL DEFAULT '100% Cashback'");
  }
  if (!dealCols.includes("target_keyword")) {
    db.exec("ALTER TABLE deals ADD COLUMN target_keyword TEXT NOT NULL DEFAULT ''");
  }
  if (!dealCols.includes("instructions")) {
    db.exec("ALTER TABLE deals ADD COLUMN instructions TEXT NOT NULL DEFAULT ''");
  }
  if (!dealCols.includes("cashback_amount")) {
    db.exec("ALTER TABLE deals ADD COLUMN cashback_amount REAL NOT NULL DEFAULT 0");
  }
  if (!dealCols.includes("total_slots")) {
    db.exec("ALTER TABLE deals ADD COLUMN total_slots INTEGER NOT NULL DEFAULT 50");
  }
  if (!dealCols.includes("claimed_slots")) {
    db.exec("ALTER TABLE deals ADD COLUMN claimed_slots INTEGER NOT NULL DEFAULT 0");
  }

  const orderCols = (db.prepare("PRAGMA table_info(orders)").all() as { name: string }[]).map((c) => c.name);
  if (!orderCols.includes("external_order_id")) {
    db.exec("ALTER TABLE orders ADD COLUMN external_order_id TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.includes("product_code")) {
    db.exec("ALTER TABLE orders ADD COLUMN product_code TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.includes("reviewer_name")) {
    db.exec("ALTER TABLE orders ADD COLUMN reviewer_name TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.includes("platform")) {
    db.exec("ALTER TABLE orders ADD COLUMN platform TEXT NOT NULL DEFAULT 'Amazon'");
  }
  if (!orderCols.includes("deal_type")) {
    db.exec("ALTER TABLE orders ADD COLUMN deal_type TEXT NOT NULL DEFAULT '100% Cashback'");
  }
  if (!orderCols.includes("mediator_name")) {
    db.exec("ALTER TABLE orders ADD COLUMN mediator_name TEXT NOT NULL DEFAULT 'Direct'");
  }
  if (!orderCols.includes("order_date")) {
    db.exec("ALTER TABLE orders ADD COLUMN order_date TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.includes("order_screenshot_url")) {
    db.exec("ALTER TABLE orders ADD COLUMN order_screenshot_url TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.includes("price_screenshot_url")) {
    db.exec("ALTER TABLE orders ADD COLUMN price_screenshot_url TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.includes("ocr_order_id")) {
    db.exec("ALTER TABLE orders ADD COLUMN ocr_order_id TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.includes("ocr_order_match")) {
    db.exec("ALTER TABLE orders ADD COLUMN ocr_order_match INTEGER NOT NULL DEFAULT 0");
  }
  if (!orderCols.includes("ocr_amount")) {
    db.exec("ALTER TABLE orders ADD COLUMN ocr_amount REAL NOT NULL DEFAULT 0");
  }
  if (!orderCols.includes("ocr_amount_match")) {
    db.exec("ALTER TABLE orders ADD COLUMN ocr_amount_match INTEGER NOT NULL DEFAULT 0");
  }
  if (!orderCols.includes("device_fingerprint")) {
    db.exec("ALTER TABLE orders ADD COLUMN device_fingerprint TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.includes("ip")) {
    db.exec("ALTER TABLE orders ADD COLUMN ip TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.includes("fraud_score")) {
    db.exec("ALTER TABLE orders ADD COLUMN fraud_score INTEGER NOT NULL DEFAULT 0");
  }
  if (!orderCols.includes("validation_score")) {
    db.exec("ALTER TABLE orders ADD COLUMN validation_score INTEGER NOT NULL DEFAULT 0");
  }
  if (!orderCols.includes("validation_details")) {
    db.exec("ALTER TABLE orders ADD COLUMN validation_details TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.includes("click_id")) {
    db.exec("ALTER TABLE orders ADD COLUMN click_id TEXT REFERENCES click_tracking(click_id) ON DELETE SET NULL");
  }
  if (!orderCols.includes("admin_note")) {
    db.exec("ALTER TABLE orders ADD COLUMN admin_note TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.includes("updated_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  }
  // Records when an order actually reached `delivered`. The 14-day return
  // window used `updated_at`, which every admin status change or note edit
  // resets, so annotating a delivered order restarted the buyer's clock.
  if (!orderCols.includes("delivered_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN delivered_at TEXT NOT NULL DEFAULT ''");
  }

  // Reimbursement claims now carry a second proof: a screenshot of the order
  // page showing the marketplace Order ID and that the return window has
  // closed. Stored separately from the review screenshot so admins can verify
  // both, together with its own OCR text.
  const reimbCols = (db.prepare("PRAGMA table_info(reimbursements)").all() as { name: string }[]).map(
    (c) => c.name
  );
  if (!reimbCols.includes("order_screenshot_url")) {
    execTolerateDuplicate(db, "ALTER TABLE reimbursements ADD COLUMN order_screenshot_url TEXT NOT NULL DEFAULT ''");
  }
  if (!reimbCols.includes("order_ocr_text")) {
    execTolerateDuplicate(db, "ALTER TABLE reimbursements ADD COLUMN order_ocr_text TEXT NOT NULL DEFAULT ''");
  }
  // Refund claims also need the seller-feedback form screenshot and the name of
  // the mediator who handled the order, as requested by the ops team.
  if (!reimbCols.includes("seller_feedback_url")) {
    execTolerateDuplicate(db, "ALTER TABLE reimbursements ADD COLUMN seller_feedback_url TEXT NOT NULL DEFAULT ''");
  }
  if (!reimbCols.includes("mediator_name")) {
    execTolerateDuplicate(db, "ALTER TABLE reimbursements ADD COLUMN mediator_name TEXT NOT NULL DEFAULT ''");
  }

  // Create indexes now that all columns are guaranteed to exist
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_deals_active ON deals(active, featured);
    CREATE INDEX IF NOT EXISTS idx_deals_code ON deals(product_code);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_deal ON orders(deal_id);
    CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code);
    CREATE INDEX IF NOT EXISTS idx_orders_ext ON orders(external_order_id);
    CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_ext_unique ON orders(external_order_id) WHERE external_order_id != '';
    CREATE INDEX IF NOT EXISTS idx_reimb_order ON reimbursements(order_id);
    CREATE INDEX IF NOT EXISTS idx_reimb_ext ON reimbursements(external_order_id);
    CREATE INDEX IF NOT EXISTS idx_reimb_user ON reimbursements(user_id);
    CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_deal ON reviews(deal_id, status);
    CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
    CREATE INDEX IF NOT EXISTS idx_click_tracking_deal ON click_tracking(deal_id);
    CREATE INDEX IF NOT EXISTS idx_click_tracking_click_id ON click_tracking(click_id);
    CREATE INDEX IF NOT EXISTS idx_click_tracking_user ON click_tracking(user_id);
    CREATE INDEX IF NOT EXISTS idx_click_tracking_ip ON click_tracking(ip);
    CREATE INDEX IF NOT EXISTS idx_uploads_url ON uploads(url);
  `);

  // Rebuild tables whose legacy CHECK constraints are missing statuses the
  // application now uses. SQLite cannot ALTER a CHECK constraint in place, so
  // this uses the documented rebuild procedure.
  reconcileCheckConstraints(db, [
    {
      table: "orders",
      // The legacy table omitted 'verified' and 'rejected', so an admin marking
      // an order with either status hit "CHECK constraint failed" (HTTP 500).
      mustContain: ["'verified'", "'rejected'"],
    },
    {
      table: "reimbursements",
      // The legacy table omitted 'under_review', a required intermediate step
      // in the pending -> under_review -> approved -> paid payout workflow.
      mustContain: ["'under_review'"],
    },
  ]);

  // Generate product codes for deals that don't have one
  const noCodeDeals = db.prepare("SELECT id FROM deals WHERE product_code = '' OR product_code IS NULL").all() as { id: number }[];
  if (noCodeDeals.length > 0) {
    const upd = db.prepare("UPDATE deals SET product_code = ? WHERE id = ?");
    for (const d of noCodeDeals) {
      upd.run(`SF-P${d.id.toString().padStart(3, "0")}`, d.id);
    }
  }

  return db;
}

/**
 * Recreate a table when its stored SQL is missing a required CHECK value.
 *
 * The canonical schema is produced by renaming the existing table aside, which
 * makes `CREATE TABLE IF NOT EXISTS` emit the up-to-date definition. Data is
 * copied across the columns the two definitions have in common, and the
 * original is dropped. Foreign keys are disabled for the swap because
 * `PRAGMA foreign_keys` is a no-op inside a transaction.
 */
function reconcileCheckConstraints(
  db: Database.Database,
  targets: { table: string; mustContain: string[] }[]
) {
  // Renaming a table rewrites every foreign key that points at it. After a
  // swap those references name the temporary table, so any table that mentions
  // the temporary name is rebuilt from the canonical DDL as well.
  const LEGACY_SUFFIX = "__legacy_rebuild";

  const rebuild = (table: string) => {
    const legacy = `${table}${LEGACY_SUFFIX}`;
    const indexSql = (
      db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL")
        .all(table) as { sql: string }[]
    ).map((i) => i.sql);

    // PRAGMA foreign_keys is a no-op inside a transaction, so run the swap
    // outside one.
    db.pragma("foreign_keys = OFF");
    try {
      const swap = db.transaction(() => {
        db.exec(`ALTER TABLE ${table} RENAME TO ${legacy}`);
        // Re-running the canonical DDL now recreates the table with the
        // up-to-date definition, because the name is free again.
        db.exec(SCHEMA_DDL);

        const targetCols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
          (c) => c.name
        );
        const legacyCols = new Set(
          (db.prepare(`PRAGMA table_info(${legacy})`).all() as { name: string }[]).map((c) => c.name)
        );
        const shared = targetCols.filter((c) => legacyCols.has(c));
        if (shared.length > 0) {
          const list = shared.map((c) => `"${c}"`).join(", ");
          db.exec(`INSERT INTO ${table} (${list}) SELECT ${list} FROM ${legacy}`);
        }

        db.exec(`DROP TABLE ${legacy}`);
        for (const sql of indexSql) db.exec(sql);
      });
      swap();
    } finally {
      db.pragma("foreign_keys = ON");
    }
  };

  for (const { table, mustContain } of targets) {
    const row = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) as { sql: string } | undefined;
    if (!row?.sql) continue;
    if (mustContain.every((needle) => row.sql.includes(needle))) continue;

    rebuild(table);

    // Cascade: rebuild anything still pointing at a temporary table name.
    // Repeat until clean, since rebuilding one table can expose the next.
    for (let guard = 0; guard < 20; guard++) {
      const stale = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE ? AND name NOT LIKE ?"
        )
        .all(`%${LEGACY_SUFFIX}%`, `%${LEGACY_SUFFIX}%`) as { name: string }[];
      if (stale.length === 0) break;
      for (const s of stale) rebuild(s.name);
    }
  }
}

export const db = globalThis.__db ?? createDb();
globalThis.__db = db;

export function generateCode(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  return `${prefix}-${ts}${rand}`;
}
