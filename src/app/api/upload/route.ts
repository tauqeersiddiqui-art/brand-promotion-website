import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveUploadedImage } from "@/lib/upload";
import { runOcrOnBuffer, extractOrderId, extractAmount, extractOrderDate, analyzeReviewText } from "@/lib/ocr";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { bad } from "@/lib/api-helpers";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { getSession } from "@/lib/auth";
import { headers } from "next/headers";
import { computeImageHash } from "@/lib/ocr-validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // CSRF protection (skip for upload - handled separately with file validation)
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = (await getCsrfTokenFromCookies());
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  // Uploads are only ever made by logged-in users (order proof, review and
  // claim forms all require an account). Without this an anonymous caller
  // could fill the disk and burn the OCR quota.
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Please log in before uploading a screenshot." },
      { status: 401 }
    );
  }

  // Rate limiting keyed on the account first: X-Forwarded-For is client
  // controlled on some hosts, so an IP-only bucket is easy to rotate around.
  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("upload", `user:${session.userId}`);
  const rlIp = await applyRateLimit("uploadIp", ip);
  if (!rl.ok || !rlIp.ok) {
    return NextResponse.json(
      { error: `Upload rate limit reached. Try again in ${Math.max(rl.retryAfter, rlIp.retryAfter)}s.` },
      { status: 429, headers: { "Retry-After": String(Math.max(rl.retryAfter, rlIp.retryAfter)) } }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const shouldRunOcr = formData.get("ocr") === "true";

    if (!file) {
      return bad("No file uploaded.");
    }

    const saved = await saveUploadedImage(file);
    if (!saved.ok) {
      return bad(saved.error);
    }

    let ocrResult = null;
    let ocrOrderId = "";
    let ocrAmount = 0;
    let ocrDate = "";
    let ocrStatus = "pending";
    let pHash = "";

    if (shouldRunOcr && saved.buffer) {
      // Use the magic-byte verified extension, never the client-declared MIME.
      const mime = saved.ext === "jpg" ? "image/jpeg" : `image/${saved.ext}`;
      ocrResult = await runOcrOnBuffer(saved.buffer, mime);
      if (ocrResult?.ok && ocrResult.text) {
        ocrStatus = "done";
        ocrOrderId = extractOrderId(ocrResult.text) || "";
        ocrAmount = extractAmount(ocrResult.text) || 0;
        ocrDate = ocrResult.extractedDate || "";
      } else {
        ocrStatus = "failed";
      }
    }

    // Compute a content hash for anti-fraud checks. Reuse is enforced at
    // submission time (against orders and claims), never here: hard-rejecting a
    // hash match meant a buyer could not re-upload their own screenshot after a
    // failed or rejected submission.
    if (saved.buffer) {
      pHash = computeImageHash(saved.buffer);
    }

    // Store upload record with OCR results
    if (saved.url) {
      db.prepare(`
        INSERT INTO uploads (url, user_id, original_name, mime_type, size, ocr_text, ocr_order_id, ocr_amount, ocr_date, ocr_status, p_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saved.url,
        session.userId,
        file.name.slice(0, 200),
        file.type.slice(0, 100),
        saved.buffer.length,
        ocrResult?.text || "",
        ocrOrderId,
        ocrAmount,
        ocrDate,
        ocrStatus,
        pHash
      );
    }

    return NextResponse.json({
      ok: true,
      url: saved.url,
      ocr: ocrResult,
      extracted_order_id: ocrOrderId,
      extracted_amount: ocrAmount,
      extracted_date: ocrDate,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to process image upload.";
    return bad(msg, 500);
  }
}