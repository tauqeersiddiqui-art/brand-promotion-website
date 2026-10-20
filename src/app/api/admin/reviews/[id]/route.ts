import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { requireAdmin, bad } from "@/lib/api-helpers";
import { str, oneOf, parseId } from "@/lib/validation";
import { runOcrOnBuffer } from "@/lib/ocr";
import { applyRateLimit } from "@/lib/rate-limit";
import { sanitizeHtml, sanitizeText } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { uploadFilePath } from "@/lib/storage";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const DECISIONS = ["approved", "rejected"] as const;

async function validateRequest(req: Request): Promise<NextResponse | null> {
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = (await getCsrfTokenFromCookies());
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  // Rate limiting
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  return null;
}

/** Admin: approve / reject a review. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validationError = await validateRequest(req);
  if (validationError) return validationError;

  const { error } = await requireAdmin();
  if (error) return error;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return bad("Invalid review id.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request body.");
  }
  const b = body as Record<string, unknown>;
  const decision = oneOf(b.status, DECISIONS, "" as never) as (typeof DECISIONS)[number] | "";
  if (!decision) return bad("Invalid decision.");
  const adminNote = sanitizeHtml(str(b.admin_note, 500));

  const res = db
    .prepare(
      "UPDATE reviews SET status = ?, admin_note = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(decision, adminNote, id);
  if (res.changes === 0) return bad("Review not found.", 404);

  return NextResponse.json({ ok: true });
}

/** Admin: re-run OCR on the stored screenshot (e.g. after adding an API key). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validationError = await validateRequest(req);
  if (validationError) return validationError;

  const { error } = await requireAdmin();
  if (error) return error;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return bad("Invalid review id.");

  const review = db
    .prepare("SELECT id, screenshot_url FROM reviews WHERE id = ?")
    .get(id) as { id: number; screenshot_url: string } | undefined;
  if (!review) return bad("Review not found.", 404);
  if (!review.screenshot_url) return bad("This review has no screenshot to OCR.");

  const filePath = uploadFilePath(review.screenshot_url);
  if (!filePath) {
    return bad("Screenshot file is missing on the server.");
  }

  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = `image/${ext === "jpg" ? "jpeg" : ext}`;

  const ocr = await runOcrOnBuffer(buf, mime);
  db.prepare(
    "UPDATE reviews SET ocr_text = ?, ocr_status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(ocr.ok ? ocr.text : "", ocr.ok ? "done" : "failed", id);

  if (!ocr.ok) return NextResponse.json({ ok: false, error: ocr.error }, { status: 502 });
  return NextResponse.json({ ok: true, ocr_text: ocr.text });
}