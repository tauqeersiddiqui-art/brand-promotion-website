"use client";

import { useEffect, useState } from "react";
import { calculateRefund, parseDealTypePercentage } from "@/lib/refund";

function getCsrfHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const cookies = document.cookie.split("; ").reduce((acc, c) => {
    const [k, ...v] = c.split("=");
    acc[k] = v.join("=");
    return acc;
  }, {} as Record<string, string>);
  const token = cookies["bp_csrf_js"];
  return token ? { "x-csrf-token": token } : {};
}

type Deal = {
  id: number;
  product_code: string;
  title: string;
  description: string;
  category: string;
  platform: string;
  deal_type: string;
  image_url: string;
  deal_url: string;
  target_keyword: string;
  instructions: string;
  coupon_code: string;
  price_original: number;
  price_sale: number;
  refund_amount: number;
  review_amount: number;
  rating_amount: number;
  only_order_amount: number;
  order_form_url: string;
  refund_form_url: string;
  total_slots: number;
  claimed_slots: number;
  stock: number;
  featured: number;
  active: number;
  order_count: number;
  submitted_by: number | null;
  submitted_by_name: string | null;
  approval_status: "pending" | "approved" | "rejected";
  rejection_reason: string;
  mediator_commission_amount: number;
};

const EMPTY = {
  id: 0,
  product_code: "",
  title: "",
  description: "",
  category: "Electronics",
  platform: "Amazon",
  deal_type: "100% Refund",
  image_url: "",
  deal_url: "",
  target_keyword: "",
  instructions: "1. Search keyword on Amazon/Flipkart.\n2. Submit Order & Price screenshot.\n3. Post 5★ review upon delivery.\n4. Submit claim for 100% UPI refund.",
  coupon_code: "",
  price_original: "",
  price_sale: "",
  refund_amount: "",
  review_amount: "",
  rating_amount: "",
  only_order_amount: "",
  order_form_url: "",
  refund_form_url: "",
  total_slots: "50",
  claimed_slots: "0",
  stock: "50",
  featured: false,
  active: true,
  mediator_commission_amount: "",
};

const PLATFORMS = ["Amazon", "Flipkart", "Myntra", "Brand Store", "Meesho", "Nykaa"];
const DEAL_TYPES = [
  "100% Refund", "90% Refund", "80% Refund", "70% Refund", "60% Refund",
  "50% Refund", "40% Refund", "30% Refund", "20% Refund", "10% Refund",
  "Review Incentive", "Flat Refund", "Review Deal", "Rating Deal", "Only Order Deal"
];
const CATEGORIES = ["Electronics", "Footwear", "Fashion", "Beauty & Care", "Home & Kitchen", "Fitness & Sports", "Health & Wellness", "General"];

type BulkImportResult = {
  created: {
    id: number;
    product_code: string;
    title: string;
    platform: string;
    category: string;
    price_sale: number;
    partial: boolean;
  }[];
  skipped: { url: string; reason: string }[];
  failed: { url: string; error: string }[];
  summary: { total: number; created: number; skipped: number; failed: number };
  error?: string;
};

export default function AdminDealsPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err" | "warn"; text: string } | null>(null);
  const [filterPlatform, setFilterPlatform] = useState("All");
  const [bulkLinks, setBulkLinks] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);
  const refundPercentage = parseDealTypePercentage(form.deal_type);
  const refundIsAuto = refundPercentage > 0;

  async function load() {
    try {
      const r = await fetch("/api/admin/deals");
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setDeals([]);
        setMsg({ type: "err", text: d.error || `Failed to load campaigns (${r.status}).` });
        return;
      }
      const d = await r.json();
      setDeals(d.deals ?? []);
    } catch {
      setDeals([]);
      setMsg({ type: "err", text: "Network error while loading campaigns." });
    }
  }

  // Ensure CSRF cookie is set on mount
  useEffect(() => {
    fetch("/api/csrf").catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, []);

  function set(k: keyof typeof EMPTY, v: unknown) {
    setForm((f) => {
      const updated = { ...f, [k]: v };
      // Auto-calculate refund when deal_type or price_sale changes
      const dealType = k === "deal_type" ? String(v) : f.deal_type;
      const salePrice = k === "price_sale" ? Number(v) : Number(f.price_sale || 0);
      const percentage = parseDealTypePercentage(dealType);

      if (k === "deal_type" || k === "price_sale") {
        const calculated = calculateRefund(dealType, salePrice);
        if (calculated !== null) {
          updated.refund_amount = String(calculated);
        } else if (percentage > 0) {
          updated.refund_amount = "";
        }
      }
      // Backward compat: if deal_type is not percentage-based, keep existing logic
      if (k === "price_sale" && percentage === 0 && (!f.refund_amount || f.refund_amount === f.price_sale)) {
        updated.refund_amount = String(v);
      }
      return updated;
    });
  }

  function startEdit(d: Deal) {
    setEditing(true);
    const calculatedRefund = calculateRefund(d.deal_type, Number(d.price_sale || 0));
    setForm({
      id: d.id,
      product_code: d.product_code || "",
      title: d.title,
      description: d.description || "",
      category: d.category || "General",
      platform: d.platform || "Amazon",
      deal_type: d.deal_type || "100% Refund",
      image_url: d.image_url || "",
      deal_url: d.deal_url || "",
      target_keyword: d.target_keyword || "",
      instructions: d.instructions || "",
      coupon_code: d.coupon_code || "",
      price_original: String(d.price_original || ""),
      price_sale: String(d.price_sale || ""),
      refund_amount: String(calculatedRefund ?? d.refund_amount ?? d.price_sale ?? ""),
      review_amount: String(d.review_amount || ""),
      rating_amount: String(d.rating_amount || ""),
      only_order_amount: String(d.only_order_amount || ""),
      order_form_url: d.order_form_url || "",
      refund_form_url: d.refund_form_url || "",
      total_slots: String(d.total_slots || 50),
      claimed_slots: String(d.claimed_slots || 0),
      stock: String(d.stock || 50),
      featured: d.featured === 1,
      active: d.active === 1,
      mediator_commission_amount: String(d.mediator_commission_amount || ""),
    });
    setFile(null);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditing(false);
    setForm(EMPTY);
    setFile(null);
    setMsg(null);
  }

  async function fetchProductFromUrl() {
    if (!form.deal_url) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/products/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ url: form.deal_url }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg({ type: "err", text: d.error || "Failed to fetch product." });
        return;
      }
      // The fetch endpoint does not return `deal_type`, so this used to throw on
      // `undefined.match(...)` and the whole auto-fill was reported as a
      // network error. Fall back to the deal type currently in the form.
      const salePrice = Number(d.priceSale || 0);
      const resolvedDealType = d.deal_type || form.deal_type;
      const percentage = parseDealTypePercentage(resolvedDealType);
      const calculatedRef = percentage > 0 ? Math.round(salePrice * percentage / 100) : salePrice;

      setForm((f) => ({
        ...f,
        platform: d.platform,
        title: d.title || f.title,
        category: d.category || f.category,
        price_original: d.priceOriginal ? String(d.priceOriginal) : f.price_original,
        price_sale: d.priceSale ? String(d.priceSale) : f.price_sale,
        refund_amount: salePrice > 0 ? String(calculatedRef) : f.refund_amount,
        deal_type: resolvedDealType,
        image_url: d.imageUrl || f.image_url,
        target_keyword: d.targetKeyword || f.target_keyword,
        description: d.description || f.description,
        // Keep the deal_url (don't clear it)
        deal_url: f.deal_url,
      }));
      if (d.partial) {
        setMsg({
          type: "warn",
          text: d.note || "Only the product title could be fetched. Please fill the price and image manually.",
        });
      } else {
        setMsg({ type: "ok", text: "Product details fetched! ✅ Review and adjust if needed." });
      }
    } catch {
      setMsg({ type: "err", text: "Network error fetching product." });
    } finally {
      setBusy(false);
    }
  }

  async function importBulkLinks() {
    const links = bulkLinks
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (links.length === 0) {
      setMsg({ type: "err", text: "Paste at least one Amazon or Flipkart product link." });
      return;
    }
    setBulkBusy(true);
    setBulkResult(null);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/deals/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ urls: links }),
      });
      const d = (await r.json().catch(() => ({}))) as BulkImportResult;
      if (!r.ok) {
        setMsg({ type: "err", text: d.error || "Bulk import failed." });
        return;
      }
      setBulkResult(d);
      setBulkLinks("");
      if (d.created.length > 0) {
        setMsg({
          type: d.failed.length > 0 || d.skipped.length > 0 ? "warn" : "ok",
          text: `Imported ${d.created.length} campaign(s) as pending. Check the price, category and image, then click Approve to publish. Campaigns with ₹0 need a price before saving.`,
        });
        load();
      } else {
        setMsg({ type: "err", text: "No campaigns were imported. See the reasons below." });
      }
    } catch {
      setMsg({ type: "err", text: "Network error while importing the links." });
    } finally {
      setBulkBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("product_code", form.product_code);
      fd.set("title", form.title);
      fd.set("description", form.description);
      fd.set("category", form.category);
      fd.set("platform", form.platform);
      fd.set("deal_type", form.deal_type);
      fd.set("deal_url", form.deal_url);
      fd.set("target_keyword", form.target_keyword);
      fd.set("instructions", form.instructions);
      fd.set("coupon_code", form.coupon_code);
      fd.set("price_original", form.price_original || "0");
      fd.set("price_sale", form.price_sale);
      fd.set("refund_amount", form.refund_amount || form.price_sale);
      fd.set("review_amount", form.review_amount || "0");
      fd.set("rating_amount", form.rating_amount || "0");
      fd.set("only_order_amount", form.only_order_amount || "0");
      fd.set("order_form_url", form.order_form_url);
      fd.set("refund_form_url", form.refund_form_url);
      fd.set("total_slots", form.total_slots || "50");
      fd.set("claimed_slots", form.claimed_slots || "0");
      fd.set("stock", form.stock || "50");
      fd.set("featured", form.featured ? "true" : "false");
      fd.set("active", form.active ? "true" : "false");
      fd.set("mediator_commission_amount", form.mediator_commission_amount || "0");
      if (form.image_url) fd.set("image_url", form.image_url);
      if (file) fd.set("image", file);

      const url = editing ? `/api/admin/deals/${form.id}` : "/api/admin/deals";
      const r = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: getCsrfHeader(),
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg({ type: "err", text: d.error || "Save failed." });
      } else {
        const tg = typeof d.telegram === "string" ? d.telegram : "";
        const tgNote =
          tg === "sent"
            ? " Posted to Telegram ✅"
            : tg.startsWith("failed")
              ? ` (Telegram post failed: ${tg.replace(/^failed:\s*/, "")})`
              : "";
        setMsg({
          type: "ok",
          text:
            (editing
              ? "Campaign deal updated ✅"
              : `Campaign deal created (${d.product_code || "New"}) ✅`) + tgNote,
        });
        reset();
        load();
      }
    } catch {
      setMsg({ type: "err", text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: Deal) {
    if (!confirm(`Delete campaign "${d.title}" (${d.product_code})? All associated orders and claims will be affected.`)) return;
    const r = await fetch(`/api/admin/deals/${d.id}`, { method: "DELETE", headers: getCsrfHeader() });
    if (r.ok) {
      setMsg({ type: "ok", text: "Campaign deal deleted." });
      load();
    }
  }

  async function approveDeal(d: Deal) {
    const proposed = window.prompt(
      `Fixed mediator commission for "${d.title}" (₹)`,
      String(d.mediator_commission_amount || 0)
    );
    if (proposed === null) return;
    const fd = new FormData();
    fd.set("action", "approve");
    fd.set("mediator_commission_amount", proposed || "0");
    const r = await fetch(`/api/admin/deals/${d.id}/approval`, {
      method: "POST",
      headers: getCsrfHeader(),
      body: fd,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg({ type: "err", text: j.error || "Approval failed." });
      return;
    }
    setMsg({
      type: "ok",
      text:
        `Campaign approved with ₹${Number(j.mediator_commission_amount || 0).toLocaleString("en-IN")} fixed commission.` +
        (j.telegram === "sent" ? " Posted to Telegram." : ""),
    });
    load();
  }

  async function rejectDeal(d: Deal) {
    const reason = window.prompt(`Reason for rejecting "${d.title}"`);
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setMsg({ type: "err", text: "Please give a rejection reason." });
      return;
    }
    const fd = new FormData();
    fd.set("action", "reject");
    fd.set("reason", reason.trim());
    const r = await fetch(`/api/admin/deals/${d.id}/approval`, {
      method: "POST",
      headers: getCsrfHeader(),
      body: fd,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg({ type: "err", text: j.error || "Rejection failed." });
      return;
    }
    setMsg({ type: "ok", text: "Campaign rejected. The mediator can see the reason." });
    load();
  }

  async function toggleActive(d: Deal) {
    const fd = new FormData();
    fd.set("active", d.active === 1 ? "false" : "true");
    const r = await fetch(`/api/admin/deals/${d.id}`, { method: "PATCH", headers: getCsrfHeader(), body: fd });
    if (r.ok) load();
  }

  async function postTelegram(d: Deal) {
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/deals/${d.id}/telegram`, {
        method: "POST",
        headers: getCsrfHeader(),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ type: "err", text: j.error || `Telegram post failed (${r.status}).` });
      } else {
        setMsg({ type: "ok", text: `Posted "${d.title}" to the Telegram channel ✅` });
      }
    } catch {
      setMsg({ type: "err", text: "Network error posting to Telegram." });
    }
  }

  const filteredDeals = deals?.filter((d) =>
    filterPlatform === "All" ? true : (d.platform || "").toLowerCase() === filterPlatform.toLowerCase()
  );

  return (
    <div className="container" style={{ paddingTop: 10, paddingBottom: 60 }}>
      <div className="admin-head">
        <div>
          <h1>Brand deals &amp; campaign manager</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Create and manage influencer promotion campaigns across Amazon, Flipkart, Myntra, and Brand Stores.
          </p>
        </div>
        <span className="muted">{deals?.length ?? "…"} total campaigns</span>
      </div>

      {msg && (
        <div className={`alert ${msg.type === "ok" ? "alert-success" : msg.type === "warn" ? "alert-warn" : "alert-error"}`}>
          {msg.text}
        </div>
      )}

      <details className="card mb" style={{ padding: 28 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 17 }}>
          Bulk import from product links
        </summary>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Paste up to 20 Amazon or Flipkart product links, one per line. Each campaign is created as{" "}
          <strong>pending</strong> with its title, price, image and category filled automatically.
          Edit anything you need, then approve it to make it live. Nothing is posted to Telegram during import.
        </p>
        <textarea
          className="input"
          rows={5}
          value={bulkLinks}
          onChange={(e) => setBulkLinks(e.target.value)}
          placeholder={"https://www.amazon.in/dp/B0XXXXXXXX\nhttps://www.flipkart.com/product-name/p/ITMXXXXXXXX"}
          style={{ fontFamily: "monospace", fontSize: 12.5 }}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={importBulkLinks} disabled={bulkBusy}>
            {bulkBusy ? "Fetching and importing…" : "Import links"}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            {bulkLinks.split(/\r?\n/).filter((l) => l.trim()).length} link(s)
          </span>
        </div>

        {bulkResult && (
          <div style={{ marginTop: 14 }}>
            <div className="alert alert-success" style={{ marginBottom: 10 }}>
              Created {bulkResult.summary.created} · Skipped {bulkResult.summary.skipped} · Failed{" "}
              {bulkResult.summary.failed}
            </div>
            {bulkResult.created.length > 0 && (
              <ul className="muted" style={{ fontSize: 12.5, margin: "0 0 10px", paddingLeft: 18 }}>
                {bulkResult.created.map((d) => (
                  <li key={d.id}>
                    <strong>{d.title}</strong> — {d.platform} · {d.category}
                    {d.price_sale > 0 ? ` · ₹${d.price_sale.toLocaleString("en-IN")}` : " · price needed"}
                  </li>
                ))}
              </ul>
            )}
            {(bulkResult.failed.length > 0 || bulkResult.skipped.length > 0) && (
              <ul className="muted" style={{ fontSize: 12.5, margin: 0, paddingLeft: 18 }}>
                {bulkResult.skipped.map((s, i) => (
                  <li key={`s${i}`}>Skipped {s.url}: {s.reason}</li>
                ))}
                {bulkResult.failed.map((f, i) => (
                  <li key={`f${i}`}>Failed {f.url}: {f.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </details>

      {/* Campaign Deal Form */}
      <div className="card mb" style={{ padding: 28 }}>
        <h3 style={{ marginTop: 0, fontSize: 18 }}>
          {editing ? `Edit campaign deal #${form.id} (${form.product_code || "No code"})` : "Create new campaign"}
        </h3>
        <form onSubmit={submit} className="form-grid">
          <div>
            <label className="form-label">Campaign / Product Code (e.g. SF-P001)</label>
            <input
              className="input"
              value={form.product_code}
              onChange={(e) => set("product_code", e.target.value.toUpperCase())}
              placeholder="Leave blank to auto-generate (e.g. SF-P015)"
            />
          </div>

          <div>
            <label className="form-label">E-Commerce Platform *</label>
            <select
              className="input"
              value={form.platform}
              onChange={(e) => set("platform", e.target.value)}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="full">
            <label className="form-label">Campaign Deal Title *</label>
            <input
              className="input"
              required
              minLength={3}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Noise Cancelling Bluetooth Earbuds — 100% UPI Refund"
            />
          </div>

          <div>
            <label className="form-label">Category</label>
            <select
              className="input"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Deal Promotion Type</label>
            <select
              className="input"
              value={form.deal_type}
              onChange={(e) => set("deal_type", e.target.value)}
            >
              {DEAL_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Original MRP Price (₹)</label>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={form.price_original}
              onChange={(e) => set("price_original", e.target.value)}
              placeholder="4999"
            />
          </div>

          <div>
            <label className="form-label">Purchase Price on Store (₹) *</label>
            <input
              className="input"
              type="number"
              required
              min={1}
              step="0.01"
              value={form.price_sale}
              onChange={(e) => set("price_sale", e.target.value)}
              placeholder="1999"
            />
          </div>

          <div>
            <label className="form-label">
              Refund Amount (₹) *
              {refundIsAuto && (
                <span className="badge badge-refund" style={{ marginLeft: 8, fontSize: 10 }}>
                  Auto {refundPercentage}%
                </span>
              )}
            </label>
            <input
              className="input"
              type="number"
              required={!refundIsAuto}
              min={0}
              step="0.01"
              value={form.refund_amount}
              onChange={(e) => set("refund_amount", e.target.value)}
              placeholder="1999"
              disabled={refundIsAuto}
            />
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {refundIsAuto
                ? `Calculated automatically from ${refundPercentage}% of the purchase price.`
                : "Fixed reimbursement amount. Choose a percentage deal type to auto-calculate it."}
            </p>
            {refundIsAuto && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 6 }}
                onClick={() => set("deal_type", "Flat Refund")}
              >
                Enter a custom amount instead
              </button>
            )}
          </div>

          <div>
            <label className="form-label">Mediator commission (fixed ₹)</label>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={form.mediator_commission_amount}
              onChange={(e) => set("mediator_commission_amount", e.target.value)}
              placeholder="e.g. 150"
            />
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Fixed amount paid to the mediator for this campaign. Not a percentage.
            </p>
          </div>

          <div className="full">
            <label className="form-label">Payout per deal type (₹) — optional</label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <label className="form-label" style={{ fontWeight: 500, fontSize: 12 }}>Review deal (5★ + text)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.review_amount}
                  onChange={(e) => set("review_amount", e.target.value)}
                  placeholder="99"
                />
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 500, fontSize: 12 }}>Rating deal (5★ only)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.rating_amount}
                  onChange={(e) => set("rating_amount", e.target.value)}
                  placeholder="149"
                />
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 500, fontSize: 12 }}>Only order deal</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.only_order_amount}
                  onChange={(e) => set("only_order_amount", e.target.value)}
                  placeholder="249"
                />
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              These are shown separately on the public deal page. Leave 0/blank when a type is not offered.
            </p>
          </div>

          <div>
            <label className="form-label">Total Reviewer Slots</label>
            <input
              className="input"
              type="number"
              min={1}
              value={form.total_slots}
              onChange={(e) => set("total_slots", e.target.value)}
              placeholder="50"
            />
          </div>

          <div>
            <label className="form-label">Claimed Slots Count</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.claimed_slots}
              onChange={(e) => set("claimed_slots", e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <label className="form-label">Available Stock / Inventory</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.stock}
              onChange={(e) => set("stock", e.target.value)}
              placeholder="50"
            />
          </div>

          <div className="full">
            <label className="form-label">Target Search Keyword on Platform (Recommended for organic boost)</label>
            <input
              className="input"
              value={form.target_keyword}
              onChange={(e) => set("target_keyword", e.target.value)}
              placeholder="e.g. true wireless gaming earbuds with low latency"
            />
          </div>

          <div className="full">
            <label className="form-label">Direct Marketplace Listing URL (Optional fallback)</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                className="input"
                type="url"
                style={{ flex: 1, minWidth: 280 }}
                value={form.deal_url}
                onChange={(e) => set("deal_url", e.target.value)}
                placeholder="https://www.amazon.in/dp/B0XXXXXXXX"
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={fetchProductFromUrl}
                disabled={busy || !form.deal_url}
                style={{ alignSelf: "flex-end", height: 44 }}
              >
                Fetch details
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Paste Amazon/Flipkart product URL (short share links work too) and click "Fetch details" to auto-fill title,
              price, image &amp; keywords.
            </p>
          </div>

          <div>
            <label className="form-label">Order Form Link (Google Form, optional)</label>
            <input
              className="input"
              type="url"
              value={form.order_form_url}
              onChange={(e) => set("order_form_url", e.target.value)}
              placeholder="https://forms.gle/..."
            />
          </div>

          <div>
            <label className="form-label">Refund / Claim Form Link (Google Form, optional)</label>
            <input
              className="input"
              type="url"
              value={form.refund_form_url}
              onChange={(e) => set("refund_form_url", e.target.value)}
              placeholder="https://forms.gle/..."
            />
          </div>

          <div className="full">
            <label className="form-label">Deal Description</label>
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Highlight product features and why reviewers will love it…"
            />
          </div>

          <div className="full">
            <label className="form-label">Campaign Notes &amp; Instructions for Reviewers</label>
            <textarea
              className="input"
              rows={8}
              value={form.instructions}
              onChange={(e) => set("instructions", e.target.value)}
              placeholder={"Read all details carefully before ordering.\n• Product code and colour/price limits\n• Fill the order form immediately (no form = no refund)\n• Deleted reviews count as ratings\n• Refund form within 30 days; screen recording proof for ratings\n• Only-order deals need the return-period-ended screenshot"}
            />
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Shown as a notes block on the deal page, line breaks preserved.
            </p>
          </div>

          <div className="full">
            <label className="form-label">Product Image (PNG/JPG/WebP, max 5 MB)</label>
            <input
              className="input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {form.image_url && !file && (
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Current image URL: {form.image_url}
              </p>
            )}
          </div>

          <div className="full" style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => set("featured", e.target.checked)}
              />
              Featured on homepage
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => set("active", e.target.checked)}
              />
              Active (open for reviewers)
            </label>
          </div>

          <div className="full" style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save campaign changes" : "Publish campaign deal"}
            </button>
            {editing && (
              <button type="button" className="btn btn-secondary" onClick={reset}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Campaigns Listing */}
      <div className="section-head" style={{ marginTop: 32 }}>
        <h3>All Brand Campaigns</h3>
        <div style={{ display: "flex", gap: 10 }}>
          <select
            className="input"
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            style={{ width: "auto" }}
          >
            <option value="All">All Platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {deals === null ? (
        <p className="muted">Loading campaigns…</p>
      ) : !filteredDeals || filteredDeals.length === 0 ? (
        <p className="muted">No campaigns found for the selected platform.</p>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Image</th>
                <th>Campaign & Code</th>
                <th>Platform</th>
                <th>Price & Refund</th>
                <th>Commission</th>
                <th>Slots Status</th>
                <th>Orders</th>
                <th>Submitted by</th>
                <th>Approval</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map((d) => {
                const totalSlots = d.total_slots || 50;
                const claimed = d.claimed_slots || 0;
                const rem = Math.max(0, totalSlots - claimed);
                return (
                  <tr key={d.id}>
                    <td>
                      {d.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={d.image_url}
                          alt=""
                          style={{ width: 50, height: 40, objectFit: "cover", borderRadius: 6 }}
                        />
                      ) : (
                        <span className="muted" style={{ fontSize: 20 }}>—</span>
                      )}
                    </td>
                    <td>
                      <strong>{d.title}</strong>
                      {d.featured === 1 && <span style={{ marginLeft: 6, color: "var(--brand)", fontWeight: 700 }}>★</span>}
                      <div className="muted" style={{ fontSize: 12 }}>
                        Code: <code style={{ color: "var(--accent)" }}>{d.product_code || `#${d.id}`}</code> · {d.category}
                      </div>
                    </td>
                    <td>
                      <span className="pill pill-confirmed" style={{ fontSize: 11, textTransform: "uppercase" }}>
                        {d.platform || "Amazon"}
                      </span>
                    </td>
                    <td>
                      <strong style={{ color: "var(--accent)" }}>
                        ₹{d.price_sale.toLocaleString("en-IN")}
                      </strong>
                      <div className="muted" style={{ fontSize: 11 }}>
                        Reimbursement: ₹{(d.refund_amount || d.price_sale).toLocaleString("en-IN")}
                      </div>
                    </td>
                    <td>
                      <strong>₹{Number(d.mediator_commission_amount || 0).toLocaleString("en-IN")}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>fixed</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: rem <= 5 ? "var(--danger)" : "var(--accent)", fontWeight: 600 }}>
                          {rem} slots left
                        </span>
                        <div className="muted">{claimed} / {totalSlots} claimed</div>
                      </div>
                    </td>
                    <td>
                      <strong>{d.order_count || 0}</strong>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {d.submitted_by_name || <span className="muted">Admin</span>}
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          d.approval_status === "approved"
                            ? "pill-delivered"
                            : d.approval_status === "rejected"
                              ? "pill-cancelled"
                              : "pill-pending"
                        }`}
                      >
                        {d.approval_status || "approved"}
                      </span>
                      {d.rejection_reason && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 4, maxWidth: 180 }}>
                          {d.rejection_reason}
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        className={`pill pill-${d.active === 1 ? "delivered" : "cancelled"}`}
                        onClick={() => toggleActive(d)}
                        style={{ border: "none", cursor: "pointer" }}
                        title="Click to toggle active state"
                      >
                        {d.active === 1 ? "Active" : "Hidden"}
                      </button>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {d.approval_status !== "approved" && (
                        <button className="btn btn-sm" onClick={() => approveDeal(d)}>
                          Approve
                        </button>
                      )}{" "}
                      {d.approval_status !== "rejected" && (
                        <button className="btn btn-secondary btn-sm" onClick={() => rejectDeal(d)}>
                          Reject
                        </button>
                      )}{" "}
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(d)}>
                        Edit
                      </button>{" "}
                      {d.approval_status === "approved" && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => postTelegram(d)}
                          title="Post this campaign to the Telegram channel"
                        >
                          Post TG
                        </button>
                      )}{" "}
                      <button className="btn btn-danger btn-sm" onClick={() => remove(d)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
