"use client";

import { useEffect, useState } from "react";

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
  cashback_amount: number;
  total_slots: number;
  claimed_slots: number;
  stock: number;
  featured: number;
  active: number;
  order_count: number;
};

const EMPTY = {
  id: 0,
  product_code: "",
  title: "",
  description: "",
  category: "Electronics",
  platform: "Amazon",
  deal_type: "100% Cashback",
  image_url: "",
  deal_url: "",
  target_keyword: "",
  instructions: "1. Search keyword on Amazon/Flipkart.\n2. Submit Order & Price screenshot.\n3. Post 5★ review upon delivery.\n4. Submit claim for 100% UPI refund.",
  coupon_code: "",
  price_original: "",
  price_sale: "",
  cashback_amount: "",
  total_slots: "50",
  claimed_slots: "0",
  stock: "50",
  featured: false,
  active: true,
};

const PLATFORMS = ["Amazon", "Flipkart", "Myntra", "Brand Store", "Meesho", "Nykaa"];
const DEAL_TYPES = [
  "100% Cashback", "90% Cashback", "80% Cashback", "70% Cashback", "60% Cashback",
  "50% Cashback", "40% Cashback", "30% Cashback", "20% Cashback", "10% Cashback",
  "Review Incentive", "Flat Cashback"
];
const CATEGORIES = ["Electronics", "Beauty & Care", "Home & Kitchen", "Fitness & Sports", "Fashion", "Health & Wellness", "General"];

function parseDealTypePercentage(dealType: string | undefined | null): number {
  const match = (dealType || "").match(/^(\d+)%\s*Cashback$/i);
  return match ? parseInt(match[1], 10) : 0;
}

export default function AdminDealsPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [filterPlatform, setFilterPlatform] = useState("All");

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
      // Auto-calculate cashback when deal_type or price_sale changes
      const dealType = k === "deal_type" ? String(v) : f.deal_type;
      const salePrice = k === "price_sale" ? Number(v) : Number(f.price_sale || 0);
      const percentage = parseDealTypePercentage(dealType);

      if ((k === "deal_type" || k === "price_sale") && percentage > 0 && salePrice > 0) {
        updated.cashback_amount = String(Math.round(salePrice * percentage / 100));
      }
      // Backward compat: if deal_type is not percentage-based, keep existing logic
      if (k === "price_sale" && percentage === 0 && (!f.cashback_amount || f.cashback_amount === f.price_sale)) {
        updated.cashback_amount = String(v);
      }
      return updated;
    });
  }

  function startEdit(d: Deal) {
    setEditing(true);
    setForm({
      id: d.id,
      product_code: d.product_code || "",
      title: d.title,
      description: d.description || "",
      category: d.category || "General",
      platform: d.platform || "Amazon",
      deal_type: d.deal_type || "100% Cashback",
      image_url: d.image_url || "",
      deal_url: d.deal_url || "",
      target_keyword: d.target_keyword || "",
      instructions: d.instructions || "",
      coupon_code: d.coupon_code || "",
      price_original: String(d.price_original || ""),
      price_sale: String(d.price_sale || ""),
      cashback_amount: String(d.cashback_amount || d.price_sale || ""),
      total_slots: String(d.total_slots || 50),
      claimed_slots: String(d.claimed_slots || 0),
      stock: String(d.stock || 50),
      featured: d.featured === 1,
      active: d.active === 1,
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
      const calculatedCashback = percentage > 0 ? Math.round(salePrice * percentage / 100) : salePrice;

      setForm((f) => ({
        ...f,
        platform: d.platform,
        title: d.title || f.title,
        price_original: String(d.priceOriginal || ""),
        price_sale: String(d.priceSale || ""),
        cashback_amount: String(calculatedCashback),
        deal_type: resolvedDealType,
        image_url: d.imageUrl || f.image_url,
        target_keyword: d.targetKeyword || f.target_keyword,
        description: d.description || f.description,
        // Keep the deal_url (don't clear it)
        deal_url: f.deal_url,
      }));
      setMsg({ type: "ok", text: "Product details fetched! ✅ Review and adjust if needed." });
    } catch {
      setMsg({ type: "err", text: "Network error fetching product." });
    } finally {
      setBusy(false);
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
      fd.set("cashback_amount", form.cashback_amount || form.price_sale);
      fd.set("total_slots", form.total_slots || "50");
      fd.set("claimed_slots", form.claimed_slots || "0");
      fd.set("stock", form.stock || "50");
      fd.set("featured", form.featured ? "true" : "false");
      fd.set("active", form.active ? "true" : "false");
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
        setMsg({
          type: "ok",
          text: editing ? "Campaign deal updated ✅" : `Campaign deal created (${d.product_code || "New"}) ✅`,
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

  async function toggleActive(d: Deal) {
    const fd = new FormData();
    fd.set("active", d.active === 1 ? "false" : "true");
    const r = await fetch(`/api/admin/deals/${d.id}`, { method: "PATCH", headers: getCsrfHeader(), body: fd });
    if (r.ok) load();
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
        <div className={`alert ${msg.type === "ok" ? "alert-success" : "alert-error"}`}>
          {msg.text}
        </div>
      )}

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
              placeholder="e.g. Noise Cancelling Bluetooth Earbuds — 100% UPI Cashback"
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
            <label className="form-label">Cashback / Reimbursement Amount (₹) *</label>
            <input
              className="input"
              type="number"
              required
              min={0}
              step="0.01"
              value={form.cashback_amount}
              onChange={(e) => set("cashback_amount", e.target.value)}
              placeholder="1999"
            />
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
              Paste Amazon/Flipkart product URL and click "Fetch Details" to auto-fill title, price, image & keywords
            </p>
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
            <label className="form-label">Campaign Specific Instructions for Reviewers</label>
            <textarea
              className="input"
              rows={3}
              value={form.instructions}
              onChange={(e) => set("instructions", e.target.value)}
              placeholder="1. Search with keyword on Amazon. 2. Do not use random vouchers. 3. Post 5-star review with unboxed photos."
            />
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
                <th>Price & Cashback</th>
                <th>Slots Status</th>
                <th>Orders</th>
                <th>Status</th>
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
                        Reimbursement: ₹{(d.cashback_amount || d.price_sale).toLocaleString("en-IN")}
                      </div>
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
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(d)}>
                        Edit
                      </button>{" "}
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
