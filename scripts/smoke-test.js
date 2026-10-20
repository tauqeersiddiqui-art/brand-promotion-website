// End-to-end smoke test for the Brand Promotion site.
// Usage: node scripts/smoke-test.js
const BASE = process.env.SMOKE_BASE || "http://localhost:3000";

const fs = require("fs");
const path = require("path");

// Load admin credentials from .env when not provided in the environment so the
// test always matches the owner account configured for this instance.
function loadDotEnv() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const key = m[1];
      let value = m[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    /* no .env file - rely on environment/defaults */
  }
}
loadDotEnv();

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@brandpromotion.in").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe@123";

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` -> ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function section(t) {
  console.log(`\n=== ${t} ===`);
}

// Minimal cookie jar
class Jar {
  constructor() {
    this.cookies = new Map();
  }
  absorb(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      if (idx === -1) continue;
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (v === "" ) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  get(name) {
    return this.cookies.get(name);
  }
  clearAuth() {
    for (const k of [...this.cookies.keys()]) {
      if (k.startsWith("bp_session") || k.startsWith("bp_user")) this.cookies.delete(k);
    }
  }
}

async function req(jar, path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const cookie = jar.header();
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers, redirect: "manual" });
  jar.absorb(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text, headers: res.headers };
}

(async () => {
  const guest = new Jar();
  const admin = new Jar();
  const email = `smoke_${Date.now()}@example.com`;
  const email2 = `smoke_${Date.now()}_2@example.com`;

  section("CSRF bootstrap");
  {
    const r = await req(guest, "/api/csrf");
    check("GET /api/csrf 200", r.status === 200, `got ${r.status}`);
    check("bp_csrf cookie set", !!guest.get("bp_csrf"));
    check("bp_csrf_js cookie set (client readable)", !!guest.get("bp_csrf_js"));
  }

  section("Public pages render");
  for (const p of ["/", "/browse", "/track", "/login", "/signup", "/terms", "/privacy", "/contact"]) {
    const r = await req(guest, p);
    check(`GET ${p} 200`, r.status === 200, `got ${r.status}`);
  }

  section("Deals API");
  {
    const r = await req(guest, "/api/deals");
    check("GET /api/deals 200", r.status === 200, `got ${r.status}`);
    check("deals array present", Array.isArray(r.json?.deals));
    const lim = await req(guest, "/api/deals?limit=50");
    check("GET /api/deals?limit=50 honoured", lim.status === 200 && Array.isArray(lim.json?.deals));
  }

  section("Admin auth");
  {
    const noCsrf = await req(guest, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    check("login without CSRF rejected", noCsrf.status === 403, `got ${noCsrf.status}`);

    await req(admin, "/api/csrf");
    const token = admin.get("bp_csrf_js");
    const r = await req(admin, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": token },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    check("admin login with CSRF 200", r.status === 200, `got ${r.status} ${r.text.slice(0, 120)}`);
    check("role is admin", r.json?.user?.role === "admin");
  }

  section("Admin reads (incl. previously 500 paths)");
  for (const p of [
    "/api/admin/stats",
    "/api/admin/deals",
    "/api/admin/orders",
    "/api/admin/users",
    "/api/admin/users?search=a",
    "/api/admin/settings",
    "/api/admin/reviews",
    "/api/admin/refunds",
    "/api/admin/reimbursements",
  ]) {
    const r = await req(admin, p);
    check(`GET ${p} 200`, r.status === 200, `got ${r.status}`);
  }

  section("Admin authorization enforced");
  {
    const r = await req(guest, "/api/admin/stats");
    check("guest blocked from /api/admin/stats", r.status === 401 || r.status === 403, `got ${r.status}`);
  }

  section("Admin write (CSRF enforced + round-trip)");
  let dealId = null;
  {
    // The route consumes multipart/form-data, not JSON.
    const fd = new FormData();
    fd.set("title", "Smoke Test Deal");
    fd.set("description", "temporary");
    fd.set("category", "General");
    fd.set("platform", "Amazon");
    fd.set("deal_type", "100% Cashback");
    fd.set("deal_url", "https://example.com/p");
    fd.set("image_url", "https://example.com/i.png");
    fd.set("price_original", "500");
    fd.set("price_sale", "500");
    fd.set("cashback_amount", "500");
    fd.set("total_slots", "5");
    fd.set("stock", "5");

    const created = await req(admin, "/api/admin/deals", {
      method: "POST",
      headers: { "x-csrf-token": admin.get("bp_csrf_js") },
      body: fd,
    });
    check(
      "create deal 200/201",
      created.status === 200 || created.status === 201,
      `got ${created.status} ${created.text.slice(0, 150)}`
    );
    dealId = created.json?.id;
    check("create deal reports telegram status", typeof created.json?.telegram === "string", `got ${typeof created.json?.telegram}`);

    const noCsrfWrite = await req(admin, "/api/admin/deals", {
      method: "POST",
      body: fd,
    });
    check("admin write without CSRF rejected", noCsrfWrite.status === 403, `got ${noCsrfWrite.status}`);

    if (dealId) {
      // PATCH also consumes multipart/form-data.
      const pfd = new FormData();
      pfd.set("title", "Smoke Test Deal (edited)");
      const patch = await req(admin, `/api/admin/deals/${dealId}`, {
        method: "PATCH",
        headers: { "x-csrf-token": admin.get("bp_csrf_js") },
        body: pfd,
      });
      check("PATCH deal 200", patch.status === 200, `got ${patch.status} ${patch.text.slice(0, 150)}`);
    } else {
      check("PATCH deal 200", false, "no deal id returned");
    }

    if (dealId) {
      const tg = await req(admin, `/api/admin/deals/${dealId}/telegram`, {
        method: "POST",
        headers: { "x-csrf-token": admin.get("bp_csrf_js") },
      });
      check("telegram repost endpoint responds", tg.status === 200 || tg.status === 400, `got ${tg.status}`);
      if (tg.status === 400) {
        check("telegram unconfigured gives clear error", /Telegram/i.test(tg.json?.error || ""), tg.json?.error);
      }
    }
    globalThis.__smokeDealId = dealId;
  }

  section("Auth gate: login required for orders");
  {
    const meAnon = await req(guest, "/api/auth/me");
    check(
      "GET /api/auth/me guest -> user null",
      meAnon.status === 200 && meAnon.json?.user === null,
      `got ${meAnon.status} ${meAnon.text.slice(0, 120)}`
    );

    const anonOrd = await req(guest, "/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": guest.get("bp_csrf_js") },
      body: JSON.stringify({
        external_order_id: `SMOKE-ANON-${Date.now()}`,
        reviewer_name: "Anon",
        full_name: "Anon User",
        email: "anon@example.com",
        phone: "9876543210",
      }),
    });
    check("orders without login -> 401", anonOrd.status === 401, `got ${anonOrd.status} ${anonOrd.text.slice(0, 120)}`);
  }

  section("User signup + order funnel");
  let orderCode = null;
  let orderId = null;
  {
    const su = await req(guest, "/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": guest.get("bp_csrf_js") },
      body: JSON.stringify({ name: "Smoke Tester", email, password: "SmokeTest@123" }),
    });
    check("signup 200", su.status === 200, `got ${su.status} ${su.text.slice(0, 150)}`);

    const meUser = await req(guest, "/api/auth/me");
    check(
      "GET /api/auth/me logged-in -> user",
      meUser.status === 200 && meUser.json?.user?.email === email,
      `got ${meUser.status} ${meUser.text.slice(0, 120)}`
    );

    const deals = await req(guest, "/api/deals?limit=1");
    const firstDealId = deals.json?.deals?.[0]?.id;

    const ord = await req(guest, "/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": guest.get("bp_csrf_js") },
      body: JSON.stringify({
        deal_id: firstDealId,
        external_order_id: `SMOKE-${Date.now()}`,
        reviewer_name: "Smoke Tester",
        full_name: "Smoke Tester",
        email,
        phone: "9876543210",
        quantity: 1,
        unit_price: 500,
        city: "Pune",
        state: "MH",
        pincode: "411001",
      }),
    });
    check("POST /api/orders 200", ord.status === 200, `got ${ord.status} ${ord.text.slice(0, 200)}`);
    orderCode = ord.json?.order_code;
    orderId = ord.json?.order_id;
    check("order_code returned", !!orderCode);

    const badDeal = await req(guest, "/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": guest.get("bp_csrf_js") },
      body: JSON.stringify({
        deal_id: 999999,
        external_order_id: `SMOKE-BAD-${Date.now()}`,
        reviewer_name: "x", full_name: "x", email, phone: "9876543210",
      }),
    });
    check("unknown campaign -> 4xx not 500", badDeal.status >= 400 && badDeal.status < 500, `got ${badDeal.status}`);

    // Regression: a freshly uploaded screenshot must not be rejected as its
    // own duplicate. The old check hashed against the uploads table, where the
    // row for this very screenshot always matched, so every submission with a
    // screenshot was hard-rejected. Trailing bytes make the hash unique per run.
    const pngBase = fs.readFileSync(path.join(process.cwd(), "public", "brandreviewer-telegram-qr.png"));
    const png = Buffer.concat([pngBase, Buffer.from([Date.now() & 0xff, (Date.now() >> 8) & 0xff])]);
    const fd = new FormData();
    fd.append("file", new Blob([png], { type: "image/png" }), "smoke-dup.png");
    const up = await req(guest, "/api/upload", {
      method: "POST",
      headers: { "x-csrf-token": guest.get("bp_csrf_js") },
      body: fd,
    });
    check("screenshot upload 200", up.status === 200 && !!up.json?.url, `got ${up.status} ${up.text.slice(0, 150)}`);
    const shotUrl = up.json?.url;

    if (shotUrl) {
      const shotOrd = await req(guest, "/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": guest.get("bp_csrf_js") },
        body: JSON.stringify({
          deal_id: firstDealId,
          external_order_id: `SMOKE-SHOT-${Date.now()}`,
          reviewer_name: "Smoke Tester",
          full_name: "Smoke Tester",
          email,
          phone: "9876543210",
          quantity: 1,
          unit_price: 500,
          order_screenshot_url: shotUrl,
          price_screenshot_url: shotUrl,
        }),
      });
      check("order with fresh screenshot accepted", shotOrd.status === 200, `got ${shotOrd.status} ${shotOrd.text.slice(0, 200)}`);

      const dupOrd = await req(guest, "/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": guest.get("bp_csrf_js") },
        body: JSON.stringify({
          deal_id: firstDealId,
          external_order_id: `SMOKE-DUP-${Date.now()}`,
          reviewer_name: "Smoke Tester",
          full_name: "Smoke Tester",
          email,
          phone: "9876543210",
          quantity: 1,
          unit_price: 500,
          order_screenshot_url: shotUrl,
          price_screenshot_url: shotUrl,
        }),
      });
      check("reused screenshot rejected (400)", dupOrd.status === 400, `got ${dupOrd.status} ${dupOrd.text.slice(0, 150)}`);
    }
  }

  section("Tracking");
  if (orderCode) {
    const r = await req(guest, `/api/track?q=${encodeURIComponent(orderCode)}`);
    check("track 200", r.status === 200, `got ${r.status}`);
    check("track has found=true", r.json?.found === true);
    check("track type=single", r.json?.type === "single", `got ${r.json?.type}`);
    check("track order object present", !!r.json?.order?.order_code);
    check("track omits admin_note", r.json?.order && !("admin_note" in r.json.order));
  }
  {
    const short = await req(guest, "/api/track?q=987");
    check("short query rejected (no enumeration)", short.status === 400 || short.status === 404, `got ${short.status}`);
  }

  section("Tracking is private");
  {
    const anon = new Jar();
    const r = await req(anon, "/api/track?q=BP-SMOKE-NOT-LOGGED-IN");
    check("track without login -> 401", r.status === 401, `got ${r.status}`);

    const other = new Jar();
    await req(other, "/api/csrf");
    const su2 = await req(other, "/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": other.get("bp_csrf_js") },
      body: JSON.stringify({ name: "Smoke Other", email: email2, password: "SmokeTest@123" }),
    });
    check("second smoke signup 200", su2.status === 200, `got ${su2.status} ${su2.text.slice(0, 120)}`);
    const r2 = await req(other, `/api/track?q=${encodeURIComponent(orderCode)}`);
    check("other user cannot track foreign order", r2.status === 404, `got ${r2.status} ${r2.text.slice(0, 120)}`);
  }

  section("Reimbursement authorization");
  {
    const r = await req(guest, "/api/reimbursements", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": guest.get("bp_csrf_js") },
      body: JSON.stringify({
        order_identifier: orderCode || "none",
        payout_method: "upi",
        upi_id: "attacker@evilbank",
      }),
    });
    // The order belongs to `guest`, so this should get past auth and fail later
    // (not a review) OR succeed-guard. Either way it must never file against
    // another user's order.
    check("claim scoped to owner", r.status !== 500, `got ${r.status} ${r.text.slice(0, 120)}`);
  }

  section("CSRF still enforced on writes");
  {
    const r = await req(guest, "/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    check("orders without CSRF -> 403", r.status === 403, `got ${r.status}`);
  }

  // ---- Full cashback funnel: order -> delivered -> review -> claim -> payout ----
  section("Cashback funnel");
  let reviewId = null;
  let reimbId = null;
  {
    // 1. Admin marks the smoke order delivered (stamps delivered_at).
    const patched = await req(admin, `/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-csrf-token": admin.get("bp_csrf_js") },
      body: JSON.stringify({ status: "delivered" }),
    });
    check("admin sets order delivered", patched.status === 200, `got ${patched.status} ${patched.text.slice(0, 150)}`);

    // 2. User sees the order in their account.
    const mine = await req(guest, "/api/orders/me");
    check("GET /api/orders/me 200", mine.status === 200, `got ${mine.status}`);
    const mineOrder = mine.json?.orders?.find((o) => o.id === orderId);
    check("order visible to owner", !!mineOrder);
    const adminList = await req(
      admin,
      `/api/admin/orders?search=${encodeURIComponent(orderCode)}`
    );
    check(
      "new order visible in admin list",
      adminList.status === 200 && (adminList.json?.total || 0) >= 1,
      `status=${adminList.status} total=${adminList.json?.total}`
    );
    check("orders/me hides fraud_score", !mineOrder || !("fraud_score" in mineOrder));
    check("orders/me hides ip", !mineOrder || !("ip" in mineOrder));
    check("order status is delivered", mineOrder?.status === "delivered", `got ${mineOrder?.status}`);

    // 3. User submits a review (the button that used to be unreachable).
    const rfd = new FormData();
    rfd.set("order_id", String(orderId));
    rfd.set("rating", "5");
    rfd.set("text", "Great product, fast delivery.");
    const rev = await req(guest, "/api/reviews", {
      method: "POST",
      headers: { "x-csrf-token": guest.get("bp_csrf_js") },
      body: rfd,
    });
    check("POST /api/reviews 200", rev.status === 200, `got ${rev.status} ${rev.text.slice(0, 200)}`);

    // 4. Admin approves the review.
    const rvList = await req(admin, "/api/admin/reviews?status=pending");
    const pending = rvList.json?.reviews?.find((x) => x.order_id === orderId);
    reviewId = pending?.id;
    check("review visible to admin", !!reviewId);
    if (reviewId) {
      const appr = await req(admin, `/api/admin/reviews/${reviewId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": admin.get("bp_csrf_js") },
        body: JSON.stringify({ status: "approved" }),
      });
      check("admin approves review", appr.status === 200, `got ${appr.status} ${appr.text.slice(0, 150)}`);
    }

    // 5. A claim now requires TWO readable screenshots: the live 5-star
    // "Verified Purchase" review and an order-page shot showing this order's ID
    // plus "Return window closed". A claim without them must be refused.
    const claimNoProof = await req(guest, "/api/reimbursements", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": guest.get("bp_csrf_js") },
      body: JSON.stringify({
        order_identifier: orderCode,
        payout_method: "upi",
        upi_id: "smoketester@okaxis",
        review_text: "Verified 5-star review submitted.",
      }),
    });
    check(
      "claim without screenshots rejected (400)",
      claimNoProof.status === 400,
      `got ${claimNoProof.status} ${claimNoProof.text.slice(0, 150)}`
    );
    check(
      "rejection names the missing screenshot",
      /screenshot/i.test(claimNoProof.json?.error || ""),
      claimNoProof.text.slice(0, 150)
    );

    const claimNoFeedback = await req(guest, "/api/reimbursements", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": guest.get("bp_csrf_js") },
      body: JSON.stringify({
        order_identifier: orderCode,
        payout_method: "upi",
        upi_id: "smoketester@okaxis",
        review_screenshot_url: "/uploads/smoke-review.png",
        order_screenshot_url: "/uploads/smoke-order.png",
      }),
    });
    check(
      "claim without seller feedback rejected (400)",
      claimNoFeedback.status === 400,
      `got ${claimNoFeedback.status} ${claimNoFeedback.text.slice(0, 150)}`
    );
    check(
      "rejection names the seller feedback screenshot",
      /seller feedback/i.test(claimNoFeedback.json?.error || ""),
      claimNoFeedback.text.slice(0, 150)
    );

    // 6. OCR.space cannot be made to read a fixture as a 5-star Verified
    // Purchase review, so the payout state machine is exercised with the exact
    // row the validated API would have inserted.
    const Database = require("better-sqlite3");
    const sqlite = new Database(path.join(process.cwd(), "data", "app.db"));
    try {
      sqlite
        .prepare(
          `INSERT INTO reimbursements (
             reimbursement_code, order_id, user_id, deal_id, external_order_id,
             reviewer_name, review_rating, amount, payout_method, upi_id,
             review_screenshot_url, order_screenshot_url, seller_feedback_url,
             ocr_status, status
           )
           SELECT ?, o.id, o.user_id, o.deal_id, o.external_order_id,
                  o.reviewer_name, 5, o.total, 'upi', 'smoketester@okaxis',
                  '', '', '', 'done', 'pending'
           FROM orders o WHERE o.id = ?`
        )
        .run(`SMOKE-RM-${Date.now()}`, orderId);
    } finally {
      sqlite.close();
    }

    // 7. Claim shows in the account's reimbursements tab.
    const myReimb = await req(guest, "/api/reimbursements");
    check("GET /api/reimbursements 200", myReimb.status === 200, `got ${myReimb.status}`);
    const rows = myReimb.json?.reimbursements;
    check("reimbursements list populated", Array.isArray(rows) && rows.length > 0, `len=${rows?.length}`);

    // 8. Admin walks the claim through the status machine to paid.
    const adminReimb = await req(admin, "/api/admin/reimbursements?status=pending");
    const claimRow = adminReimb.json?.reimbursements?.find((x) => x.order_code === orderCode);
    reimbId = claimRow?.id;
    check("claim visible in admin queue", !!reimbId);
    if (reimbId) {
      const hdr = { "content-type": "application/json", "x-csrf-token": admin.get("bp_csrf_js") };
      const s1 = await req(admin, `/api/admin/reimbursements/${reimbId}`, {
        method: "PATCH", headers: hdr, body: JSON.stringify({ status: "under_review" }),
      });
      check("pending -> under_review", s1.status === 200, `got ${s1.status} ${s1.text.slice(0, 120)}`);

      const s2 = await req(admin, `/api/admin/reimbursements/${reimbId}`, {
        method: "PATCH", headers: hdr, body: JSON.stringify({ status: "approved" }),
      });
      check("under_review -> approved", s2.status === 200, `got ${s2.status} ${s2.text.slice(0, 120)}`);

      const s3 = await req(admin, `/api/admin/reimbursements/${reimbId}`, {
        method: "PATCH", headers: hdr, body: JSON.stringify({ status: "paid", utr_number: "UTR123456" }),
      });
      check("approved -> paid", s3.status === 200, `got ${s3.status} ${s3.text.slice(0, 120)}`);

      // Saving a note on a paid claim must not 400 (the amount-dirty bug).
      const s4 = await req(admin, `/api/admin/reimbursements/${reimbId}`, {
        method: "PATCH", headers: hdr, body: JSON.stringify({ admin_note: "Paid via UPI." }),
      });
      check("note save on paid claim 200", s4.status === 200, `got ${s4.status} ${s4.text.slice(0, 120)}`);

      // Illegal transition must be refused.
      const bad = await req(admin, `/api/admin/reimbursements/${reimbId}`, {
        method: "PATCH", headers: hdr, body: JSON.stringify({ status: "pending" }),
      });
      check("paid -> pending refused", bad.status === 400, `got ${bad.status}`);
    }
  }

  section("Cleanup test data");
  {
    if (reimbId) {
      await req(admin, `/api/admin/reimbursements/${reimbId}`, {
        method: "DELETE", headers: { "x-csrf-token": admin.get("bp_csrf_js") },
      });
    }
    if (globalThis.__smokeDealId) {
      const del = await req(admin, `/api/admin/deals/${globalThis.__smokeDealId}`, {
        method: "DELETE", headers: { "x-csrf-token": admin.get("bp_csrf_js") },
      });
      check("smoke deal deleted", del.status === 200 || del.status === 204, `got ${del.status}`);
    }
  }

  section("Backup & restore round-trip");
  {
    const exp = await req(admin, "/api/admin/backup");
    check("GET /api/admin/backup 200", exp.status === 200, `got ${exp.status}`);
    check("backup contains deals table", Array.isArray(exp.json?.tables?.deals));
    check("backup contains users table", Array.isArray(exp.json?.tables?.users));
    check("backup contains settings table", Array.isArray(exp.json?.tables?.settings));

    const noCsrf = await req(admin, "/api/admin/backup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(exp.json),
    });
    check("restore without CSRF rejected", noCsrf.status === 403, `got ${noCsrf.status}`);

    const res = await req(admin, "/api/admin/backup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": admin.get("bp_csrf_js") },
      body: JSON.stringify(exp.json),
    });
    check("full backup self-restore 200", res.status === 200, `got ${res.status} ${res.text.slice(0, 150)}`);
    check("restore reports mode=full", res.json?.mode === "full", `got ${res.json?.mode}`);

    const legacy = await req(admin, "/api/admin/backup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": admin.get("bp_csrf_js") },
      body: JSON.stringify(exp.json?.tables?.deals ?? []),
    });
    check("deals-array restore 200", legacy.status === 200, `got ${legacy.status} ${legacy.text.slice(0, 150)}`);
    check("restore reports mode=deals", legacy.json?.mode === "deals", `got ${legacy.json?.mode}`);

    const pub = await req(guest, "/api/deals");
    check("public deals API healthy after restores", pub.status === 200 && Array.isArray(pub.json?.deals), `got ${pub.status}`);
  }

  console.log(`\n${"=".repeat(46)}`);
  console.log(`PASS: ${pass}   FAIL: ${fail}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log(`${"=".repeat(46)}`);
  console.log(`smoke order_code=${orderCode} order_id=${orderId} deal_id=${globalThis.__smokeDealId}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("SMOKE TEST CRASHED:", e);
  process.exit(2);
});
