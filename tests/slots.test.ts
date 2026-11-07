/**
 * Slot accounting is the money-critical invariant on this platform: overselling
 * a campaign pays out more refunds than budgeted. These tests exercise the real
 * claim/release helpers against a throwaway SQLite file.
 *
 * Run with: npm test   (node --test, Node 22.18+ strips TS types natively)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bp-slots-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "app.db");

// Loaded after DATA_DIR/DATABASE_PATH are pointed at the temp dir (db.ts opens
// the file at import time).
const { db, generateCode } = require("../src/lib/db");
const { claimDealSlot, releaseDealSlot } = require("../src/lib/deal-slots");

db.exec(`
  CREATE TABLE deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'campaign',
    total_slots INTEGER NOT NULL DEFAULT 0,
    claimed_slots INTEGER NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0
  );
`);

function makeDeal(totalSlots: number, claimed = 0) {
  const info = db
    .prepare("INSERT INTO deals (total_slots, claimed_slots, stock) VALUES (?, ?, ?)")
    .run(totalSlots, claimed, totalSlots - claimed);
  return Number(info.lastInsertRowid);
}

function slots(id: number) {
  return db
    .prepare("SELECT claimed_slots, stock FROM deals WHERE id = ?")
    .get(id) as { claimed_slots: number; stock: number };
}

test("claims stop exactly at total_slots", () => {
  const id = makeDeal(3);
  assert.equal(claimDealSlot(id), true);
  assert.equal(claimDealSlot(id), true);
  assert.equal(claimDealSlot(id), true);
  // The fourth claim must fail: this is what prevents an oversold campaign
  // when several submissions race for the last slot.
  assert.equal(claimDealSlot(id), false);
  assert.equal(slots(id).claimed_slots, 3);
  assert.equal(slots(id).stock, 0);
});

test("total_slots = 0 means unlimited", () => {
  const id = makeDeal(0);
  for (let i = 0; i < 5; i++) assert.equal(claimDealSlot(id), true);
  assert.equal(slots(id).claimed_slots, 5);
});

test("releasing a slot never goes below zero", () => {
  const id = makeDeal(2);
  assert.equal(claimDealSlot(id), true);
  releaseDealSlot(id);
  releaseDealSlot(id);
  assert.equal(slots(id).claimed_slots, 0);
  assert.equal(slots(id).stock, 2);
});

test("releasing a missing deal is a no-op", () => {
  assert.doesNotThrow(() => releaseDealSlot(null));
  assert.doesNotThrow(() => releaseDealSlot(999999));
});

test("unique index rejects a duplicate platform order id", () => {
  db.exec(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT NOT NULL UNIQUE,
      external_order_id TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX idx_orders_ext_unique ON orders (external_order_id)
      WHERE external_order_id != '';
  `);
  const insert = db.prepare("INSERT INTO orders (order_code, external_order_id) VALUES (?, ?)");
  insert.run("BP-1", "404-1234567-1234567");
  assert.throws(() => insert.run("BP-2", "404-1234567-1234567"), /UNIQUE/);
  // Orders without a platform id must not collide with each other.
  insert.run("BP-3", "");
  insert.run("BP-4", "");
});

test("generated codes are prefixed and not sequential", () => {
  const a = generateCode("BP");
  const b = generateCode("BP");
  assert.match(a, /^BP-[A-Z0-9]+$/);
  assert.notEqual(a, b);
  // 4 random bytes (8 hex chars) + 5 timestamp chars + prefix + dashes.
  assert.ok(a.length >= 14, `unexpected code length: ${a}`);
});
