/**
 * Pure phone-number formatting helpers.
 *
 * Deliberately dependency-free: this file is imported by client components
 * (login/signup pages) and must not pull in better-sqlite3 or any other
 * server-only module. Keeping it separate from src/lib/otp.ts (which needs
 * `db`/`crypto`) is what stops the client bundle from trying to evaluate a
 * native Node.js module at runtime.
 */

/** Display a 10-digit Indian phone as "XXXXX XXXXX". */
export function formatPhoneDisplay(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 5)} ${d.slice(5)}`;
  return phone;
}