/**
 * Phone OTP (One-Time Password) system for login/signup.
 * Uses in-memory storage — works fine for single-instance deployments like Railway.
 * For multi-instance, wire into the same SQLite database (already used for users).
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

/** Generate a random numeric OTP code. */
export function generateOtpCode(): string {
  const n = crypto.randomInt(100_000, 999_999);
  return String(n);
}

/** Normalize Indian phone numbers to E.164 without country code prefix for DB storage. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Strip leading 0 if present (e.g. 09876543210 -> 9876543210)
  const normalized = digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  // Must be exactly 10 digits
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

/**
 * Store an OTP in the database and return it.
 * Calls your SMS provider here — replace with your gateway of choice.
 */
export async function storeAndSendOtp(phone: string, purpose: string): Promise<{
  ok: boolean;
  code?: string;
  error?: string;
}> {
  try {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) return { ok: false, error: "Invalid phone number." };

    // Check recent attempts to prevent flooding
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

    // ---- Send SMS via your preferred provider ----
    await sendOtpSms(phone, code);

    return { ok: true, code }; // In production you'd not return the code to the client
  } catch (err) {
    console.error("[OTP] storeAndSendOtp error:", err);
    return { ok: false, error: "Failed to send OTP. Please try again." };
  }
}

/**
 * Verify an OTP code against the database.
 * Returns { ok, userId?, error? }.
 */
export async function verifyOtp(phone: string, code: string, purpose: string = "login"): Promise<{
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

    // Mark as consumed and find/create user
    db.prepare("UPDATE otp_codes SET consumed = 1 WHERE id = ?").run(record.id);

    const existing = db.prepare("SELECT id, name, email, role FROM users WHERE phone = ?").get(phone) as
      | { id: number; name: string; email: string; role: string }
      | undefined;

    if (existing) {
      return {
        ok: true,
        userId: existing.id,
        userName: existing.name,
        email: existing.email,
        role: existing.role,
        isNewUser: false,
      };
    }

    // Auto-create user account on first OTP login (like magic link signup)
    const autoEmail = `${phone}@magic.phone`;
    const insert = db.prepare(
      "INSERT INTO users (name, email, password_hash, phone, role) VALUES (?, ?, '', ?, 'user')"
    ).run(phone, autoEmail, phone);

    return {
      ok: true,
      userId: Number(insert.lastInsertRowid),
      userName: phone,
      email: autoEmail,
      role: "user",
      isNewUser: true,
    };
  } catch (err) {
    console.error("[OTP] verifyOtp error:", err);
    return { ok: false, error: "Verification failed. Please try again." };
  }
}

/**
 * Cleanup expired OTP records (called periodically).
 */
export function cleanupExpiredOtps(): number {
  const result = db.prepare("DELETE FROM otp_codes WHERE expires_at < datetime('now')").run();
  return result.changes;
}

// ============================================================
// SMS Providers — configure one below
// ============================================================

/**
 * Send OTP via SMS. Replace the implementation with your preferred provider.
 *
 * Options:
 *   1. Twilio — npm i twilio, set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_PHONE_NUMBER
 *   2. MSG91 (India) — set MSG91_API_KEY
 *   3. WhatsApp via Meta Cloud API — set WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID + ADMIN_WHATSAPP_NUMBER
 *   4. Plivo — set PLIVO_AUTH_ID + PLIVO_AUTH_TOKEN
 *
 * All fields should be set in .env
 */
async function sendOtpSms(phone: string, code: string): Promise<void> {
  const cleanPhone = `91${phone}`; // Assume Indian numbers; strip country if different

  // --- Option 1: Twilio ---
  // Uncomment when configured:
  // const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  // const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  // const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
  // if (twilioSid && twilioToken && twilioFrom) {
  //   const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
  //     method: "POST",
  //     headers: { Authorization: "Basic " + Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64") },
  //     body: new URLSearchParams({
  //       From: twilioFrom,
  //       To: `+${cleanPhone}`,
  //       Body: `Your Brand Promotion OTP is: ${code}. Valid for 5 minutes.`,
  //     }),
  //   });
  //   if (!resp.ok) console.warn("[OTP] Twilio send failed:", resp.status, await resp.text());
  //   return;
  // }

  // --- Option 2: MSG91 (India-friendly, free tier) ---
  const msg91Key = (process.env.MSG91_API_KEY || "").trim();
  if (msg91Key) {
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
    });
    if (!resp.ok) console.warn("[OTP] MSG91 send failed:", resp.status);
    return;
  }

  // --- Option 3: WhatsApp (Meta Cloud API) ---
  const waToken = (process.env.WHATSAPP_TOKEN || "").trim();
  const waPhoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  if (waToken && waPhoneId) {
    const recipient = process.env.ADMIN_WHATSAPP_NUMBER?.replace(/\D/g, "") || cleanPhone;
    const payload = {
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: {
        name: "otp_verification",
        language: { code: "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: code }] }],
      },
    };
    const resp = await fetch(`https://graph.facebook.com/v20.0/${waPhoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) console.warn("[OTP] WhatsApp send failed:", resp.status);
    return;
  }

  // No provider configured — log only (development mode)
  console.log(`[OTP] Code for ${phone}: ${code} (no SMS provider configured)`);
}
