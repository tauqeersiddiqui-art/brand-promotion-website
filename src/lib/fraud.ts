import { db } from "./db";
import { normalizeOrderId } from "./ocr";

/**
 * Fraud controls for order-proof submissions.
 *
 * Complements ocr-validation.ts (which checks the screenshot against the form).
 * This module covers the cases OCR cannot see: fabricated order IDs, the same
 * household/device farming several accounts, and users resubmitting a proof that
 * was already used for a refund claim.
 */

export type OrderIdVerdict = {
  /** "ok" | "warn" (suspicious but plausible) | "bad" (structurally impossible) */
  severity: "ok" | "warn" | "bad";
  reason?: string;
};

// All patterns are applied to the NORMALIZED id (uppercased, punctuation
// stripped): "404-1234567-1234567" -> "40412345671234567".
// Amazon India order ids are 3-7-7 digits.
const AMAZON_ID = /^\d{17}$/;
// Flipkart: OD followed by 10-20 digits.
const FLIPKART_ID = /^OD\d{10,20}$/;
// Myntra / Ajio / generic brand stores: alphanumeric.
const GENERIC_ID = /^[A-Z0-9]{6,40}$/;

/**
 * Reject order IDs that cannot be real, and flag ones that do not match the
 * platform's known shape. Deliberately conservative: a false reject costs a
 * genuine customer their slot, so only impossible values are "bad".
 */
export function validateOrderIdFormat(
  rawId: string,
  platform?: string
): OrderIdVerdict {
  const id = normalizeOrderId(rawId);
  if (!id) return { severity: "bad", reason: "Order ID is empty" };

  // "111111111111", "abcdef" — placeholder or keyboard mash.
  if (/^(.)\1{5,}$/.test(id)) {
    return { severity: "bad", reason: "Order ID looks like a placeholder" };
  }
  if (id.length < 6) {
    return { severity: "bad", reason: "Order ID is too short to be valid" };
  }
  if (!GENERIC_ID.test(id)) {
    return { severity: "bad", reason: "Order ID contains invalid characters" };
  }
  const digits = id.replace(/\D/g, "");
  if (digits.length < 6) {
    return { severity: "bad", reason: "Order ID does not contain enough digits" };
  }
  if (digits.startsWith("123456789") || digits.startsWith("0123456789")) {
    return { severity: "bad", reason: "Order ID looks sequential/placeholder" };
  }

  const p = (platform || "").toLowerCase();
  if (p.includes("amazon") && !AMAZON_ID.test(id)) {
    return {
      severity: "warn",
      reason: "Order ID does not look like an Amazon order ID (expected 404-1234567-1234567)",
    };
  }
  if (p.includes("flipkart") && !FLIPKART_ID.test(id)) {
    return {
      severity: "warn",
      reason: "Order ID does not look like a Flipkart order ID (expected OD… digits)",
    };
  }
  return { severity: "ok" };
}

export type IdentityRisk = {
  points: number;
  reasons: string[];
};

/**
 * Cross-account signals for the submitting identity.
 *
 * One person running several accounts is the common pattern behind repeated
 * refund abuse: same phone, same device, same address. Each is only a signal
 * (families share phones), so they add risk points rather than blocking.
 */
export function assessIdentityRisk(input: {
  userId: number;
  phone?: string;
  deviceFingerprint?: string;
  ip?: string;
  address?: string;
  pincode?: string;
  reviewerName?: string;
}): IdentityRisk {
  const reasons: string[] = [];
  let points = 0;

  if (input.phone && input.phone.length >= 10) {
    const row = db
      .prepare(
        `SELECT COUNT(DISTINCT user_id) AS users
           FROM orders
          WHERE phone = ? AND user_id IS NOT NULL AND user_id != ?`
      )
      .get(input.phone, input.userId) as { users: number } | undefined;
    if (row && row.users >= 2) {
      points += 30;
      reasons.push(`Phone number shared by ${row.users + 1} accounts`);
    } else if (row && row.users === 1) {
      points += 15;
      reasons.push("Phone number also used by another account");
    }
  }

  if (input.deviceFingerprint) {
    const row = db
      .prepare(
        `SELECT COUNT(DISTINCT user_id) AS users
           FROM orders
          WHERE device_fingerprint = ? AND user_id IS NOT NULL AND user_id != ?`
      )
      .get(input.deviceFingerprint, input.userId) as { users: number } | undefined;
    if (row && row.users >= 1) {
      points += 20;
      reasons.push(`Device used by ${row.users} other account(s)`);
    }
  }

  if (input.ip) {
    const row = db
      .prepare(
        `SELECT COUNT(DISTINCT user_id) AS users, COUNT(*) AS orders
           FROM orders
          WHERE ip = ? AND datetime(created_at) > datetime('now', '-24 hours')`
      )
      .get(input.ip) as { users: number; orders: number } | undefined;
    if (row && row.users >= 3) {
      points += 15;
      reasons.push(`${row.users} accounts submitted from this IP in 24h`);
    }
  }

  if (input.address && input.pincode) {
    const row = db
      .prepare(
        `SELECT COUNT(DISTINCT user_id) AS users
           FROM orders
          WHERE lower(address) = lower(?) AND pincode = ? AND user_id IS NOT NULL AND user_id != ?`
      )
      .get(input.address, input.pincode, input.userId) as
      | { users: number }
      | undefined;
    if (row && row.users >= 2) {
      points += 15;
      reasons.push(`Shipping address shared by ${row.users + 1} accounts`);
    }
  }

  if (input.reviewerName) {
    const row = db
      .prepare(
        `SELECT COUNT(DISTINCT user_id) AS users
           FROM orders
          WHERE lower(reviewer_name) = lower(?) AND user_id IS NOT NULL AND user_id != ?`
      )
      .get(input.reviewerName, input.userId) as { users: number } | undefined;
    if (row && row.users >= 2) {
      points += 10;
      reasons.push(`Reviewer profile name used by ${row.users + 1} accounts`);
    }
  }

  return { points: Math.min(60, points), reasons };
}

/**
 * Hard velocity caps, independent of the in-memory rate limiter (which resets on
 * every deploy). A person buying for their family does not exceed these; a farm
 * does.
 */
export function checkSubmissionLimits(
  userId: number,
  deviceFingerprint?: string
): { ok: true } | { ok: false; reason: string } {
  const perDay = db
    .prepare(
      `SELECT COUNT(*) AS c FROM orders
        WHERE user_id = ? AND datetime(created_at) > datetime('now', '-24 hours')`
    )
    .get(userId) as { c: number };
  if (perDay.c >= 10) {
    return {
      ok: false,
      reason:
        "You have reached the daily submission limit (10 orders). Contact support if you need more.",
    };
  }

  if (deviceFingerprint) {
    const perDevice = db
      .prepare(
        `SELECT COUNT(*) AS c FROM orders
          WHERE device_fingerprint = ? AND datetime(created_at) > datetime('now', '-30 days')`
      )
      .get(deviceFingerprint) as { c: number };
    if (perDevice.c >= 15) {
      return {
        ok: false,
        reason:
          "This device has reached the submission limit for this month. Please contact support.",
      };
    }
  }

  return { ok: true };
}
