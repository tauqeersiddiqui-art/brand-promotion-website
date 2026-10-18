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

type Review = {
  id: number;
  review_code: string;
  user_name: string;
  user_email: string;
  order_code: string;
  deal_title: string;
  rating: number;
  text: string;
  screenshot_url: string;
  ocr_text: string;
  ocr_status: string;
  status: string;
  admin_note: string;
  created_at: string;
};

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/reviews?status=${status}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setReviews([]);
        setLoadError(d.error || `Failed to load reviews (${r.status}).`);
        return;
      }
      const d = await r.json();
      setReviews(d.reviews ?? []);
      setLoadError("");
    } catch {
      setReviews([]);
      setLoadError("Network error while loading reviews.");
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: number, decision: string) {
    setBusyId(id);
    setMsg("");
    const r = await fetch(`/api/admin/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getCsrfHeader() },
      body: JSON.stringify({ status: decision, admin_note: note[id] || "" }),
    });
    setBusyId(null);
    if (r.ok) load();
    else setMsg("Action failed.");
  }

  async function rerunOcr(id: number) {
    setBusyId(id);
    setMsg("Running OCR…");
    const r = await fetch(`/api/admin/reviews/${id}`, { method: "POST", headers: getCsrfHeader() });
    const d = await r.json();
    setBusyId(null);
    if (r.ok) {
      setMsg("OCR re-run complete ✅");
      load();
    } else {
      setMsg(`OCR failed: ${d.error || "unknown error"}`);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 10 }}>
      <div className="admin-head">
        <h1>Reviews</h1>
        <span className="muted" style={{ fontSize: 13 }}>
          Screenshot text is auto-extracted (OCR) — verify it matches before approving
        </span>
      </div>

      {msg && <div className="alert alert-info">{msg}</div>}

      <div className="toolbar">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All reviews</option>
          <option value="pending">Pending (new)</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loadError ? (
        <div className="alert alert-error">{loadError}</div>
      ) : reviews === null ? (
        <p className="muted">Loading…</p>
      ) : reviews.length === 0 ? (
        <p className="muted">No reviews.</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {reviews.map((r) => (
            <div className="card" key={r.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong>{r.review_code}</strong>{" "}
                  <span className={`pill ${r.status === "approved" ? "pill-delivered" : r.status === "rejected" ? "pill-cancelled" : "pill-pending"}`}>
                    {r.status}
                  </span>
                  <span style={{ color: "var(--warn)", marginLeft: 10 }}>
                    {"★".repeat(r.rating)}
                    <span style={{ color: "var(--border)" }}>{"★".repeat(5 - r.rating)}</span>
                  </span>
                  <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                    {r.user_name} ({r.user_email}) · Order {r.order_code} · {r.deal_title}
                  </div>
                </div>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {new Date(r.created_at + "Z").toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>

              <p style={{ margin: "10px 0 4px" }}>{r.text}</p>

              {r.screenshot_url ? (
                <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <a href={r.screenshot_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.screenshot_url}
                      alt="Review screenshot"
                      style={{ maxHeight: 180, borderRadius: 10, border: "1px solid var(--border)" }}
                    />
                  </a>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <label className="form-label">
                      OCR extracted text{" "}
                      <span className={`pill ${r.ocr_status === "done" ? "pill-delivered" : r.ocr_status === "failed" ? "pill-cancelled" : "pill-pending"}`}>
                        {r.ocr_status}
                      </span>
                    </label>
                    <pre
                      style={{
                        background: "var(--bg-soft)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: 12,
                        fontSize: 12.5,
                        whiteSpace: "pre-wrap",
                        maxHeight: 160,
                        overflow: "auto",
                        margin: 0,
                      }}
                    >
                      {r.ocr_text || "(no text extracted)"}
                    </pre>
                    <button
                      className="btn btn-secondary btn-sm mt"
                      disabled={busyId === r.id}
                      onClick={() => rerunOcr(r.id)}
                    >
                      Re-run OCR
                    </button>
                  </div>
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 13 }}>No screenshot attached.</p>
              )}

              {r.admin_note && (
                <p style={{ margin: "8px 0 0", fontSize: 13.5 }}>
                  <strong>Your note:</strong> {r.admin_note}
                </p>
              )}

              {r.status === "pending" && (
                <>
                  <input
                    className="input mt"
                    placeholder="Internal note (optional)…"
                    value={note[r.id] || ""}
                    onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))}
                  />
                  <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                      <button className="btn btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, "approved")}>
                        Approve (publish)
                      </button>
                      <button className="btn btn-danger btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, "rejected")}>
                        Reject
                      </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
