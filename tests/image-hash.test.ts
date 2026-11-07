/**
 * Screenshot reuse detection.
 *
 * The hard requirement: a re-encoded/resized copy of a submitted screenshot must
 * still be recognised, while a *different* order that happens to use the same
 * marketplace layout must not be blocked. Pixels alone cannot do that (measured
 * distances overlap), so the verdict combines the dHash with the OCR text.
 */
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  computePerceptualHash,
  classifyScreenshotPair,
  hashDistanceRatio,
  hammingDistance,
  parseHash,
  textSimilarity,
  SAME_DISTANCE_RATIO,
  SIMILAR_DISTANCE_RATIO,
} from "../src/lib/image-hash";

// A fake order-confirmation screenshot: header, text lines, order total.
function orderSvg(opts: { total: string; orderId: string; widths: number[] }) {
  const rows = opts.widths
    .map(
      (w, i) =>
        `<rect x="20" y="${80 + i * 22}" width="${w}" height="12" fill="#4a4a4a"/>`
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360">
    <rect width="480" height="360" fill="#ffffff"/>
    <rect width="480" height="56" fill="#131921"/>
    <text x="24" y="36" font-family="sans-serif" font-size="22" fill="#fff">Your Orders</text>
    ${rows}
    <text x="24" y="300" font-family="sans-serif" font-size="20" fill="#111">Order ${opts.orderId}</text>
    <text x="24" y="330" font-family="sans-serif" font-size="20" fill="#111">Total ${opts.total}</text>
  </svg>`;
}

const A = orderSvg({
  total: "₹1,299",
  orderId: "404-1234567-1234567",
  widths: [300, 240, 380, 200, 160, 260],
});
const B = orderSvg({
  total: "₹2,499",
  orderId: "171-7654321-7654321",
  widths: [280, 250, 360, 210, 150, 270],
});

const TEXT_A =
  "your orders order 404-1234567-1234567 delivered on 12 august 2024 total 1,299 " +
  "seller retailnet payment visa ending 4321 ship to tauqeer mumbai 400001";
const TEXT_B =
  "your orders order 171-7654321-7654321 delivered on 3 september 2024 total 2,499 " +
  "seller appario payment upi ending 9087 ship to rahul pune 411001";

async function hashOf(svg: string, transform?: (s: sharp.Sharp) => sharp.Sharp) {
  let img = sharp(Buffer.from(svg));
  if (transform) img = transform(img);
  return computePerceptualHash(await img.png().toBuffer());
}

async function jpegHash(svg: string, quality: number, width?: number) {
  let img = sharp(Buffer.from(svg));
  if (width) img = img.resize({ width });
  return computePerceptualHash(await img.jpeg({ quality }).toBuffer());
}

test("fingerprint has the versioned format with a 4096-bit dHash", async () => {
  const hash = await hashOf(A);
  assert.match(hash, /^p1:[0-9a-f]{16}:[0-9a-f]{1024}$/);
  assert.equal(parseHash(hash)!.dhash.length * 4, 4096);
});

test("identical images are 'same'", async () => {
  const a = await hashOf(A);
  const b = await hashOf(A);
  assert.equal(classifyScreenshotPair(a, b, TEXT_A, TEXT_A), "same");
});

test("a re-compressed copy with the same OCR text is still 'same'", async () => {
  const original = await hashOf(A);
  const compressed = await jpegHash(A, 40);
  const verdict = classifyScreenshotPair(original, compressed, TEXT_A, TEXT_A);
  assert.equal(verdict, "same");
});

test("a resized copy with the same OCR text is still 'same'", async () => {
  const original = await hashOf(A);
  const resized = await jpegHash(A, 55, 320);
  assert.equal(classifyScreenshotPair(original, resized, TEXT_A, TEXT_A), "same");
});

test("the same picture with different text is never blocked", async () => {
  const original = await hashOf(A);
  const compressed = await jpegHash(A, 40);
  const verdict = classifyScreenshotPair(original, compressed, TEXT_A, TEXT_B);
  assert.notEqual(verdict, "same");
});

test("no OCR text means no accusation", async () => {
  const original = await hashOf(A);
  const compressed = await jpegHash(A, 40);
  assert.equal(classifyScreenshotPair(original, compressed, "", ""), "different");
});

test("a different order on the same layout is not 'same'", async () => {
  const a = await hashOf(A);
  const b = await hashOf(B);
  const verdict = classifyScreenshotPair(a, b, TEXT_A, TEXT_B);
  assert.notEqual(verdict, "same");
});

test("unrelated screenshots are 'different'", async () => {
  const a = await hashOf(A);
  const dark = await computePerceptualHash(
    await sharp({
      create: { width: 480, height: 360, channels: 3, background: "#101820" },
    })
      .png()
      .toBuffer()
  );
  assert.equal(classifyScreenshotPair(a, dark, TEXT_A, ""), "different");
});

test("byte-identical images match even when blank", async () => {
  const blank = await sharp({
    create: { width: 120, height: 90, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const a = await computePerceptualHash(blank);
  const b = await computePerceptualHash(blank);
  assert.equal(classifyScreenshotPair(a, b), "same");
});

test("blank images with different colours do not match on a flat hash", async () => {
  const white = await computePerceptualHash(
    await sharp({ create: { width: 120, height: 90, channels: 3, background: "#ffffff" } })
      .png()
      .toBuffer()
  );
  const black = await computePerceptualHash(
    await sharp({ create: { width: 120, height: 90, channels: 3, background: "#000000" } })
      .png()
      .toBuffer()
  );
  assert.equal(classifyScreenshotPair(white, black), "different");
});

test("watermark-sized crops keep a low distance", async () => {
  const original = await hashOf(A);
  const cropped = await computePerceptualHash(
    await sharp(Buffer.from(A))
      .extract({ left: 6, top: 6, width: 462, height: 342 })
      .png()
      .toBuffer()
  );
  const ratio = hashDistanceRatio(original, cropped);
  assert.ok(ratio !== null && ratio <= SIMILAR_DISTANCE_RATIO);
});

test("distance ratios are within 0..1 and ordered", async () => {
  const a = await hashOf(A);
  const same = await jpegHash(A, 40);
  const other = await hashOf(B);
  const rSame = hashDistanceRatio(a, same)!;
  const rOther = hashDistanceRatio(a, other)!;
  assert.ok(rSame <= SIMILAR_DISTANCE_RATIO);
  assert.ok(rSame < rOther);
  assert.ok(rOther <= 1);
  assert.ok(SAME_DISTANCE_RATIO < SIMILAR_DISTANCE_RATIO);
});

test("hamming distance counts differing bits", () => {
  assert.equal(hammingDistance("0000", "0000"), 0);
  assert.equal(hammingDistance("0000", "0001"), 1);
  assert.equal(hammingDistance("0000", "ffff"), 16);
});

test("text similarity separates different orders", () => {
  assert.ok(textSimilarity(TEXT_A, TEXT_A) === 1);
  assert.ok(textSimilarity(TEXT_A, TEXT_B) < 0.5);
  // Too little text to be meaningful.
  assert.equal(textSimilarity("order 1", "order 1"), 0);
});

test("legacy bare sha hashes still compare exactly", () => {
  assert.equal(classifyScreenshotPair("abc123", "abc123"), "same");
  assert.equal(classifyScreenshotPair("abc123", "abc124"), "different");
});

test("incomparable hash widths are not treated as the same image", async () => {
  const current = await hashOf(A);
  const legacy = "p1:deadbeefdeadbeef:0123456789abcdef"; // old 64-bit rows
  assert.equal(classifyScreenshotPair(current, legacy), "different");
});
