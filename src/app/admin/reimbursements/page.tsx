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

type Reimbursement = {
  id: number;
  reimbursement_code: string;
  order_id: number;
  deal_id: number;
  external_order_id: string;
  reviewer_name: string;
  review_rating: number;
  review_text: string;
  review_link: string;
  review_screenshot_url: string;
  ocr_text: string;
  order_screenshot_url: string;
  seller_feedback_url: string;
  mediator_name: string;
  order_ocr_text: string;
  ocr_status: string;
  payout_method: string;
  upi_id: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  account_holder: string;
  amount: number;
  status: "pending" | "under_review" | "approved" | "paid" | "rejected";
  utr_number: string;
  admin_note: string;
  created_at: string;
  order_code: string;
  platform: string;
  product_code: string;
  order_customer: string;
  customer_phone: string;
  customer_email: string;
  order_proof_url: string;
  price_screenshot_url: string;
  deal_title: string;
  // Seller contact from deal
  seller_name: string;
  seller_contact: string;
  seller_telegram: string;
};

const STATUSES = ["pending", "under_review", "approved", "paid", "rejected"] as const;

export default function AdminReimbursementsPage() {
  const [reimbursements, setReimbursements] = useState<Reimbursement[] | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [copiedUpi, setCopiedUpi] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Edit / Payout Modal
  const [activeItem, setActiveItem] = useState<Reimbursement | null>(null);
  const [editUtr, setEditUtr] = useState("");
  const [editStatus, setEditStatus] = useState<string>("");
  const [editNote, setEditNote] = useState("");
  const [editAmount, setEditAmount] = useState<number>(0);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ search, status, page: String(page) });
    try {
      const r = await fetch(`/api/admin/reimbursements?${qs}`);
      if (r.ok) {
        const d = await r.json();
        setReimbursements(d.reimbursements);
        setPages(d.pages);
        setTotal(d.total);
      }
    } catch {
      /* ignore */
    }
  }, [search, status, page]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedUpi(text);
    setTimeout(() => setCopiedUpi(null), 2500);
  }

  function openPayoutModal(r: Reimbursement) {
    setActiveItem(r);
    setEditUtr(r.utr_number || "");
    setEditStatus(r.status);
    setEditNote(r.admin_note || "");
    setEditAmount(r.amount);
    setMsg(null);
  }

  // Selection handlers
  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === reimbursements?.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reimbursements?.map((r) => r.id) || []));
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // Export to Seller - calls the new API endpoint
  async function handleExportToSeller() {
    if (selectedIds.size === 0) return;
    setMsg({ type: "ok", text: "Preparing seller export..." });
    try {
      const res = await fetch("/api/admin/reimbursements/export-to-seller", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ reimbursementIds: Array.from(selectedIds), status: "approved" }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.headers.get("Content-Disposition")?.split('filename="')[1]?.replace('"', "") || `seller-export-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setMsg({ type: "ok", text: "Seller export downloaded successfully!" });
        clearSelection();
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: d.error || "Export failed." });
      }
    } catch {
      setMsg({ type: "err", text: "Network error during export." });
    }
  }

  // WhatsApp link for seller contact
  function getWhatsAppLink(contact: string): string {
    const phone = contact.replace(/[^0-9]/g, "");
    if (!phone) return "";
    return `https://wa.me/${phone}?text=${encodeURIComponent("Hello! Regarding your approved claims for our brand promotion campaign. Please find the details attached.")}`;
  }

  // Telegram link for seller
  function getTelegramLink(telegram: string): string {
    const username = telegram.replace(/^@/, "");
    if (!username) return "";
    return `https://t.me/${username}`;
  }

  async function handleQuickStatus(id: number, newStatus: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/reimbursements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: d.error || "Could not update status." });
      }
    } finally {
      setBusyId(null);
    }
  }

  async function savePayoutChanges(e: React.FormEvent) {
    e.preventDefault();
    if (!activeItem) return;
    setBusyId(activeItem.id);
    setMsg(null);

    try {
      const res = await fetch(`/api/admin/reimbursements/${activeItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({
          status: editStatus,
          utr_number: editUtr,
          admin_note: editNote,
          // Only send the amount when the admin actually changed it. The API
          // rejects amount edits once a claim is approved or paid, which would
          // otherwise block saving the UTR / note on those claims.
          ...(editAmount !== activeItem.amount ? { amount: editAmount } : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: d.error || "Update failed." });
      } else {
        setMsg({ type: "ok", text: "Reimbursement details saved successfully!" });
        setActiveItem(null);
        load();
      }
    } catch {
      setMsg({ type: "err", text: "Network error occurred." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 10, paddingBottom: 60 }}>
      <div className="admin-head">
        <div>
          <h1>Review reimbursements &amp; payouts</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Verify reviewer proofs, copy UPI VPAs, and record bank IMPS/UPI UTR numbers for 100% reimbursement fulfillment.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn btn-outline btn-sm" href="/api/admin/export?type=reimbursements">
            Export payouts CSV
          </a>
          <button className="btn btn-sm" onClick={load}>
            Refresh list
          </button>
        </div>
      </div>

      {msg && (
        <div className={`alert ${msg.type === "ok" ? "alert-success" : "alert-error"}`}>
          {msg.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="input"
          style={{ flex: "1 1 240px", maxWidth: "none" }}
          placeholder="Search Claim Code, Order ID, Reviewer, UPI ID, UTR, Phone…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />

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

        {/* Bulk selection toolbar - shows when items selected */}
        {selectedIds.size > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 13 }}>
              {selectedIds.size} selected
            </span>
            {status === "approved" && (
              <button
                className="btn btn-sm"
                onClick={handleExportToSeller}
                disabled={busyId !== null}
              >
                📤 Export to Seller
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={clearSelection}
            >
              Clear
            </button>
          </div>
        )}

        <span className="muted" style={{ fontSize: 13 }}>
          {total} reimbursement claim{total === 1 ? "" : "s"}
        </span>
      </div>

      {/* Reimbursements Table */}
      {reimbursements === null ? (
        <p className="muted">Loading reimbursement claims…</p>
      ) : reimbursements.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40 }}>💸</div>
          <h3>No reimbursement claims match filters</h3>
          <p className="muted">When reviewers submit 5-star review proofs and UPI claims, they will appear here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={reimbursements && reimbursements.length > 0 && selectedIds.size === reimbursements.length}
                    onChange={toggleSelectAll}
                    title="Select all on this page"
                  />
                </th>
                <th>Claim & Order</th>
                <th>Reviewer & Contact</th>
                <th>Campaign Deal</th>
                <th>Seller Contact</th>
                <th>Proof & Review</th>
                <th>Payout UPI / Bank</th>
                <th>Amount</th>
                <th>Status & UTR</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reimbursements.map((r) => (
                <tr key={r.id}>
                  <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td>
                    <strong>{r.reimbursement_code}</strong>
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      Order: <code style={{ color: "var(--accent)" }}>{r.external_order_id || r.order_code}</code>
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {new Date(r.created_at + "Z").toLocaleDateString("en-IN", { dateStyle: "medium" })}
                    </div>
                  </td>

                  <td>
                    <strong>{r.reviewer_name || r.order_customer || "Reviewer"}</strong>
                    {r.customer_phone && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        📞 <a href={`https://wa.me/${r.customer_phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="link">{r.customer_phone}</a>
                      </div>
                    )}
                    {r.customer_email && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        ✉️ {r.customer_email}
                      </div>
                    )}
                  </td>

                  <td>
                    <div style={{ maxWidth: 160 }}>
                      <strong style={{ fontSize: 13 }}>{r.deal_title}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {r.platform} · #{r.product_code || "Deal"}
                      </div>
                    </div>
                  </td>

                  {/* Seller Contact Column */}
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {r.seller_name && (
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.seller_name}</div>
                      )}
                      {r.seller_contact && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                          <span className="muted">📱</span>
                          <span>{r.seller_contact}</span>
                          <a
                            href={getWhatsAppLink(r.seller_contact)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open WhatsApp"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: "2px 6px", fontSize: 10 }}
                          >
                            WhatsApp
                          </a>
                        </div>
                      )}
                      {r.seller_telegram && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                          <span className="muted">💬</span>
                          <span>@{r.seller_telegram}</span>
                          <a
                            href={getTelegramLink(r.seller_telegram)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open Telegram"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: "2px 6px", fontSize: 10 }}
                          >
                            Telegram
                          </a>
                        </div>
                      )}
                      {!r.seller_name && !r.seller_contact && !r.seller_telegram && (
                        <span className="muted" style={{ fontSize: 12 }}>—</span>
                      )}
                    </div>
                  </td>

                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {r.review_screenshot_url ? (
                        <a href={r.review_screenshot_url} target="_blank" rel="noopener noreferrer" title="View Review Screenshot">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={r.review_screenshot_url}
                            alt="Review Proof"
                            style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }}
                          />
                        </a>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>No screenshot</span>
                      )}
                      <div>
                        <div style={{ color: "var(--warn)", fontSize: 12 }}>
                          {"★".repeat(r.review_rating || 5)}
                        </div>
                        {r.review_link && (
                          <a href={r.review_link} target="_blank" rel="noopener noreferrer" className="link" style={{ fontSize: 11 }}>
                            Live Link ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  <td>
                    {r.upi_id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <code style={{ background: "var(--bg)", padding: "3px 6px", borderRadius: 4, fontSize: 12.5, color: "#fff" }}>
                          {r.upi_id}
                        </code>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ padding: "2px 6px", fontSize: 11 }}
                          onClick={() => copyToClipboard(r.upi_id)}
                          title="Copy UPI ID"
                        >
                          {copiedUpi === r.upi_id ? "Copied" : "Copy"}
                        </button>
                      </div>
                    ) : r.account_number ? (
                      <div style={{ fontSize: 12 }}>
                        <div><strong>A/C:</strong> {r.account_number}</div>
                        <div className="muted">IFSC: {r.ifsc_code} ({r.bank_name})</div>
                      </div>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>Not provided</span>
                    )}
                  </td>

                  <td>
                    <strong style={{ color: "var(--accent)", fontSize: 14 }}>
                      ₹{r.amount.toLocaleString("en-IN")}
                    </strong>
                  </td>

                  <td>
                    <span className={`pill pill-${r.status}`}>{r.status}</span>
                    {r.utr_number && (
                      <div style={{ marginTop: 4 }}>
                        <code style={{ background: "var(--bg)", padding: "2px 5px", borderRadius: 4, fontSize: 11, color: "var(--accent)" }}>
                          UTR: {r.utr_number}
                        </code>
                      </div>
                    )}
                  </td>

                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: 12, padding: "5px 8px" }}
                        onClick={() => openPayoutModal(r)}
                      >
                        Process payout
                      </button>

                      {r.status === "pending" && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 11, padding: "4px 6px", color: "var(--accent)" }}
                          disabled={busyId === r.id}
                          onClick={() => handleQuickStatus(r.id, "under_review")}
                        >
                          Start Review
                        </button>
                      )}

                      {r.status === "under_review" && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 11, padding: "4px 6px", color: "var(--accent)" }}
                          disabled={busyId === r.id}
                          onClick={() => handleQuickStatus(r.id, "approved")}
                        >
                          Approve
                        </button>
                      )}

                      {r.status !== "rejected" && r.status !== "paid" && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 11, padding: "4px 6px", color: "var(--danger)" }}
                          disabled={busyId === r.id}
                          onClick={() => handleQuickStatus(r.id, "rejected")}
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
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

      {/* Process Payout Modal */}
      {activeItem && (
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
          onClick={() => setActiveItem(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 600, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Process reimbursement #{activeItem.reimbursement_code}</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setActiveItem(null)}
              >
                ✕
              </button>
            </div>

            {/* Overview Summary */}
            <div style={{ background: "var(--bg-soft)", padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 13.5 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <span className="muted">Marketplace Order ID:</span>
                  <div style={{ fontWeight: 600, color: "#fff" }}>{activeItem.external_order_id || activeItem.order_code}</div>
                </div>
                <div>
                  <span className="muted">Campaign Deal:</span>
                  <div style={{ fontWeight: 600 }}>{activeItem.deal_title} ({activeItem.platform})</div>
                </div>
                <div>
                  <span className="muted">Reviewer Name:</span>
                  <div>{activeItem.reviewer_name || activeItem.order_customer}</div>
                </div>
                <div>
                  <span className="muted">Mediator Name:</span>
                  <div>{activeItem.mediator_name || "—"}</div>
                </div>
                <div>
                  <span className="muted">WhatsApp / Phone:</span>
                  <div>{activeItem.customer_phone || "—"}</div>
                </div>
              </div>

              {/* UPI Quick Copy Box */}
              {activeItem.upi_id && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span className="muted" style={{ fontSize: 12 }}>UPI ID (Virtual Payment Address):</span>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>{activeItem.upi_id}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => copyToClipboard(activeItem.upi_id)}
                  >
                    {copiedUpi === activeItem.upi_id ? "Copied" : "Copy UPI"}
                  </button>
                </div>
              )}
            </div>

            {/* Screenshots inspection */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              {activeItem.review_screenshot_url && (
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>⭐ Live Review Screenshot:</div>
                  <a href={activeItem.review_screenshot_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeItem.review_screenshot_url}
                      alt="Review screenshot"
                      style={{ width: "100%", maxHeight: 160, objectFit: "contain", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)" }}
                    />
                  </a>
                </div>
              )}
              {activeItem.order_screenshot_url && (
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>📦 Order page (return window closed):</div>
                  <a href={activeItem.order_screenshot_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeItem.order_screenshot_url}
                      alt="Claim order screenshot"
                      style={{ width: "100%", maxHeight: 160, objectFit: "contain", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)" }}
                    />
                  </a>
                </div>
              )}
              {activeItem.seller_feedback_url && (
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>🗣️ Seller feedback form:</div>
                  <a href={activeItem.seller_feedback_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeItem.seller_feedback_url}
                      alt="Seller feedback form"
                      style={{ width: "100%", maxHeight: 160, objectFit: "contain", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)" }}
                    />
                  </a>
                </div>
              )}
              {activeItem.order_proof_url && (
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>🧾 Original order proof:</div>
                  <a href={activeItem.order_proof_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeItem.order_proof_url}
                      alt="Original order proof"
                      style={{ width: "100%", maxHeight: 160, objectFit: "contain", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)" }}
                    />
                  </a>
                </div>
              )}
            </div>

            {(activeItem.ocr_text || activeItem.order_ocr_text) && (
              <details style={{ marginBottom: 16 }}>
                <summary className="muted" style={{ cursor: "pointer", fontSize: 12.5 }}>OCR text used for validation</summary>
                {activeItem.ocr_text && (
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 11.5, margin: "8px 0", padding: 10, background: "var(--bg-soft)", borderRadius: 8 }}>
                    [review] {activeItem.ocr_text}
                  </pre>
                )}
                {activeItem.order_ocr_text && (
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 11.5, margin: "8px 0", padding: 10, background: "var(--bg-soft)", borderRadius: 8 }}>
                    [order] {activeItem.order_ocr_text}
                  </pre>
                )}
              </details>
            )}

            {/* Payout Details Form */}
            <form onSubmit={savePayoutChanges}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="form-label">Reimbursement Amount (₹) *</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="form-label">Claim Status *</label>
                  <select
                    className="input"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
<option value="pending">PENDING (New claim)</option>
                      <option value="under_review">UNDER REVIEW (Verifying)</option>
                      <option value="approved">APPROVED (Ready for payment)</option>
                      <option value="paid">PAID (Disbursed with UTR)</option>
                      <option value="rejected">REJECTED</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="form-label">
                  Bank / UPI IMPS UTR Reference Number {editStatus === "paid" && <span style={{ color: "var(--accent)" }}>*</span>}
                </label>
                <input
                  className="input"
                  placeholder="e.g. 426819283749 or 12-digit UPI UTR"
                  value={editUtr}
                  onChange={(e) => {
                    setEditUtr(e.target.value);
                    if (e.target.value.trim().length > 6 && editStatus !== "paid") {
                      setEditStatus("paid");
                    }
                  }}
                />
                <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                  This UTR will be visible to the reviewer at /track and in their account dashboard.
                </p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Admin / Mediator Notes</label>
                <textarea
                  className="input"
                  placeholder="Optional internal note or remark for the reviewer…"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" disabled={busyId !== null} style={{ flex: 1, justifyContent: "center" }}>
                  {busyId !== null ? "Saving…" : "💾 Save & Update Payout"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveItem(null)}
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
