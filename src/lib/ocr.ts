/**
 * OCR via OCR.space API (https://ocr.space/ocrapi) + Pattern Extraction for Brand Promotion.
 * Supports Amazon order ID, Flipkart order ID, Amounts, and 5-Star Review verification.
 */

const OCR_ENDPOINT = "https://api.ocr.space/parse/image";

export type OcrResult = {
  ok: boolean;
  text: string;
  extractedOrderId?: string;
  extractedAmount?: number;
  extractedDate?: string;
  hasVerifiedPurchase?: boolean;
  has5StarRating?: boolean;
  error?: string;
};

// Common Indian E-commerce Order ID Patterns
const AMAZON_ORDER_REGEX = /\b\d{3}-\d{7}-\d{7}\b/i;
const FLIPKART_ORDER_REGEX = /\b(OD[0-9]{15,20}|[A-Z0-9]{16,22})\b/i;
const AMOUNT_REGEX = /(?:Total|Grand Total|Paid|Amount|Rs\.?|₹)\s*[:.-]?\s*₹?\s*([0-9,]+(?:\.[0-9]{2})?)/i;

/** Extracts order ID from any raw text */
export function extractOrderId(text: string): string | null {
  if (!text) return null;
  const amzMatch = text.match(AMAZON_ORDER_REGEX);
  if (amzMatch) return amzMatch[0];
  const fkMatch = text.match(FLIPKART_ORDER_REGEX);
  if (fkMatch) return fkMatch[0];
  return null;
}

/** Extracts monetary amount from raw text */
export function extractAmount(text: string): number | null {
  if (!text) return null;
  const m = text.match(AMOUNT_REGEX);
  if (m && m[1]) {
    const clean = m[1].replace(/,/g, "");
    const val = parseFloat(clean);
    return isNaN(val) ? null : val;
  }
  return null;
}

/** Analyzes text for review attributes (5 stars, Verified Purchase, etc.) */
export function analyzeReviewText(text: string): { hasVerifiedPurchase: boolean; has5StarRating: boolean } {
  if (!text) return { hasVerifiedPurchase: false, has5StarRating: false };
  const lower = text.toLowerCase();
  const hasVerifiedPurchase = lower.includes("verified purchase") || lower.includes("verified buyer") || lower.includes("reviewed in india");
  const has5StarRating = lower.includes("5.0 out of 5") || lower.includes("5 out of 5") || lower.includes("5 star") || lower.includes("★★★★★");
  return { hasVerifiedPurchase, has5StarRating };
}

/** Normalizes an order ID so OCR output and typed input compare reliably. */
export function normalizeOrderId(id: string): string {
  return (id || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Phrases the marketplaces show once the return window is over. Amazon renders
// "Return window closed on 12 Aug 2024"; Flipkart shows "Return window: Closed"
// or "Returns closed". OCR mangles spacing/punctuation, so stay lenient.
const RETURN_WINDOW_CLOSED_REGEXES = [
  /return\s*window\s*(?:is\s+|has\s+|was\s+|got\s+|:|-)?\s*(?:now\s+)?(?:closed|ended|expired|over)\b/i,
  /(?:returns?|refund)\s*(?:window|period)?\s*(?:is\s+|has\s+|:|-)?\s*(?:now\s+)?(?:closed|ended|expired|over)\b/i,
  /no\s+longer\s+(?:eligible\s+for\s+)?(?:returns?|returnable)\b/i,
];

/** True when the screenshot text says the return window has closed. */
export function hasReturnWindowClosed(text: string): boolean {
  if (!text) return false;
  const normalized = text.replace(/\s+/g, " ");
  return RETURN_WINDOW_CLOSED_REGEXES.some((re) => re.test(normalized));
}

/** Extracts order date from OCR text (ISO format YYYY-MM-DD or DD-MM-YYYY) */
export function extractOrderDate(text: string): string | null {
  if (!text) return null;
  // Match various date formats: 2024-01-15, 15-01-2024, 15/01/2024, 15 Jan 2024, Jan 15, 2024
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];
  const ddmmyyyyMatch = text.match(/\b(\d{2}[-/]\d{2}[-/]\d{4})\b/);
  if (ddmmyyyyMatch) {
    const parts = ddmmyyyyMatch[1].split(/[-/]/);
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  const monthNameMatch = text.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i);
  if (monthNameMatch) {
    const months: Record<string, string> = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    const month = months[monthNameMatch[2].toLowerCase().slice(0,3)];
    if (month) return `${monthNameMatch[3]}-${month}-${monthNameMatch[1].padStart(2,'0')}`;
  }
  return null;
}

/** Runs OCR on an in-memory image buffer. */
export async function runOcrOnBuffer(buf: Buffer, mime: string): Promise<OcrResult> {
  const apiKey = process.env.OCR_SPACE_API_KEY || "helloworld";

  if (buf.length > 5 * 1024 * 1024) {
    return { ok: false, text: "", error: "Image too large for OCR (max 5 MB)." };
  }

  const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  if (mime && !allowed.includes(mime)) {
    return { ok: false, text: "", error: "Unsupported image type for OCR." };
  }

  try {
    const form = new FormData();
    form.append("apikey", apiKey);
    form.append("language", "eng");
    form.append("OCREngine", "2");
    form.append("isTable", "false");
    form.append("scale", "true");
    form.append("file", new Blob([new Uint8Array(buf)], { type: mime || "image/png" }), "proof.png");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(OCR_ENDPOINT, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, text: "", error: `OCR service returned HTTP ${res.status}. Manual review available.` };
    }

    const data = (await res.json()) as {
      ParsedResults?: { ParsedText?: string }[];
      IsErroredOnProcessing?: boolean;
      ErrorMessage?: string | string[];
    };

    if (data.IsErroredOnProcessing) {
      const msg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join("; ") : data.ErrorMessage;
      return { ok: false, text: "", error: msg || "OCR processing notice (manual approval enabled)." };
    }

    const text = (data.ParsedResults?.[0]?.ParsedText ?? "").replace(/\r\n/g, "\n").trim();
    const extractedOrderId = extractOrderId(text) || undefined;
    const extractedAmount = extractAmount(text) || undefined;
    const extractedDate = extractOrderDate(text) || undefined;
    const { hasVerifiedPurchase, has5StarRating } = analyzeReviewText(text);

    return {
      ok: true,
      text: text.slice(0, 5000),
      extractedOrderId,
      extractedAmount,
      extractedDate,
      hasVerifiedPurchase,
      has5StarRating,
    };
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "OCR timed out." : "OCR service notice (manual review available).";
    return { ok: false, text: "", error: msg };
  }
}

export async function runOcr(file: File): Promise<OcrResult> {
  const buf = Buffer.from(await file.arrayBuffer());
  return runOcrOnBuffer(buf, file.type);
}
