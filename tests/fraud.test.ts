/**
 * Fraud controls on order submissions. These are the checks that stop a farm of
 * fresh accounts from recycling one household's phone/device/address, and that
 * reject order IDs which cannot exist.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bp-fraud-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_PATH = path.join(tmp, "app.db");

const { db } = require("../src/lib/db");
const { validateOrderIdFormat, assessIdentityRisk, checkSubmissionLimits } = require("../src/lib/fraud");

db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    external_order_id TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    device_fingerprint TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    pincode TEXT NOT NULL DEFAULT '',
    reviewer_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function addOrder(o: {
  userId: number;
  externalOrderId?: string;
  phone?: string;
  device?: string;
  ip?: string;
  address?: string;
  pincode?: string;
  reviewer?: string;
  createdAt?: string;
}) {
  db.prepare(
    `INSERT INTO orders
       (user_id, external_order_id, phone, device_fingerprint, ip, address, pincode, reviewer_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`
  ).run(
    o.userId,
    o.externalOrderId || "",
    o.phone || "",
    o.device || "",
    o.ip || "",
    o.address || "",
    o.pincode || "",
    o.reviewer || "",
    o.createdAt || null
  );
}

// ---------- order ID format ----------

test("accepts a real Amazon order id, with or without dashes", () => {
  assert.equal(validateOrderIdFormat("404-1234567-1234567", "Amazon").severity, "ok");
  assert.equal(validateOrderIdFormat("40412345671234567", "Amazon").severity, "ok");
});

test("flags an Amazon id that does not match Amazon's shape", () => {
  const v = validateOrderIdFormat("OD223456789012345", "Amazon");
  assert.equal(v.severity, "warn");
  assert.match(v.reason || "", /Amazon/);
});

test("accepts a Flipkart OD id", () => {
  assert.equal(validateOrderIdFormat("OD223456789012345", "Flipkart").severity, "ok");
});

test("rejects impossible order ids", () => {
  assert.equal(validateOrderIdFormat("", "Amazon").severity, "bad");
  assert.equal(validateOrderIdFormat("12345", "Amazon").severity, "bad");
  assert.equal(validateOrderIdFormat("111111111111", "Amazon").severity, "bad");
  assert.equal(validateOrderIdFormat("ORDER-1234", "Amazon").severity, "bad");
  assert.equal(validateOrderIdFormat("1234567890123", "Amazon").severity, "bad");
});

test("a real-looking id on an unknown platform raises no alarm", () => {
  assert.equal(validateOrderIdFormat("MYN9876543210", "Myntra").severity, "ok");
});

// ---------- cross-account identity risk ----------

test("phone shared with another account raises risk", () => {
  addOrder({ userId: 10, phone: "9876543210" });
  addOrder({ userId: 11, phone: "9876543210" });

  const risk = assessIdentityRisk({ userId: 12, phone: "9876543210" });
  assert.ok(risk.points >= 30, `expected >= 30 points, got ${risk.points}`);
  assert.ok(risk.reasons.some((r: string) => /Phone number/.test(r)));
});

test("device used by another account raises risk", () => {
  addOrder({ userId: 20, device: "fp-shared-1" });
  const risk = assessIdentityRisk({ userId: 21, deviceFingerprint: "fp-shared-1" });
  assert.ok(risk.points >= 20);
  assert.ok(risk.reasons.some((r: string) => /Device/.test(r)));
});

test("shipping address shared by three accounts raises risk", () => {
  for (const uid of [30, 31, 32]) {
    addOrder({ userId: uid, address: "12 MG Road", pincode: "400001" });
  }
  const risk = assessIdentityRisk({
    userId: 33,
    address: "12 mg road",
    pincode: "400001",
  });
  assert.ok(risk.points >= 15);
  assert.ok(risk.reasons.some((r: string) => /address/i.test(r)));
});

test("a clean identity scores zero", () => {
  const risk = assessIdentityRisk({
    userId: 40,
    phone: "9000000001",
    deviceFingerprint: "fp-unique",
    ip: "203.0.113.9",
    address: "9 Fresh Street",
    pincode: "560001",
    reviewerName: "Clean Reviewer",
  });
  assert.equal(risk.points, 0);
  assert.deepEqual(risk.reasons, []);
});

test("risk is capped so it cannot alone force a reject", () => {
  const risk = assessIdentityRisk({ userId: 99, phone: "9876543210", deviceFingerprint: "fp-shared-1" });
  assert.ok(risk.points <= 60);
});

// ---------- velocity caps ----------

test("blocks the 11th order from one account in 24 hours", () => {
  for (let i = 0; i < 10; i++) addOrder({ userId: 50, externalOrderId: `U50-${i}` });
  const res = checkSubmissionLimits(50);
  assert.equal(res.ok, false);
});

test("under the daily cap is allowed", () => {
  addOrder({ userId: 51 });
  assert.deepEqual(checkSubmissionLimits(51), { ok: true });
});

test("blocks a device that has submitted 15 orders in 30 days", () => {
  for (let i = 0; i < 15; i++) {
    addOrder({ userId: 60 + (i % 3), device: "fp-farm" });
  }
  const res = checkSubmissionLimits(70, "fp-farm");
  assert.equal(res.ok, false);
});

test("old orders do not count toward the daily cap", () => {
  for (let i = 0; i < 10; i++) {
    addOrder({ userId: 80, createdAt: "2020-01-01 10:00:00" });
  }
  assert.deepEqual(checkSubmissionLimits(80), { ok: true });
});
