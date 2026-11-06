// Mediator flow smoke test. Usage: node scripts/smoke-mediator.js
const BASE = process.env.SMOKE_BASE || "http://localhost:3000";
const fs = require("fs");
const path = require("path");

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
    /* no .env file */
  }
}
loadDotEnv();

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@brandpromotion.in").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe@123";
const MEDIATOR_EMAIL = `smoke_mediator_${Date.now()}@example.com`;
const MEDIATOR_PASSWORD = "MediatorPass123";

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
      if (v === "") this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  get(name) {
    return this.cookies.get(name) || "";
  }
}

async function req(jar, p, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (jar.header()) headers.cookie = jar.header();
  const res = await fetch(`${BASE}${p}`, { ...opts, headers, redirect: "manual" });
  jar.absorb(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, text, json };
}

async function login(jar, email, password) {
  await req(jar, "/api/csrf");
  return req(jar, "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": jar.get("bp_csrf_js") },
    body: JSON.stringify({ email, password }),
  });
}

function dealForm(overrides = {}) {
  const fd = new FormData();
  const fields = {
    title: "Mediator Smoke Campaign",
    description: "temporary",
    category: "General",
    platform: "Amazon",
    deal_type: "Review Deal",
    deal_url: "https://example.com/product",
    price_original: "999",
    price_sale: "599",
    refund_amount: "599",
    review_amount: "100",
    total_slots: "5",
    stock: "5",
    mediator_commission_amount: "123.45",
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, String(v));
  return fd;
}

async function main() {
  const admin = new Jar();
  const a = await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  check("admin login", a.status === 200, `${a.status} ${a.text.slice(0, 120)}`);

  const guest = new Jar();
  await req(guest, "/api/csrf");
  const signup = await req(guest, "/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": guest.get("bp_csrf_js") },
    body: JSON.stringify({
      name: "Smoke Mediator",
      email: MEDIATOR_EMAIL,
      phone: "9876543210",
      password: MEDIATOR_PASSWORD,
    }),
  });
  check("mediator signup", signup.status === 200, `${signup.status} ${signup.text.slice(0, 120)}`);
  const userId = signup.json?.user?.id;

  const promoteRes = await req(admin, `/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "x-csrf-token": admin.get("bp_csrf_js") },
    body: (() => {
      const fd = new FormData();
      fd.set("role", "mediator");
      return fd;
    })(),
  });
  check("admin promotes user to mediator", promoteRes.status === 200, `${promoteRes.status} ${promoteRes.text.slice(0, 160)}`);
  check("mediator code assigned", !!promoteRes.json?.user?.mediator_code, promoteRes.text.slice(0, 120));

  const mediator = new Jar();
  const m = await login(mediator, MEDIATOR_EMAIL, MEDIATOR_PASSWORD);
  check("mediator login carries mediator role", m.json?.user?.role === "mediator", m.text.slice(0, 120));

  const dash = await req(mediator, "/mediator");
  check("mediator dashboard renders", dash.status === 200, `got ${dash.status}`);
  const noDash = await req(guest, "/mediator");
  check("guest blocked from mediator dashboard", noDash.status >= 300 && noDash.status < 400, `got ${noDash.status}`);

  await req(mediator, "/api/csrf");
  const create = await req(mediator, "/api/mediator/deals", {
    method: "POST",
    headers: { "x-csrf-token": mediator.get("bp_csrf_js") },
    body: dealForm(),
  });
  check("mediator submits campaign", create.status === 200, `${create.status} ${create.text.slice(0, 160)}`);
  const dealId = create.json?.id;
  check("submitted campaign is pending", create.json?.approval_status === "pending", create.text.slice(0, 120));

  const hiddenApi = await req(guest, `/api/deals/${dealId}`);
  check("pending campaign hidden from public API", hiddenApi.status === 404, `got ${hiddenApi.status}`);
  const hiddenPage = await req(guest, `/deal/${dealId}`);
  check("pending campaign hidden from deal page", hiddenPage.status === 404, `got ${hiddenPage.status}`);

  const mine = await req(mediator, "/api/mediator/deals");
  check("mediator sees own campaign", (mine.json?.deals || []).some((d) => d.id === dealId), mine.text.slice(0, 160));
  check("proposed commission stored", (mine.json?.deals || []).find((d) => d.id === dealId)?.mediator_commission_amount === 123.45);

  const adminList = await req(admin, "/api/admin/deals");
  const pendingRow = (adminList.json?.deals || []).find((d) => d.id === dealId);
  check("admin sees pending campaign with submitter", pendingRow?.approval_status === "pending" && !!pendingRow?.submitted_by_name, adminList.text.slice(0, 160));

  const approveFd = new FormData();
  approveFd.set("action", "approve");
  approveFd.set("mediator_commission_amount", "200.50");
  const approve = await req(admin, `/api/admin/deals/${dealId}/approval`, {
    method: "POST",
    headers: { "x-csrf-token": admin.get("bp_csrf_js") },
    body: approveFd,
  });
  check("admin approves campaign", approve.status === 200 && approve.json?.approval_status === "approved", `${approve.status} ${approve.text.slice(0, 160)}`);

  const liveApi = await req(guest, `/api/deals/${dealId}`);
  check("approved campaign appears publicly", liveApi.status === 200, `got ${liveApi.status}`);
  const mineAfter = await req(mediator, "/api/mediator/deals");
  const approvedRow = (mineAfter.json?.deals || []).find((d) => d.id === dealId);
  check("confirmed commission visible to mediator", approvedRow?.mediator_commission_amount === 200.5, JSON.stringify(approvedRow?.mediator_commission_amount));

  const second = await req(mediator, "/api/mediator/deals", {
    method: "POST",
    headers: { "x-csrf-token": mediator.get("bp_csrf_js") },
    body: dealForm({ title: "Mediator Rejected Campaign", mediator_commission_amount: "50" }),
  });
  const secondId = second.json?.id;
  check("second campaign submitted", second.status === 200, second.text.slice(0, 120));
  const rejectFd = new FormData();
  rejectFd.set("action", "reject");
  rejectFd.set("reason", "Price is wrong");
  const reject = await req(admin, `/api/admin/deals/${secondId}/approval`, {
    method: "POST",
    headers: { "x-csrf-token": admin.get("bp_csrf_js") },
    body: rejectFd,
  });
  check("admin rejects campaign with reason", reject.status === 200, `${reject.status} ${reject.text.slice(0, 160)}`);
  const mineRejected = await req(mediator, "/api/mediator/deals");
  const rejectedRow = (mineRejected.json?.deals || []).find((d) => d.id === secondId);
  check("mediator sees rejection reason", rejectedRow?.rejection_reason === "Price is wrong", mineRejected.text.slice(0, 160));

  const withdraw = await req(mediator, `/api/mediator/deals/${secondId}`, {
    method: "DELETE",
    headers: { "x-csrf-token": mediator.get("bp_csrf_js") },
  });
  check("mediator withdraws rejected campaign", withdraw.status === 200, `${withdraw.status} ${withdraw.text.slice(0, 120)}`);

  const suspendFd = new FormData();
  suspendFd.set("mediator_status", "suspended");
  const suspend = await req(admin, `/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "x-csrf-token": admin.get("bp_csrf_js") },
    body: suspendFd,
  });
  check("admin suspends mediator", suspend.status === 200, `${suspend.status} ${suspend.text.slice(0, 120)}`);
  const blocked = await req(mediator, "/api/mediator/deals", {
    method: "POST",
    headers: { "x-csrf-token": mediator.get("bp_csrf_js") },
    body: dealForm({ title: "Suspended Campaign" }),
  });
  check("suspended mediator cannot submit", blocked.status === 403, `got ${blocked.status} ${blocked.text.slice(0, 120)}`);

  const del = await req(admin, `/api/admin/deals/${dealId}`, {
    method: "DELETE",
    headers: { "x-csrf-token": admin.get("bp_csrf_js") },
  });
  check("cleanup approved campaign", del.status === 200, `got ${del.status}`);

  console.log("\n==============================================");
  console.log(`PASS: ${pass}   FAIL: ${fail}`);
  if (fail) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log("==============================================");
  console.log(`smoke mediator user=${MEDIATOR_EMAIL} id=${userId} deal_id=${dealId}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
