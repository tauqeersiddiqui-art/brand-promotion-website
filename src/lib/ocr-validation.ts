/**
 * OCR Validation Pipeline with Confidence Scoring
 * Validates OCR results against form data, prevents fraud
 */

import { db } from "@/lib/db";
import { normalizeOrderId } from "@/lib/ocr";
import { isStoredUploadUrl } from "@/lib/storage";
import {
  computePerceptualHash,
  classifyScreenshotPair,
} from "@/lib/image-hash";

export interface OcrValidationResult {
  valid: boolean;
  score: number; // 0-100 confidence score
  errors: string[];
  warnings: string[];
  details: {
    orderIdMatch: boolean;
    amountMatch: boolean;
    dateValid: boolean;
    imageHashUnique: boolean;
    /**
     * True only when the order screenshot was uploaded to this server and OCR
     * actually finished. Auto-approval requires this: a submission with no
     * screenshot (or an unreadable one) must go to a human.
     */
    ocrAvailable: boolean;
  };
}

export interface FraudScoreInput {
  userId?: number;
  ip?: string;
  deviceFingerprint?: string;
  accountAgeDays?: number;
  previousClaimsCount?: number;
  rejectedClaimsCount?: number;
  imagePHash?: string;
  clickId?: string;
  orderDate?: string;
}

/**
 * Calculate confidence score for OCR validation
 */
export function calculateOcrConfidence(
  ocrOrderId: string,
  formOrderId: string,
  ocrAmount: number,
  formAmount: number,
  ocrDate: string,
  formDate: string
): OcrValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  // 1. Order ID exact match (critical). Compare normalized values so dashes,
  // spaces and case differences introduced by OCR do not create false
  // mismatches (or, worse, false matches).
  const normalizedOcr = normalizeOrderId(ocrOrderId);
  const normalizedForm = normalizeOrderId(formOrderId);
  const orderIdMatch = normalizedOcr !== "" && normalizedOcr === normalizedForm;
  if (!orderIdMatch) {
    score -= 40;
    errors.push(
      normalizedOcr
        ? `Order ID mismatch: OCR found "${ocrOrderId}", form has "${formOrderId}"`
        : "OCR could not extract an Order ID from the screenshot"
    );
  }

  // 2. Amount match within 5% tolerance (important)
  let amountMatch = false;
  if (ocrAmount > 0 && formAmount > 0) {
    const diff = Math.abs(ocrAmount - formAmount) / formAmount;
    amountMatch = diff <= 0.05;
    if (!amountMatch) {
      score -= 25;
      warnings.push(`Amount discrepancy: OCR ₹${ocrAmount} vs Form ₹${formAmount} (${(diff * 100).toFixed(1)}% diff)`);
    }
  } else if (ocrAmount === 0) {
    score -= 10;
    warnings.push("OCR could not extract amount from screenshot");
  }

  // 3. Date validation (order date not in future, not too old)
  // Also check OCR date matches form date if both available
  let dateValid = true;
  if (formDate) {
    const orderDate = new Date(formDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    if (orderDate > today) {
      dateValid = false;
      score -= 20;
      errors.push("Order date cannot be in the future");
    } else if (orderDate < ninetyDaysAgo) {
      score -= 10;
      warnings.push("Order date is older than 90 days");
    }
  }

  // 4. OCR date matching form date (if OCR extracted a date)
  if (ocrDate && formDate) {
    if (ocrDate !== formDate) {
      score -= 15;
      warnings.push(`Date mismatch: OCR found "${ocrDate}", form has "${formDate}"`);
    }
  } else if (ocrDate && !formDate) {
    // OCR found a date but user didn't provide one - minor warning
    score -= 5;
    warnings.push("OCR extracted date but no form date provided for comparison");
  }

  // 5. Screenshot reuse detection (anti-fraud)
  // Checked separately by validateOrderSubmission() against existing orders.

  const details = {
    orderIdMatch,
    amountMatch,
    dateValid,
    imageHashUnique: true, // Default, updated by validateOrderSubmission
    ocrAvailable: false, // Default, updated by validateOrderSubmission
  };

  return {
    valid: score >= 60 && errors.length === 0,
    score: Math.max(0, score),
    errors,
    warnings,
    details,
  };
}

/**
 * Check max claims per user per period
 */
export function checkMaxClaimsPerUser(userId: number, periodDays: number = 30, maxClaims: number = 10): { allowed: boolean; current: number; remaining: number } {
  const current = db
    .prepare(`
      SELECT COUNT(*) as cnt FROM reimbursements
      WHERE user_id = ? AND datetime(created_at) > datetime('now', ?)
    `)
    .get(userId, `-${periodDays} days`) as { cnt: number } | undefined;

  const count = current?.cnt || 0;
  return {
    allowed: count < maxClaims,
    current: count,
    remaining: Math.max(0, maxClaims - count),
  };
}

/**
 * Check cooldown period after rejection
 */
export function checkCooldownAfterRejection(userId: number, cooldownDays: number = 1): { allowed: boolean; daysRemaining: number } {
  const lastRejected = db
    .prepare(`
      SELECT created_at FROM reimbursements
      WHERE user_id = ? AND status = 'rejected'
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `)
    .get(userId) as { created_at: string } | undefined;

  if (!lastRejected) return { allowed: true, daysRemaining: 0 };

  const lastDate = new Date(lastRejected.created_at);
  const cooldownEnd = new Date(lastDate);
  cooldownEnd.setDate(cooldownEnd.getDate() + cooldownDays);
  const now = new Date();

  if (now < cooldownEnd) {
    const diffMs = cooldownEnd.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return { allowed: false, daysRemaining };
  }

  return { allowed: true, daysRemaining: 0 };
}

/**
 * Check if order ID already exists in any reimbursement
 */
export function checkDuplicateOrderInReimbursements(externalOrderId: string): { duplicate: boolean; existingReimbId?: number } {
  const existing = db
    .prepare("SELECT id FROM reimbursements WHERE external_order_id = ? AND status IN ('pending', 'under_review', 'approved', 'paid') LIMIT 1")
    .get(externalOrderId) as { id: number } | undefined;

  return {
    duplicate: !!existing,
    existingReimbId: existing?.id,
  };
}

/**
 * Check user daily claim limit
 */
export function checkDailyClaimLimit(userId: number, maxPerDay: number = 3): { allowed: boolean; current: number } {
  const current = db
    .prepare(`
      SELECT COUNT(*) as cnt FROM reimbursements
      WHERE user_id = ? AND date(created_at) = date('now')
    `)
    .get(userId) as { cnt: number } | undefined;

  const count = current?.cnt || 0;
  return {
    allowed: count < maxPerDay,
    current: count,
  };
}

/**
 * Fingerprint an uploaded image.
 *
 * Used to be a truncated SHA-256, which only recognised byte-identical copies.
 * It is now a perceptual dHash (see lib/image-hash.ts), so a resized or
 * re-compressed screenshot of the same order is still recognised.
 */
export async function computeImageHash(buf: Buffer): Promise<string> {
  return computePerceptualHash(buf);
}

/**
 * Fraud scoring based on user behavior and request patterns
 */
export function calculateFraudScore(input: FraudScoreInput): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0; // 0 = safe, 100 = high fraud risk

  // Account age factor
  if (input.accountAgeDays !== undefined) {
    if (input.accountAgeDays < 1) {
      score += 30;
      reasons.push("Account created today");
    } else if (input.accountAgeDays < 7) {
      score += 15;
      reasons.push("Account less than 7 days old");
    } else if (input.accountAgeDays < 30) {
      score += 5;
      reasons.push("Account less than 30 days old");
    }
  }

  // Previous claims velocity
  if (input.previousClaimsCount !== undefined) {
    if (input.previousClaimsCount > 5) {
      score += 20;
      reasons.push("High claim frequency (>5 claims)");
    } else if (input.previousClaimsCount > 2) {
      score += 10;
      reasons.push("Moderate claim frequency (>2 claims)");
    }
  }

  // Rejected claims ratio
  if (input.rejectedClaimsCount !== undefined && input.previousClaimsCount !== undefined && input.previousClaimsCount > 0) {
    const rejectionRate = input.rejectedClaimsCount / input.previousClaimsCount;
    if (rejectionRate > 0.5) {
      score += 25;
      reasons.push(`High rejection rate: ${(rejectionRate * 100).toFixed(0)}%`);
    } else if (rejectionRate > 0.25) {
      score += 10;
      reasons.push(`Elevated rejection rate: ${(rejectionRate * 100).toFixed(0)}%`);
    }
  }

  // Device fingerprint duplicate
  if (input.deviceFingerprint) {
    const existing = db
      .prepare("SELECT COUNT(*) as cnt FROM orders WHERE device_fingerprint = ?")
      .get(input.deviceFingerprint) as { cnt: number } | undefined;
    if (existing && existing.cnt > 1) {
      score += 30;
      reasons.push(`Device fingerprint used for ${existing.cnt} orders`);
    }
  }

  // IP velocity (orders from same IP in last 24h)
  if (input.ip) {
    const recent = db
      .prepare("SELECT COUNT(*) as cnt FROM orders WHERE ip = ? AND datetime(created_at) > datetime('now', '-24 hours')")
      .get(input.ip) as { cnt: number } | undefined;
    if (recent && recent.cnt > 3) {
      score += 20;
      reasons.push(`${recent.cnt} orders from same IP in 24h`);
    }
  }

  // Click tracking validation
  if (input.clickId) {
    const click = db
      .prepare("SELECT id FROM click_tracking WHERE click_id = ?")
      .get(input.clickId) as { id: number } | undefined;
    if (!click) {
      score += 15;
      reasons.push("No click tracking record for this order");
    }
  }

  return { score: Math.min(100, score), reasons };
}

/**
 * Decision engine: auto-approve, flag for review, or reject
 */
export function makeDecision(
  ocrValidation: OcrValidationResult,
  fraudScore: { score: number; reasons: string[] }
): { action: "auto_approve" | "manual_review" | "reject"; reason: string } {
  const totalScore = ocrValidation.score - fraudScore.score;

  // Hard block: the same screenshot has already been used for another order.
  // This is the only condition that should refuse an order outright, because
  // an administrator can still adjudicate every other case.
  if (ocrValidation.details.imageHashUnique === false) {
    return {
      action: "reject",
      reason: "Screenshot has already been used for another order submission.",
    };
  }

  // Auto-approval is only allowed when the proof actually exists on this
  // server and OCR could read the matching Order ID. Previously a submission
  // with no screenshot, or one where the client simply omitted the OCR flag,
  // could be auto-approved from an attacker-supplied order ID.
  if (
    totalScore >= 80 &&
    ocrValidation.errors.length === 0 &&
    ocrValidation.details.ocrAvailable &&
    ocrValidation.details.orderIdMatch &&
    ocrValidation.details.imageHashUnique
  ) {
    return { action: "auto_approve", reason: "High confidence match, low fraud risk" };
  }

  // Everything else is queued for a human. Returning "reject" purely because the
  // aggregate score fell short made the site unusable for its main audience:
  // a brand-new account carries +30 fraud points for being new, so a first-time
  // reviewer's very first order was silently discarded instead of appearing in
  // the admin queue.
  return {
    action: "manual_review",
    reason: `Confidence ${totalScore}. Reasons: ${[
      ...ocrValidation.errors,
      ...ocrValidation.warnings,
      ...fraudScore.reasons,
    ].join("; ")}`,
  };
}

/**
 * p_hash of a stored screenshot URL, or "" when the URL is not one of ours.
 */
/** Fingerprint + OCR text for a stored screenshot, both used to compare reuse. */
function uploadFingerprint(url: string): { hash: string; text: string } {
  if (!url || !isStoredUploadUrl(url)) return { hash: "", text: "" };
  const row = db
    .prepare("SELECT p_hash, ocr_text FROM uploads WHERE url = ? LIMIT 1")
    .get(url) as { p_hash: string; ocr_text: string } | undefined;
  return { hash: row?.p_hash || "", text: row?.ocr_text || "" };
}

/**
 * Compare a screenshot against screenshots already attached to orders.
 * Returns "same", "similar" or "different".
 */
function compareWithOrders(
  url: string,
  excludeOrderId?: number
): "same" | "similar" | "different" {
  if (!url || !isStoredUploadUrl(url)) return "different";
  const target = uploadFingerprint(url);
  const excluded = excludeOrderId ?? -1;

  if (target.hash) {
    // Bounded to recent orders so this stays a fast lookup.
    const candidates = db
      .prepare(
        `SELECT u.p_hash AS h, u.ocr_text AS t FROM orders o
           JOIN uploads u ON u.url IN (o.order_screenshot_url, o.price_screenshot_url)
          WHERE o.id != ? AND u.p_hash != ''
          ORDER BY o.id DESC LIMIT 500`
      )
      .all(excluded) as { h: string; t: string }[];

    let verdict: "same" | "similar" | "different" = "different";
    for (const c of candidates) {
      const v = classifyScreenshotPair(target.hash, c.h, target.text, c.t);
      if (v === "same") return "same";
      if (v === "similar") verdict = "similar";
    }
    if (verdict !== "different") return verdict;
  }

  const byUrl = db
    .prepare(
      "SELECT id FROM orders WHERE (order_screenshot_url = ? OR price_screenshot_url = ?) AND id != ? LIMIT 1"
    )
    .get(url, url, excluded) as { id: number } | undefined;
  return byUrl ? "same" : "different";
}

/**
 * True when this screenshot, or a byte-identical copy of it, already belongs to
 * another order. Comparing hashes (not just the URL) catches the same file being
 * re-uploaded under a new name, while still letting a buyer retry a submission
 * with the screenshot already attached to their own order.
 */
export function isScreenshotUsedByAnotherOrder(url: string, excludeOrderId?: number): boolean {
  return compareWithOrders(url, excludeOrderId) === "same";
}

/**
 * A screenshot that looks like an earlier submission but cannot be proven to be
 * the same. Used to add fraud points, never to block.
 */
export function isScreenshotSimilarToAnotherOrder(url: string, excludeOrderId?: number): boolean {
  return compareWithOrders(url, excludeOrderId) === "similar";
}

/**
 * True when this screenshot, or a byte-identical copy of it, is already attached
 * to a refund claim for a different order.
 */
export function isScreenshotUsedByAnotherClaim(
  url: string,
  externalOrderId: string
): boolean {
  if (!url || !isStoredUploadUrl(url)) return false;
  const target = uploadFingerprint(url);

  if (target.hash) {
    const candidates = db
      .prepare(
        `SELECT u.p_hash AS h, u.ocr_text AS t FROM reimbursements r
           JOIN uploads u ON u.url IN (r.review_screenshot_url, r.order_screenshot_url, r.seller_feedback_url)
          WHERE r.external_order_id != ? AND u.p_hash != ''
          ORDER BY r.id DESC LIMIT 500`
      )
      .all(externalOrderId) as { h: string; t: string }[];
    if (
      candidates.some(
        (c) => classifyScreenshotPair(target.hash, c.h, target.text, c.t) === "same"
      )
    ) {
      return true;
    }
  }

  const byUrl = db
    .prepare(`
      SELECT id FROM reimbursements
      WHERE (review_screenshot_url = ? OR order_screenshot_url = ? OR seller_feedback_url = ?) AND external_order_id != ?
      LIMIT 1
    `)
    .get(url, url, url, externalOrderId) as { id: number } | undefined;
  return !!byUrl;
}

/**
 * Full validation pipeline for order submission
 */
export async function validateOrderSubmission(
  orderScreenshotUrl: string,
  priceScreenshotUrl: string,
  externalOrderId: string,
  total: number,
  orderDate: string,
  clickId?: string,
  userId?: number,
  ip?: string,
  deviceFingerprint?: string
): Promise<{
  ocrValidation: OcrValidationResult;
  fraudScore: { score: number; reasons: string[] };
  decision: { action: "auto_approve" | "manual_review" | "reject"; reason: string };
}> {
  // Get OCR data from upload records
  const orderUpload = isStoredUploadUrl(orderScreenshotUrl)
    ? db
        .prepare("SELECT ocr_order_id, ocr_amount, ocr_date, ocr_status FROM uploads WHERE url = ?")
        .get(orderScreenshotUrl)
    : null;

  const priceUpload = isStoredUploadUrl(priceScreenshotUrl)
    ? db.prepare("SELECT ocr_amount FROM uploads WHERE url = ?").get(priceScreenshotUrl)
    : null;

  const ocrAvailable =
    !!orderUpload && (orderUpload as { ocr_status?: string }).ocr_status === "done";

  const ocrOrderId = (orderUpload as any)?.ocr_order_id || "";
  // Prefer the order screenshot's amount; fall back to the price breakup. Do
  // not sum the two: both screenshots show the same order total and adding
  // them would double-count the amount against the form total.
  const ocrAmount =
    (orderUpload as any)?.ocr_amount ||
    (priceUpload as any)?.ocr_amount ||
    0;
  const ocrDate = (orderUpload as any)?.ocr_date || "";

  // Duplicate-screenshot detection. Compare against *existing orders*, not the
  // uploads table: every screenshot has its own `uploads` row carrying its own
  // p_hash, so a hash lookup there always matched the row belonging to this
  // very screenshot and hard-rejected every genuine submission.
  let imageHashUnique = true;
  for (const shotUrl of [orderScreenshotUrl, priceScreenshotUrl]) {
    if (!shotUrl) continue;
    if (isScreenshotUsedByAnotherOrder(shotUrl)) {
      imageHashUnique = false;
      console.warn(`Duplicate screenshot detected: ${shotUrl} already used by another order`);
      break;
    }
  }

  // Calculate account age
  let accountAgeDays: number | undefined;
  if (userId) {
    const user = db.prepare("SELECT created_at FROM users WHERE id = ?").get(userId) as { created_at: string } | undefined;
    if (user) {
      accountAgeDays = Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  // Previous claims
  const claims = userId
    ? db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected FROM reimbursements WHERE user_id = ?").get(userId)
    : { total: 0, rejected: 0 };

  // Run validations
  const ocrValidation = calculateOcrConfidence(
    ocrOrderId,
    externalOrderId,
    ocrAmount,
    total,
    ocrDate,
    orderDate
  );

  // Update image hash check result
  ocrValidation.details.imageHashUnique = imageHashUnique;
  ocrValidation.details.ocrAvailable = ocrAvailable;
  if (!imageHashUnique) {
    ocrValidation.errors.push("Screenshot already used for another order");
    ocrValidation.score -= 50;
  }

  const fraudScore = calculateFraudScore({
    userId,
    ip,
    deviceFingerprint,
    accountAgeDays,
    previousClaimsCount: (claims as any)?.total || 0,
    rejectedClaimsCount: (claims as any)?.rejected || 0,
    clickId,
  });

  const decision = makeDecision(ocrValidation, fraudScore);

  return { ocrValidation, fraudScore, decision };
}