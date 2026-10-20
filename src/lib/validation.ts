/** Minimal validation + sanitization helpers (no external dependency). */

export function str(v: unknown, maxLen = 500): string {
  if (typeof v !== "string") return "";
  // strip control chars, trim, clamp length
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLen);
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;
}

export function isPhone(v: string): boolean {
  return /^\+?[0-9\s-]{8,15}$/.test(v);
}

export function isPincode(v: string): boolean {
  return /^[0-9]{5,10}$/.test(v);
}

export function isUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isStrongPassword(v: string): boolean {
  if (typeof v !== "string") return false;
  if (v.length < 8 || v.length > 128) return false;
  // Length alone lets "password" through. Require mixed character classes so
  // an attacker cannot trivially guess or spray a weak credential.
  if (!/[a-zA-Z]/.test(v)) return false;
  if (!/[0-9]/.test(v)) return false;
  return true;
}

export function int(v: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function num(v: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Parse a positive row id from a dynamic route segment.
 *
 * `parseInt` alone is too permissive: it accepts "1abc" and "0", and
 * `Number.isInteger` accepts 0 and negatives. Returns null when the value is
 * not a safe positive integer.
 */
export function parseId(v: unknown): number | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}
