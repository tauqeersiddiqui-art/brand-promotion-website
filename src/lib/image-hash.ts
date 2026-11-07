import crypto from "crypto";
import sharp from "sharp";

/**
 * Screenshot fingerprinting for anti-fraud checks.
 *
 * Two independent signals, because neither is sufficient alone:
 *
 * 1. A 65x64 difference hash (dHash, 4096 bits) of a lightly blurred grey
 *    image — survives resizing and re-compression, but two *different* orders
 *    from the same marketplace still look close, because the layout dominates.
 *    Measured on synthetic order pages: a recompressed copy drifts ~2%, a
 *    different order ~2.5%, a 6px crop ~6.5%. The bands overlap, so pixels
 *    alone must never decide a block.
 *
 * 2. The OCR text of the screenshot — re-compressing the same screenshot keeps
 *    its text identical (order id, amounts, names), while a different order
 *    changes it. Text is the discriminative signal.
 *
 * A pair is only treated as the same screenshot when the hashes are nearly
 * identical, or when the images are perceptually close AND their OCR text
 * matches. Anything merely "similar" is reported so it can add fraud points,
 * never to block a genuine customer.
 *
 * Stored format: `p1:<sha256-prefix>:<hex dhash>`.
 */

export const HASH_PREFIX = "p1";
const HASH_WIDTH = 65;
const HASH_HEIGHT = 64;

/** <= 1.2% of bits: effectively the same pixels. */
export const SAME_DISTANCE_RATIO = 0.012;
/** <= 8% of bits: close enough that the OCR text decides. */
export const SIMILAR_DISTANCE_RATIO = 0.08;
/** OCR text overlap that confirms the same screenshot. */
export const TEXT_SAME_RATIO = 0.85;
/** OCR text overlap that is worth a warning but not a block. */
export const TEXT_RELATED_RATIO = 0.55;

export type ParsedHash = { sha: string; dhash: string };

export function parseHash(value: string | null | undefined): ParsedHash | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) return null;
  return { sha: parts[1] || "", dhash: parts[2] || "" };
}

export async function computePerceptualHash(buf: Buffer): Promise<string> {
  const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);

  try {
    const raw = await sharp(buf, { failOn: "none" })
      // Honour EXIF orientation so a rotated copy hashes the same as the original.
      .rotate()
      .greyscale()
      // Light blur removes JPEG block noise before the gradient comparison.
      .blur(0.8)
      .resize(HASH_WIDTH, HASH_HEIGHT, { fit: "fill" })
      .raw()
      .toBuffer();

    let bits = "";
    for (let y = 0; y < HASH_HEIGHT; y++) {
      for (let x = 0; x < HASH_WIDTH - 1; x++) {
        const left = raw[y * HASH_WIDTH + x];
        const right = raw[y * HASH_WIDTH + x + 1];
        bits += left > right ? "1" : "0";
      }
    }

    let hex = "";
    for (let i = 0; i + 4 <= bits.length; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return `${HASH_PREFIX}:${sha}:${hex}`;
  } catch {
    // Undecodable (or not really an image): byte hash only.
    return `${HASH_PREFIX}:${sha}:`;
  }
}

export function hammingDistance(aHex: string, bHex: string): number {
  if (!aHex || !bHex) return Number.MAX_SAFE_INTEGER;
  const len = Math.min(aHex.length, bHex.length);
  let distance = 0;
  for (let i = 0; i < len; i++) {
    let x = parseInt(aHex[i], 16) ^ parseInt(bHex[i], 16);
    if (Number.isNaN(x)) return Number.MAX_SAFE_INTEGER;
    x &= 0xf;
    distance += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
  }
  return distance;
}

/** Perceptual distance as a fraction of the hash width, or null if incomparable. */
export function hashDistanceRatio(
  a: string | null | undefined,
  b: string | null | undefined
): number | null {
  const pa = parseHash(a);
  const pb = parseHash(b);
  if (!pa || !pb || !pa.dhash || !pb.dhash) return null;
  if (pa.dhash.length !== pb.dhash.length) return null;

  const bits = pa.dhash.length * 4;
  if (bits === 0) return null;
  return hammingDistance(pa.dhash, pb.dhash) / bits;
}

/** Normalized token set for OCR text (order ids, amounts, names, addresses). */
function textTokens(text: string | null | undefined): Set<string> {
  const tokens = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9₹.,/\- ]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
  return new Set(tokens);
}

/**
 * Jaccard similarity of two OCR texts, 0..1.
 * Returns 0 when either text is too short to be meaningful.
 */
export function textSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = textTokens(a);
  const tb = textTokens(b);
  if (ta.size < 8 || tb.size < 8) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

export type ScreenshotVerdict = "same" | "similar" | "different";

/**
 * Decide whether two stored screenshots are the same picture.
 *
 * @param aHash fingerprint of one screenshot
 * @param bHash fingerprint of the other
 * @param aText OCR text of one screenshot
 * @param bText OCR text of the other
 */
export function classifyScreenshotPair(
  aHash: string | null | undefined,
  bHash: string | null | undefined,
  aText?: string | null,
  bText?: string | null
): ScreenshotVerdict {
  if (!aHash || !bHash) return "different";

  const pa = parseHash(aHash);
  const pb = parseHash(bHash);

  // Legacy bare-sha values can only be compared for exact equality.
  if (!pa || !pb) return aHash === bHash ? "same" : "different";

  if (pa.sha && pa.sha === pb.sha) return "same";

  const ratio = hashDistanceRatio(aHash, bHash);
  if (ratio === null) return "different";

  // Flat frames (blank/cropped-to-white) carry no shape information.
  const flat = (h: string) => /^0+$/.test(h) || /^f+$/.test(h);
  if (flat(pa.dhash) || flat(pb.dhash)) return "different";

  if (ratio <= SAME_DISTANCE_RATIO) return "same";
  if (ratio > SIMILAR_DISTANCE_RATIO) return "different";

  // Pixels are close, but only the OCR text can confirm it is the same
  // screenshot rather than another order on a nearly identical page. With no
  // OCR text we cannot confirm, so we stay silent rather than accuse a customer.
  const text = textSimilarity(aText, bText);
  if (text >= TEXT_SAME_RATIO) return "same";
  if (text >= TEXT_RELATED_RATIO) return "similar";
  return "different";
}
