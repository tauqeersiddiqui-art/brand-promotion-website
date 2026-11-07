/* Recompute perceptual fingerprints for uploads stored before dHash existed.
   Run: npm run backfill:hashes

   Old rows hold a bare sha256 prefix, which only matches byte-identical files.
   This upgrades them to `p1:<sha>:<dhash>` so resized/re-compressed copies of
   already-submitted screenshots are recognised too. Safe to re-run: rows that
   already carry a p1 hash are skipped. */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const sharp = require("sharp");

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(DATA_DIR, "uploads"));
const LEGACY_DIR = path.join(process.cwd(), "public", "uploads");

const db = new Database(
  path.resolve(process.env.DATABASE_PATH || path.join(DATA_DIR, "app.db"))
);

async function hash(buf) {
  const sha = require("crypto").createHash("sha256").update(buf).digest("hex").slice(0, 16);
  try {
    // Must match lib/image-hash.ts exactly (65x64 dHash, blurred).
    const raw = await sharp(buf, { failOn: "none" })
      .rotate()
      .greyscale()
      .blur(0.8)
      .resize(65, 64, { fit: "fill" })
      .raw()
      .toBuffer();
    let bits = "";
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        bits += raw[y * 65 + x] > raw[y * 65 + x + 1] ? "1" : "0";
      }
    }
    let hex = "";
    for (let i = 0; i + 4 <= bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return `p1:${sha}:${hex}`;
  } catch {
    return `p1:${sha}:`;
  }
}

function fileFor(url) {
  const name = path.basename(url || "");
  if (!name) return "";
  for (const dir of [UPLOAD_DIR, LEGACY_DIR]) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

(async () => {
  const rows = db
    .prepare("SELECT id, url FROM uploads WHERE p_hash NOT LIKE 'p1:%'")
    .all();

  console.log(`${rows.length} upload(s) to finger-print`);
  let updated = 0;
  let missing = 0;

  for (const row of rows) {
    const file = fileFor(row.url);
    if (!file) {
      missing++;
      continue;
    }
    const buf = fs.readFileSync(file);
    db.prepare("UPDATE uploads SET p_hash = ? WHERE id = ?").run(await hash(buf), row.id);
    updated++;
    if (updated % 50 === 0) console.log(`  ${updated} done…`);
  }

  console.log(`Updated ${updated}, skipped ${missing} (file missing from disk).`);
  db.close();
})().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
