/* Seeds settings + owner account + sample deals for Brand Promotion (ShopFluencer model).
   Run: node scripts/seed.js */
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const Database = require("better-sqlite3");
const db = new Database(path.join(DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------- schema ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
    provider TEXT NOT NULL DEFAULT 'credentials',
    google_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_code TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'General',
    platform TEXT NOT NULL DEFAULT 'Amazon',
    deal_type TEXT NOT NULL DEFAULT '100% Cashback',
    image_url TEXT NOT NULL DEFAULT '',
    deal_url TEXT NOT NULL DEFAULT '',
    target_keyword TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    coupon_code TEXT NOT NULL DEFAULT '',
    price_original REAL NOT NULL DEFAULT 0,
    price_sale REAL NOT NULL DEFAULT 0,
    cashback_amount REAL NOT NULL DEFAULT 0,
    total_slots INTEGER NOT NULL DEFAULT 50,
    claimed_slots INTEGER NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    featured INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT NOT NULL UNIQUE,
    external_order_id TEXT NOT NULL DEFAULT '',
    product_code TEXT NOT NULL DEFAULT '',
    deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewer_name TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'Amazon',
    deal_type TEXT NOT NULL DEFAULT '100% Cashback',
    mediator_name TEXT NOT NULL DEFAULT 'Direct',
    order_date TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    pincode TEXT NOT NULL DEFAULT '',
    variant TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    unit_price REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    order_screenshot_url TEXT NOT NULL DEFAULT '',
    price_screenshot_url TEXT NOT NULL DEFAULT '',
    ocr_order_id TEXT NOT NULL DEFAULT '',
    ocr_order_match INTEGER NOT NULL DEFAULT 0,
    admin_note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','verified','shipped','delivered','rejected','cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reimbursements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reimbursement_code TEXT NOT NULL UNIQUE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
    external_order_id TEXT NOT NULL DEFAULT '',
    reviewer_name TEXT NOT NULL DEFAULT '',
    review_rating INTEGER NOT NULL DEFAULT 5 CHECK (review_rating BETWEEN 1 AND 5),
    review_text TEXT NOT NULL DEFAULT '',
    review_link TEXT NOT NULL DEFAULT '',
    review_screenshot_url TEXT NOT NULL DEFAULT '',
    ocr_text TEXT NOT NULL DEFAULT '',
    ocr_status TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending','done','failed')),
    payout_method TEXT NOT NULL DEFAULT 'upi' CHECK (payout_method IN ('upi','bank')),
    upi_id TEXT NOT NULL DEFAULT '',
    bank_name TEXT NOT NULL DEFAULT '',
    account_number TEXT NOT NULL DEFAULT '',
    ifsc_code TEXT NOT NULL DEFAULT '',
    account_holder TEXT NOT NULL DEFAULT '',
    amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected')),
    utr_number TEXT NOT NULL DEFAULT '',
    admin_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS refunds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    refund_code TEXT NOT NULL UNIQUE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','processed')),
    admin_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_code TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
    text TEXT NOT NULL DEFAULT '',
    screenshot_url TEXT NOT NULL DEFAULT '',
    ocr_text TEXT NOT NULL DEFAULT '',
    ocr_status TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending','done','failed')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    admin_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_deals_active ON deals(active, featured);
  CREATE INDEX IF NOT EXISTS idx_deals_code ON deals(product_code);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_deal ON orders(deal_id);
  CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code);
  CREATE INDEX IF NOT EXISTS idx_orders_ext ON orders(external_order_id);
  CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
  CREATE INDEX IF NOT EXISTS idx_reimb_order ON reimbursements(order_id);
  CREATE INDEX IF NOT EXISTS idx_reimb_ext ON reimbursements(external_order_id);
  CREATE INDEX IF NOT EXISTS idx_reimb_user ON reimbursements(user_id);
  CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_deal ON reviews(deal_id, status);
  CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
`);

const bcrypt = require("bcryptjs");

// ---------- settings ----------
const settingStmt = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);
[
  ["site_name", "Brand Promotion"],
  ["tagline", "India's #1 Influencer Cashback & Brand Deals Platform"],
  ["announcement", "🔥 100% Cashback Campaign Live! Buy on Amazon/Flipkart, share review & get full UPI reimbursement."],
  ["whatsapp", "919999999999"],
  ["telegram", "brandpromotion"],
  ["support_email", "support@brandpromotion.in"],
  ["instagram", "brandpromotion.in"],
  ["mediators", "Direct,Amit Mediator,Rahul Agency,Pooja Deals,VIP Campaigns,Social Reach"],
  ["rules_instructions", "1. Check available slots before ordering.\n2. Search product with specified keyword on Amazon/Flipkart.\n3. Upload Desktop/App Order screenshot & Price breakup screenshot.\n4. After delivery, post a genuine 5-star rating with photos.\n5. Submit reimbursement claim with Review Screenshot & UPI ID to receive 100% cashback within 24-48 hours."],
].forEach(([k, v]) => settingStmt.run(k, v));

// ---------- owner account ----------
// ADMIN_PASSWORD (when set) is authoritative: on boot it creates the owner
// account or syncs the password of the existing one, so a lost admin password
// is recovered by changing the env var and restarting the service.
const adminEmail = (process.env.ADMIN_EMAIL || "admin@brandpromotion.in").toLowerCase();
const envPassword = process.env.ADMIN_PASSWORD || "";
const existing = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(adminEmail);
if (!existing) {
  const initialPassword = envPassword || "ChangeMe@123";
  const hash = bcrypt.hashSync(initialPassword, 12);
  db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')"
  ).run("Administrator", adminEmail, hash);
  console.log(`Owner account created: ${adminEmail} / ${initialPassword}`);
} else if (envPassword && !bcrypt.compareSync(envPassword, existing.password_hash)) {
  db.prepare("UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?").run(
    bcrypt.hashSync(envPassword, 12),
    existing.id
  );
  console.log(`Owner password synced from ADMIN_PASSWORD for: ${adminEmail}`);
} else {
  console.log(`Owner account already exists: ${adminEmail}`);
}

// ---------- sample deals (Influencer / 100% Cashback Deals) ----------
const count = db.prepare("SELECT COUNT(*) AS c FROM deals").get().c;
if (count === 0) {
  const deals = [
    {
      product_code: "SF-E101",
      title: "ANC Wireless Earbuds 40H Playtime with Quad Mic",
      description: "Buy on Amazon, post verified 5-star review with images, get 100% cashback via UPI.",
      category: "Electronics",
      platform: "Amazon",
      deal_type: "100% Cashback",
      image_url: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&auto=format&fit=crop&q=80",
      deal_url: "https://www.amazon.in",
      target_keyword: "Search 'wireless earbuds anc quad mic' and look for brand SoundPro",
      instructions: "Must purchase without coupon. Upload desktop order confirmation + price breakup. Post review 3 days after delivery.",
      coupon_code: "",
      price_original: 2999,
      price_sale: 1499,
      cashback_amount: 1499,
      total_slots: 50,
      claimed_slots: 12,
      stock: 38,
      featured: 1,
    },
    {
      product_code: "SF-B202",
      title: "Vitamin C & Hyaluronic Glowing Face Serum (30ml)",
      description: "100% Natural brightening serum for all skin types. Flipkart review campaign with full refund.",
      category: "Beauty",
      platform: "Flipkart",
      deal_type: "100% Cashback",
      image_url: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&auto=format&fit=crop&q=80",
      deal_url: "https://www.flipkart.com",
      target_keyword: "Search 'Vitamin C Glow Serum' and select seller GlowPure Official",
      instructions: "Take unboxing photo + selfie with serum. Write at least 25 words review with 5 stars.",
      coupon_code: "",
      price_original: 899,
      price_sale: 499,
      cashback_amount: 499,
      total_slots: 100,
      claimed_slots: 43,
      stock: 57,
      featured: 1,
    },
    {
      product_code: "SF-H303",
      title: "Smart RGBIC Wi-Fi LED Corner Floor Lamp",
      description: "Voice-controlled corner atmosphere lamp. 16M RGB colors, music sync, Alexa compatible.",
      category: "Home",
      platform: "Amazon",
      deal_type: "100% Cashback",
      image_url: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&auto=format&fit=crop&q=80",
      deal_url: "https://www.amazon.in",
      target_keyword: "Search 'RGBIC corner floor lamp smart app'",
      instructions: "High ticket campaign. Order screenshot must clearly show Amazon Order ID and full price paid.",
      coupon_code: "",
      price_original: 4999,
      price_sale: 2499,
      cashback_amount: 2499,
      total_slots: 30,
      claimed_slots: 8,
      stock: 22,
      featured: 1,
    },
    {
      product_code: "SF-F404",
      title: "Stainless Steel Insulated Sports Water Bottle 1L",
      description: "Keeps drinks cold for 24 hours, hot for 12 hours. BPA free, leak-proof sports cap.",
      category: "Fitness",
      platform: "Amazon",
      deal_type: "100% Cashback",
      image_url: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&auto=format&fit=crop&q=80",
      deal_url: "https://www.amazon.in",
      target_keyword: "Search 'insulated steel bottle 1 litre gym'",
      instructions: "Rate 5-star with bottle in hand. Cashback credited to UPI after review goes live.",
      coupon_code: "",
      price_original: 1299,
      price_sale: 649,
      cashback_amount: 649,
      total_slots: 60,
      claimed_slots: 29,
      stock: 31,
      featured: 0,
    },
  ];

  const ins = db.prepare(
    `INSERT INTO deals (product_code, title, description, category, platform, deal_type, image_url, deal_url,
      target_keyword, instructions, coupon_code, price_original, price_sale, cashback_amount,
      total_slots, claimed_slots, stock, featured, active)
     VALUES (@product_code, @title, @description, @category, @platform, @deal_type, @image_url, @deal_url,
      @target_keyword, @instructions, @coupon_code, @price_original, @price_sale, @cashback_amount,
      @total_slots, @claimed_slots, @stock, @featured, 1)`
  );
  deals.forEach((d) => ins.run(d));
  console.log(`Seeded ${deals.length} sample brand promotion deals.`);
}

db.close();
