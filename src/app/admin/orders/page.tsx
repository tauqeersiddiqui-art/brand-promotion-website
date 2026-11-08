"use client";

import { useCallback, useEffect, useState } from "react";

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

type ReimbursementSummary = {
  id: number;
  reimbursement_code: string;
  status: string;
  upi_id: string;
  amount: number;
  utr_number: string;
};

type Order = {
  id: number;
  order_code: string;
  external_order_id: string;
  product_code: string;
  platform: string;
  deal_type: string;
  mediator_name: string;
  reviewer_name: string;
  full_name: string;
  email: string;
  phone: string;
  order_date: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  variant: string;
  quantity: number;
  notes: string;
  deal_title: string;
  deal_image: string;
  unit_price: number;
  total: number;
  order_screenshot_url: string;
  price_screenshot_url: string;
  ocr_order_id: string;
  ocr_order_match: number;
  fraud_score: number;
  validation_score: number;
  validation_details: string;
  admin_note: string;
  status: string;
  created_at: string;
  reimbursements?: ReimbursementSummary[];
};

const STATUSES = ["confirmed", "rejected", "cancelled"];
const PLATFORMS = ["All", "Amazon", "Flipkart", "Myntra", "Brand Store"];

/** Risk signals recorded at submission time (identity reuse, price mismatch…). */
function fraudSignals(o: Order): string[] {
  try {
    const d = JSON.parse(o.validation_details || "{}");
    return [
      ...(d?.fraudScore?.reasons ?? []),
      ...(d?.ocrValidation?.errors ?? []),
      ...(d?.ocrValidation?.warnings ?? []),
    ].filter((s: unknown): s is string => typeof s === "string" && s.length > 0);
  } catch {
    return [];
  }
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [platform, setPlatform] = useState("All");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Inspector Modal
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ search, status, platform, page: String(page) });
    try {
      const r = await fetch(`/api/admin/orders?${qs}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setOrders([]);
        setLoadError(d.error || `Failed to load orders (${r.status}).`);
        return;
      }
      const d = await r.json();
      setOrders(d.orders ?? []);
      setPages(d.pages ?? 1);
      setTotal(d.total ?? 0);
      setLoadError("");
    } catch {
      setOrders([]);
      setLoadError("Network error while loading orders.");
    }
  }, [search, status, platform, page]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  async function updateStatus(id: number, newStatus: string) {
    const r = await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getCsrfHeader() },
      body: JSON.stringify({ status: newStatus }),
    });
    if (r.ok) load();
  }

  function openInspector(o: Order) {
    setActiveOrder(o);
    setEditStatus(o.status);
    setEditNote(o.admin_note || "");
    setMsg(null);
  }

  async function saveOrderChanges(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrder) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${activeOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ status: editStatus, admin_note: editNote }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: d.error || "Failed to update." });
      } else {
        setMsg({ type: "ok", text: "Order status & note updated!" });
        setActiveOrder(null);
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 10, paddingBottom: 60 }}>
      <div className="admin-head">
        <div>
          <h1>Order proofs &amp; submissions</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Verify reviewer invoice screenshots, inspect automated OCR detections, and track mediator allocations.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn btn-outline btn-sm" href="/api/admin/export?type=orders">
            Export orders CSV
          </a>
          <button className="btn btn-sm" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {msg && (
        <div className={`alert ${msg.type === "ok" ? "alert-success" : "alert-error"}`}>
          {msg.text}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="toolbar" style={{ gap: 12 }}>
        <input
          className="input"
          style={{ flex: "1 1 240px", maxWidth: "none" }}
          placeholder="Search Order ID, Code, Reviewer, Phone, Mediator…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />

        <select
          className="input"
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value);
            setPage(1);
          }}
          style={{ width: "auto" }}
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>{p === "All" ? "All Platforms" : p}</option>
          ))}
        </select>

        <select
          className="input"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          style={{ width: "auto" }}
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.toUpperCase()}
            </option>
          ))}
        </select>

        <span className="muted" style={{ fontSize: 13 }}>
          {total} order proof{total === 1 ? "" : "s"}
        </span>
      </div>

      {loadError ? (
        <div className="alert alert-error">{loadError}</div>
      ) : orders === null ? (
        <p className="muted">Loading order submissions…</p>
      ) : orders.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40 }}>📦</div>
          <h3>No order submissions match filters</h3>
          <p className="muted">Reviewer purchase proofs will appear here once submitted.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Order & Platform</th>
                <th>Campaign & Mediator</th>
                <th>Reviewer & Phone</th>
                <th>Screenshots & OCR</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Claim Payout</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const hasReimb = o.reimbursements && o.reimbursements.length > 0;
                return (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.external_order_id || o.order_code}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>
                        Ref: {o.order_code}
                      </div>
                      <div style={{ marginTop: 3 }}>
                        <span className="pill pill-confirmed" style={{ fontSize: 10, textTransform: "uppercase" }}>
                          {o.platform || "Amazon"}
                        </span>
                      </div>
                    </td>

                    <td>
                      <strong style={{ fontSize: 13 }}>{o.deal_title}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>
                        Mediator: <span style={{ color: "#fff" }}>{o.mediator_name || "Direct"}</span>
                      </div>
                    </td>

                    <td>
                      <strong>{o.reviewer_name || o.full_name}</strong>
                      {o.phone && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          📞 <a href={`https://wa.me/${o.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="link">{o.phone}</a>
                        </div>
                      )}
                    </td>

                    <td>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {o.order_screenshot_url && (
                          <a href={o.order_screenshot_url} target="_blank" rel="noopener noreferrer" title="View Order Screenshot">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={o.order_screenshot_url}
                              alt="Order Proof"
                              style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }}
                            />
                          </a>
                        )}
                        {o.price_screenshot_url && (
                          <a href={o.price_screenshot_url} target="_blank" rel="noopener noreferrer" title="View Price Screenshot">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={o.price_screenshot_url}
                              alt="Price Proof"
                              style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }}
                            />
                          </a>
                        )}
                        <div>
                          {o.ocr_order_match === 1 ? (
                            <span className="badge" style={{ position: "static", background: "rgba(34,211,165,0.15)", color: "var(--accent)", fontSize: 10, padding: "2px 6px" }}>
                              ✓ OCR Match
                            </span>
                          ) : (
                            <span className="badge" style={{ position: "static", background: "rgba(255,255,255,0.06)", color: "var(--ink-soft)", fontSize: 10, padding: "2px 6px" }}>
                              Manual check
                            </span>
                          )}
                          {(o.fraud_score || 0) >= 30 && (
                            <span
                              className="badge"
                              title={fraudSignals(o).join(" • ")}
                              style={{ position: "static", background: "rgba(239,68,68,0.18)", color: "#f87171", fontSize: 10, padding: "2px 6px", marginLeft: 4 }}
                            >
                              ⚠ Risk {o.fraud_score}
                            </span>
                          )}
                          {(o.fraud_score || 0) > 0 && (o.fraud_score || 0) < 30 && (
                            <span
                              className="badge"
                              title={fraudSignals(o).join(" • ")}
                              style={{ position: "static", background: "rgba(245,158,11,0.16)", color: "#fbbf24", fontSize: 10, padding: "2px 6px", marginLeft: 4 }}
                            >
                              Risk {o.fraud_score}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <strong style={{ color: "var(--accent)" }}>
                        ₹{o.total.toLocaleString("en-IN")}
                      </strong>
                    </td>

                    <td>
                      <select
                        className="input"
                        style={{ padding: "4px 8px", fontSize: 12, width: "auto" }}
                        value={o.status}
                        onChange={(e) => updateStatus(o.id, e.target.value)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      {hasReimb ? (
                        <div>
                          <span className={`pill pill-${o.reimbursements![0].status}`} style={{ fontSize: 11 }}>
                            💰 {o.reimbursements![0].status}
                          </span>
                          {o.reimbursements![0].utr_number && (
                            <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
                              UTR: {o.reimbursements![0].utr_number}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>No claim yet</span>
                      )}
                    </td>

                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 12, padding: "4px 8px" }}
                        onClick={() => openInspector(o)}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="toolbar" style={{ justifyContent: "center", marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </button>
          <span className="muted" style={{ fontSize: 13 }}>Page {page} of {pages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      )}

      {/* Order Inspector Modal */}
      {activeOrder && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,6,12,0.75)",
            display: "grid",
            placeItems: "center",
            zIndex: 100,
            padding: 20,
          }}
          onClick={() => setActiveOrder(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 640, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Inspect order proof ({activeOrder.external_order_id || activeOrder.order_code})</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setActiveOrder(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ background: "var(--bg-soft)", padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 13.5 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <span className="muted">Order ID:</span>
                  <div style={{ fontWeight: 600, color: "#fff" }}>{activeOrder.external_order_id || activeOrder.order_code}</div>
                </div>
                <div>
                  <span className="muted">Platform:</span>
                  <div>{activeOrder.platform} (Mediator: {activeOrder.mediator_name})</div>
                </div>
                <div>
                  <span className="muted">Reviewer Name:</span>
                  <div>{activeOrder.reviewer_name || activeOrder.full_name}</div>
                </div>
                <div>
                  <span className="muted">Contact / WhatsApp:</span>
                  <div>{activeOrder.phone || activeOrder.email}</div>
                </div>
                <div>
                  <span className="muted">Order Amount:</span>
                  <div style={{ color: "var(--accent)", fontWeight: 700 }}>₹{activeOrder.total.toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <span className="muted">Order Date:</span>
                  <div>{activeOrder.order_date || "—"}</div>
                </div>
              </div>
            </div>

            {/* Fraud signals collected at submission time. Without this the
                score was computed and stored but never visible to an admin. */}
            {fraudSignals(activeOrder).length > 0 && (
              <div
                style={{
                  background: (activeOrder.fraud_score || 0) >= 30 ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                  border: `1px solid ${(activeOrder.fraud_score || 0) >= 30 ? "rgba(239,68,68,0.35)" : "rgba(245,158,11,0.35)"}`,
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 16,
                  fontSize: 12.5,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  Fraud risk {activeOrder.fraud_score || 0}/100 · confidence {activeOrder.validation_score || 0}/100
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                  {fraudSignals(activeOrder).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Screenshots Display */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>📦 Desktop/App Order Proof:</div>
                {activeOrder.order_screenshot_url ? (
                  <a href={activeOrder.order_screenshot_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeOrder.order_screenshot_url}
                      alt="Order Screenshot"
                      style={{ width: "100%", maxHeight: 180, objectFit: "contain", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)" }}
                    />
                  </a>
                ) : (
                  <p className="muted" style={{ fontSize: 12 }}>No order screenshot</p>
                )}
              </div>

              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>🧾 Price Breakup Proof:</div>
                {activeOrder.price_screenshot_url ? (
                  <a href={activeOrder.price_screenshot_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeOrder.price_screenshot_url}
                      alt="Price Screenshot"
                      style={{ width: "100%", maxHeight: 180, objectFit: "contain", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)" }}
                    />
                  </a>
                ) : (
                  <p className="muted" style={{ fontSize: 12 }}>No price screenshot</p>
                )}
              </div>
            </div>

            {/* Status & Notes form */}
            <form onSubmit={saveOrderChanges}>
              <div style={{ marginBottom: 12 }}>
                <label className="form-label">Verification Status</label>
                <select
                  className="input"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Admin Notes</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Internal notes regarding order verification, invoice checks, or mediator reports…"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" disabled={saving} style={{ flex: 1, justifyContent: "center" }}>
                  {saving ? "Saving…" : "💾 Save Status & Notes"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveOrder(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
