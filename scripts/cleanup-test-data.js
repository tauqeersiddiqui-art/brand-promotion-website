// Removes rows created by scripts/smoke-test.js. Safe to re-run.
const path = require("path");
const D = require("better-sqlite3");
const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
const db = new D(
  path.resolve(process.env.DATABASE_PATH || path.join(dataDir, "app.db"))
);
db.pragma("foreign_keys = ON");

const removed = {};
const run = db.transaction(() => {
  const claims = db.prepare("SELECT id FROM reimbursements WHERE upi_id = 'smoketester@okaxis'").all();
  removed.reimbursements = claims.length;
  for (const c of claims) db.prepare("DELETE FROM reimbursements WHERE id = ?").run(c.id);

  const mediatorDeals = db
    .prepare(
      "SELECT id FROM deals WHERE submitted_by IN (SELECT id FROM users WHERE email LIKE 'smoke_mediator_%@example.com')"
    )
    .all();
  removed.mediator_deals = mediatorDeals.length;
  for (const d of mediatorDeals) db.prepare("DELETE FROM deals WHERE id = ?").run(d.id);

  const users = db.prepare("SELECT id FROM users WHERE email LIKE 'smoke_%@example.com'").all();
  removed.users = users.length;
  for (const u of users) db.prepare("DELETE FROM users WHERE id = ?").run(u.id);

  const reviews = db.prepare("SELECT id FROM reviews WHERE text = 'Great product, fast delivery.'").all();
  removed.reviews = reviews.length;
  for (const r of reviews) db.prepare("DELETE FROM reviews WHERE id = ?").run(r.id);

  const orders = db.prepare("SELECT id FROM orders WHERE external_order_id LIKE 'SMOKE-%' OR external_order_id LIKE 'TEST-RT-%'").all();
  removed.orders = orders.length;
  for (const o of orders) db.prepare("DELETE FROM orders WHERE id = ?").run(o.id);

  const deals = db.prepare("SELECT id FROM deals WHERE title LIKE 'Smoke Test Deal%'").all();
  removed.deals = deals.length;
  for (const d of deals) db.prepare("DELETE FROM deals WHERE id = ?").run(d.id);

  const up = db.prepare("SELECT COUNT(*) c FROM uploads").get().c;
  if (up > 0) {
    db.prepare("DELETE FROM uploads").run();
    removed.uploads = up;
  }
});
run();

console.log("removed:", JSON.stringify(removed));
console.log("remaining:", JSON.stringify({
  users: db.prepare("SELECT COUNT(*) c FROM users").get().c,
  deals: db.prepare("SELECT COUNT(*) c FROM deals").get().c,
  orders: db.prepare("SELECT COUNT(*) c FROM orders").get().c,
  reviews: db.prepare("SELECT COUNT(*) c FROM reviews").get().c,
  reimbursements: db.prepare("SELECT COUNT(*) c FROM reimbursements").get().c,
}));
console.log("integrity:", db.pragma("integrity_check")[0].integrity_check);
console.log("fk_check:", db.pragma("foreign_key_check").length === 0 ? "clean" : "ISSUES");
