import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db, generateCode } from "@/lib/db";
import { str } from "@/lib/validation";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { bad } from "@/lib/api-helpers";
import { sanitizeText } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";

/**
 * POST /api/contact — Save a support ticket / inquiry to SQLite.
 * Rate-limited; no authentication required (public form).
 */
export async function POST(req: Request) {
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = await getCsrfTokenFromCookies();
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("apiGeneral", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request body.");
  }
  const b = body as Record<string, unknown>;

  const name = sanitizeText(str(b.name, 200), 200);
  const email = sanitizeText(str(b.email, 255), 255);
  const phone = sanitizeText(str(b.phone, 50), 50);
  const subject = sanitizeText(str(b.subject, 200), 200);
  const orderId = sanitizeText(str(b.orderId, 100), 100);
  const message = sanitizeText(str(b.message, 2000), 2000);

  if (!name || !email || !phone || !message) {
    return bad("Please fill in your name, email, phone, and message.");
  }

  // Ensure the table exists (create-in-place if missing on fresh volumes)
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS contact_inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inquiry_code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '',
        order_id TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'new',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
  } catch {
    // Table already exists or other issue — fall through; inserts will fail cleanly if table is truly missing.
  }

  const code = generateCode("CT");
  try {
    db.prepare(`
      INSERT INTO contact_inquiries (inquiry_code, name, email, phone, subject, order_id, message, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
    `).run(code, name, email, phone, subject || "Deal / Store Question", orderId, message);
  } catch (err) {
    console.warn("[contact] insert failed:", err);
    return bad("We could not save your ticket. Please try again.");
  }

  return NextResponse.json({ ok: true, inquiry_code: code });
}
