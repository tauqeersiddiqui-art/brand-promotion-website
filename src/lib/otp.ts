/**
 * Phone OTP (One-Time Password) system for login/signup.
 *
 * Delivery priority (all can be configured independently):
 *   1. Telegram Bot — FREE, no IP whitelist. Uses TELEGRAM_BOT_TOKEN + telegram_chat_id in DB.
 *   2. MSG91 (India) — set MSG91_API_KEY (requires turning off IP Security in dashboard)
 *   3. Twilio — npm i twilio, set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_PHONE_NUMBER
 *   4. Fast2SMS (India, ₹50 free credit, no CC) — set FAST2SMS_API_KEY
 *   5. WhatsApp via Meta Cloud API — set WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID
 *   6. Plivo — set PLIVO_AUTH_ID + PLIVO_AUTH_TOKEN
 *
 * If none are configured, OTP is logged to console only (dev mode).
 */

import { db } from "./db";
import crypto from "crypto";

export type OtpRecord = {
  id: number;
  phone: string;
  code: string;
  purpose: string;
  attempts: number;
  consumed: number;
  created_at: string;
  expires_at: string;
};

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

export type OtpDelivery = "telegram" | "sms" | "none";

/** Generate a random numeric OTP code. */
export function generateOtpCode(): string {
  const n = crypto.randomInt(100_000, 999_999);
  return String(n);
}

/** Normalize Indian phone numbers to 10-digit string without country prefix. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  if (normalized.length !== 10) return "";
  return normalized;
}

export function formatPhoneDisplay(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 5)} ${d.slice(5)}`;
  return phone;
}

export function validatePhone(raw: string): { ok: boolean; phone?: string; error?: string } {
  const normalized = normalizePhone(raw);
  if (!normalized) {
    return { ok: false, error: "Please enter a valid 10-digit mobile number." };
  }
  return { ok: true, phone: normalized };
}

/** Store OTP in SQLite and deliver it via the best available channel. Returns delivery status. */
export async function storeAndSendOtp(
  phone: string,
  purpose: string
): Promise<{ ok: boolean; code?: string; delivery?: OtpDelivery; error?: string }> {
  try {
    // Ensure users table has the telegram_chat_id column (migration safety)
    ensureUsersTable(db);

    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) return { ok: false, error: "Invalid phone number." };

    // Rate limit: max 3 requests per 10 minutes per phone
    const recentCount = db.prepare(
      "SELECT COUNT(*) AS c FROM otp_codes WHERE phone = ? AND created_at > datetime('now', '-10 minutes')"
    ).get(phone) as { c: number };
    if ((recentCount.c ?? 0) >= 3) {
      return { ok: false, error: "Too many requests. Please wait a minute before trying again." };
    }

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString().replace(/\.(\d{3})\d*Z$/, ".$1Z");

    db.prepare(`
      INSERT INTO otp_codes (phone, code, purpose, attempts, consumed, created_at, expires_at)
      VALUES (?, ?, ?, 0, 0, datetime('now'), ?)
    `).run(phone, code, purpose, expiresAt);

    const delivery = await sendOtpMessage(phone, code);

    return { ok: true, code, delivery };
  } catch (err) {
    console.error("[OTP] storeAndSendOtp error:", err);
    return { ok: false, error: "Failed to send OTP. Please try again." };
  }
}

async function sendOtpMessage(phone: string, code: string): Promise<OtpDelivery> {
  const cleanPhone = `91${phone}`;

  // --- Option 1: Telegram Bot (FREE, no IP whitelist, no extra SDK) ---
  const tgToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (tgToken) {
    try {
      const rows = db.prepare("SELECT telegram_chat_id FROM users WHERE phone = ?").all(phone);
      const user = Array.isArray(rows) ? (rows[0] as { telegram_chat_id?: string } | null) : null;
      const chatId: string | undefined = user?.telegram_chat_id;
      if (chatId && typeof chatId === "string" && chatId.trim()) {
        const msg = `🔐 Your Brand Promotion OTP is: *${code}*\n\nValid for 5 minutes.\nDo not share this code with anyone.`;
        const resp = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) {
          console.warn("[OTP] Telegram failed:", resp.status, await resp.text().catch(() => ""));
        } else {
          console.log(`[OTP] Sent to Telegram user ${chatId}`);
          return "telegram";
        }
      } else {
        console.warn("[OTP] No Telegram chat ID found for phone", phone);
      }
    } catch (e) {
      console.error("[OTP] Telegram error:", e);
    }
  }

  // --- Option 2: MSG91 (India, free tier — requires IP Security OFF on authkey) ---
  const msg91Key = (process.env.MSG91_API_KEY || "").trim();
  if (msg91Key) {
    try {
      const resp = await fetch("https://control.msg91.com/api/v5/otp", {
        method: "POST",
        headers: {
          authkey: msg91Key,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          mobile: cleanPhone,
          template: "otp",
          otp: code,
          country: "91",
          locale: "en",
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        const body = await resp.text().catch(() => "");
        console.log(`[OTP] MSG91 response for ${cleanPhone}:`, body);
        // MSG91 OTP endpoint returns {"type":"success"} on success
        try {
          const json = JSON.parse(body);
          if (json.type === "success") {
            console.log(`[OTP] Sent via MSG91 to ${cleanPhone}`);
            return "sms";
          }
          console.warn("[OTP] MSG91 unexpected response:", body);
        } catch {
          console.warn("[OTP] MSG91 non-JSON response:", body);
        }
      } else {
        const errBody = await resp.text().catch(() => "");
        console.error("[OTP] MSG91 failed:", resp.status, errBody);
      }
    } catch (e) {
      console.error("[OTP] MSG91 error:", e);
    }
  }

  // --- Option 3: Fast2SMS (India, ₹50 free credit on signup, no CC, no IP whitelist) ---
  const fast2Key = (process.env.FAST2SMS_API_KEY || "").trim();
  if (fast2Key) {
    try {
      const resp = await fetch(
        `https://www.fast2sms.com/dev/bulkV2?route=q&numbers=${cleanPhone}&message=${encodeURIComponent(`Your OTP is ${code}. Valid for 5 mins.`)}`,
        { headers: { Authorization: fast2Key }, signal: AbortSignal.timeout(10000) }
      );
      if (resp.ok) {
        console.log(`[OTP] Sent via Fast2SMS to ${cleanPhone}`);
        return "sms";
      }
      console.warn("[OTP] Fast2SMS failed:", resp.status);
    } catch (e) {
      console.error("[OTP] Fast2SMS error:", e);
    }
  }

  // Fallback: log to console
  console.log(`[OTP] Code for ${phone}: ${code} (no SMS provider configured)`);
  return "none";
}

function ensureUsersTable(db: { prepare: (sql: string) => any }) {
  try {
    db.prepare(`ALTER TABLE users ADD COLUMN telegram_chat_id TEXT`).run();
  } catch (_) {
    // Column may already exist
  }
}

/**
 * Verify an OTP code against the database.
 * Returns { ok, userId?, userName?, email?, role?, isNewUser?, error? }.
 */
export async function verifyOtp(
  phone: string,
  code: string,
  purpose: string = "login"
): Promise<{
  ok: boolean;
  userId?: number;
  userName?: string;
  email?: string;
  role?: string;
  isNewUser?: boolean;
  error?: string;
}> {
  try {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) return { ok: false, error: "Invalid phone number." };

    const record = db.prepare(
      `SELECT id, code, purpose, attempts, consumed, expires_at FROM otp_codes
       WHERE phone = ? AND purpose = ? AND consumed = 0 AND expires_at > datetime('now')
       ORDER BY created_at DESC LIMIT 1`
    ).get(phone, purpose) as OtpRecord | undefined;

    if (!record) return { ok: false, error: "Invalid or expired OTP code." };

    if (record.attempts >= MAX_ATTEMPTS) {
      return { ok: false, error: "Too many failed attempts. Please request a new OTP." };
    }

    if (record.code !== code) {
      db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").run(record.id);
      return { ok: false, error: "Incorrect OTP code. Please try again." };
    }

    // Mark as consumed
    db.prepare("UPDATE otp_codes SET consumed = 1 WHERE id = ?").run(record.id);

    const existing = db.prepare("SELECT id, name, email, role FROM users WHERE phone = ?").get(phone) as
      | { id: number; name: string; email: string; role: string }
      | undefined;

    if (existing) {
      return { ok: true, userId: existing.id, userName: existing.name, email: existing.email, role: existing.role, isNewUser: false };
    }

    // Auto-create user account on first OTP login/signup
    const autoEmail = `${phone}@magic.phone`;
    const insert = db.prepare(
      "INSERT INTO users (name, email, password_hash, phone, role) VALUES (?, ?, '', ?, 'user')"
    ).run(phone, autoEmail, phone);

    return { ok: true, userId: Number(insert.lastInsertRowid), userName: phone, email: autoEmail, role: "user", isNewUser: true };
  } catch (err) {
    console.error("[OTP] verifyOtp error:", err);
    return { ok: false, error: "Verification failed. Please try again." };
  }
}

/** Cleanup expired OTP records (call periodically). */
export function cleanupExpiredOtps(): number {
  const result = db.prepare("DELETE FROM otp_codes WHERE expires_at < datetime('now')").run();
  return result.changes;
}
