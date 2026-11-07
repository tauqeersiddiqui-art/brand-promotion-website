"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { calculateRefund } from "@/lib/refund";

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

type MediatorDeal = {
  id: number;
  product_code: string;
  title: string;
  category: string;
  platform: string;
  deal_type: string;
  image_url: string;
  price_sale: number;
  refund_amount: number;
  total_slots: number;
  stock: number;
  active: number;
  approval_status: "pending" | "approved" | "rejected";
  rejection_reason: string;
  mediator_commission_amount: number;
  created_at: string;
  approved_at: string;
  approved_by_name: string | null;
};

type Stats = {
  pending: number;
  approved: number;
  rejected: number;
  approved_commission: number;
};

const EMPTY = {
  title: "",
  description: "",
  category: "General",
  platform: "Amazon",
  deal_type: "Flat Refund",
  image_url: "",
  deal_url: "",
  target_keyword: "",
  instructions: "",
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
  stock: "50",
  mediator_commission_amount: "",
};

const PLATFORMS = ["Amazon", "Flipkart", "Myntra", "Brand Store", "Meesho", "Nykaa"];
const DEAL_TYPES = ["Review Incentive", "Flat Refund", "Review Deal", "Rating Deal", "Only Order Deal"];
const CATEGORIES = ["Electronics", "Footwear", "Fashion", "Beauty & Care", "Home & Kitchen", "Fitness & Sports", "Health & Wellness", "General"];

export default function MediatorPage() {
  const [deals, setDeals] = useState<MediatorDeal[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/mediator/deals");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setDeals([]);
        setLoadError(d.error || `Failed to load your campaigns (${r.status}).`);
        return;
      }
      setDeals(d.deals ?? []);
      setStats(d.stats ?? null);
      setLoadError("");
    } catch {
      setDeals([]);
      setLoadError("Network error while loading your campaigns.");
    }
  }, []);

  useEffect(() => {
    fetch("/api/csrf").catch(() => {});
    load();
  }, [load]);

  function set(k: keyof typeof EMPTY, v: string) {
    setForm((f) => {
      const updated = { ...f, [k]: v };
      return updated;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) fd.set(k, String(v));
      if (file) fd.set("image", file);

      const r = await fetch("/api/mediator/deals", {
        method: "POST",
        headers: getCsrfHeader(),
        body: fd,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ type: "err", text: d.error || "Submission failed." });
        return;
      }
      setMsg({
        type: "ok",
        text: `Campaign submitted (${d.product_code}). It will go live after admin approval.`,
      });
      setForm(EMPTY);
      setFile(null);
      load();
    } catch {
      setMsg({ type: "err", text: "Network error while submitting the campaign." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: MediatorDeal) {
    if (!confirm(`Withdraw "${d.title}"?`)) return;
    const r = await fetch(`/api/mediator/deals/${d.id}`, {
      method: "DELETE",
      headers: getCsrfHeader(),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg({ type: "err", text: j.error || "Could not withdraw the campaign." });
      return;
    }
    setMsg({ type: "ok", text: "Campaign withdrawn." });
    load();
  }

  function statusPill(status: MediatorDeal["approval_status"]) {
    const cls =
      status === "approved" ? "pill-delivered" : status === "rejected" ? "pill-cancelled" : "pill-pending";
    return <span className={`pill ${cls}`}>{status}</span>;
  }

  return (
    <div className="container" style={{ paddingTop: 10, paddingBottom: 60 }}>
      <div className="admin-head">
        <div>
          <h1>Mediator dashboard</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Submit campaigns for admin approval and track your fixed commission per approved campaign.
          </p>
        </div>
      </div>

      {msg && (
        <div className={`alert ${msg.type === "ok" ? "alert-success" : "alert-error"}`}>{msg.text}</div>
      )}
      {loadError && <div className="alert alert-error">{loadError}</div>}

      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            marginBottom: 22,
          }}
        >
          {[
            { label: "Pending approval", value: stats.pending },
            { label: "Approved campaigns", value: stats.approved },
            { label: "Rejected campaigns", value: stats.rejected },
            {
              label: "Approved commission",
              value: `₹${Number(stats.approved_commission || 0).toLocaleString("en-IN")}`,
            },
          ].map((s) => (
            <div className="card" key={s.label} style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12 }}>{s.label}</div>
              <strong style={{ fontSize: 22, color: "var(--accent)" }}>{s.value}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="card mb" style={{ padding: 28 }}>
        <h3 style={{ marginTop: 0, fontSize: 18 }}>Submit a campaign</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          The admin reviews every submission. Your proposed fixed commission is only confirmed on approval.
        </p>
        <form onSubmit={submit} className="form-grid">
          <div className="full">
            <label className="form-label">Campaign / Product Title *</label>
            <input
              className="input"
              required
              minLength={3}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Noise Cancelling Bluetooth Earbuds"
            />
          </div>

          <div>
            <label className="form-label">Platform</label>
            <select className="input" value={form.platform} onChange={(e) => set("platform", e.target.value)}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Category</label>
            <select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Deal type</label>
            <select className="input" value={form.deal_type} onChange={(e) => set("deal_type", e.target.value)}>
              {DEAL_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Fixed mediator commission (₹)</label>
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
              A fixed amount per approved campaign, not a percentage. Admin confirms the final amount.
            </p>
          </div>

          <div>
            <label className="form-label">Original MRP (₹)</label>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={form.price_original}
              onChange={(e) => set("price_original", e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">Purchase price on store (₹) *</label>
            <input
              className="input"
              type="number"
              required
              min={1}
              step="0.01"
              value={form.price_sale}
              onChange={(e) => set("price_sale", e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">
              Refund amount (₹)
            </label>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={form.refund_amount}
              onChange={(e) => set("refund_amount", e.target.value)}
              placeholder="e.g. 199 (after review), 99 (after rating)"
            />
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Enter the amount to refund after reviewer completes requirements.
            </p>
          </div>

          <div>
            <label className="form-label">Review deal payout (₹)</label>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={form.review_amount}
              onChange={(e) => set("review_amount", e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">Rating deal payout (₹)</label>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={form.rating_amount}
              onChange={(e) => set("rating_amount", e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">Only-order deal payout (₹)</label>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={form.only_order_amount}
              onChange={(e) => set("only_order_amount", e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">Reviewer slots</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.total_slots}
              onChange={(e) => set("total_slots", e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">Stock</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.stock}
              onChange={(e) => set("stock", e.target.value)}
            />
          </div>

          <div className="full">
            <label className="form-label">Store listing URL</label>
            <input
              className="input"
              type="url"
              value={form.deal_url}
              onChange={(e) => set("deal_url", e.target.value)}
              placeholder="https://www.amazon.in/dp/B0XXXXXXXX"
            />
          </div>

          <div>
            <label className="form-label">Order form link</label>
            <input
              className="input"
              type="url"
              value={form.order_form_url}
              onChange={(e) => set("order_form_url", e.target.value)}
              placeholder="https://forms.gle/..."
            />
          </div>

          <div>
            <label className="form-label">Refund / claim form link</label>
            <input
              className="input"
              type="url"
              value={form.refund_form_url}
              onChange={(e) => set("refund_form_url", e.target.value)}
              placeholder="https://forms.gle/..."
            />
          </div>

          <div className="full">
            <label className="form-label">Target search keyword</label>
            <input
              className="input"
              value={form.target_keyword}
              onChange={(e) => set("target_keyword", e.target.value)}
            />
          </div>

          <div className="full">
            <label className="form-label">Description</label>
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="full">
            <label className="form-label">Notes &amp; instructions for reviewers</label>
            <textarea
              className="input"
              rows={5}
              value={form.instructions}
              onChange={(e) => set("instructions", e.target.value)}
            />
          </div>

          <div className="full">
            <label className="form-label">Product image (optional URL or upload)</label>
            <input
              className="input"
              type="url"
              value={form.image_url}
              onChange={(e) => set("image_url", e.target.value)}
              placeholder="https://..."
              style={{ marginBottom: 8 }}
            />
            <input
              className="input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="full">
            <button className="btn" disabled={busy}>
              {busy ? "Submitting…" : "Submit for approval"}
            </button>
          </div>
        </form>
      </div>

      <div className="section-head" style={{ marginTop: 32 }}>
        <h3>My campaigns</h3>
      </div>

      {deals === null ? (
        <p className="muted">Loading campaigns…</p>
      ) : deals.length === 0 ? (
        <p className="muted">You have not submitted any campaigns yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Platform</th>
                <th>Price</th>
                <th>Commission</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.title}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      <code>{d.product_code}</code> · {d.category}
                    </div>
                  </td>
                  <td>{d.platform}</td>
                  <td>₹{Number(d.price_sale || 0).toLocaleString("en-IN")}</td>
                  <td>
                    <strong>₹{Number(d.mediator_commission_amount || 0).toLocaleString("en-IN")}</strong>
                    <div className="muted" style={{ fontSize: 11 }}>{d.approval_status === "approved" ? "confirmed" : "proposed"}</div>
                  </td>
                  <td>
                    {statusPill(d.approval_status)}
                    {d.rejection_reason && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 4, maxWidth: 200 }}>
                        {d.rejection_reason}
                      </div>
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {new Date(d.created_at + "Z").toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {d.approval_status === "approved" && d.active === 1 && (
                      <Link className="btn btn-ghost btn-sm" href={`/deal/${d.id}`}>
                        View
                      </Link>
                    )}
                    {d.approval_status !== "approved" && (
                      <button className="btn btn-danger btn-sm" onClick={() => remove(d)}>
                        Withdraw
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
