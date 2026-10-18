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

type Refund = {
  id: number;
  refund_code: string;
  order_code: string;
  full_name: string;
  email: string;
  deal_title: string;
  total: number;
  reason: string;
  details: string;
  status: string;
  admin_note: string;
  created_at: string;
};

export default function AdminRefundsPage() {
  const [refunds, setRefunds] = useState<Refund[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("");
  const [note, setNote] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/refunds?status=${status}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setRefunds([]);
        setLoadError(d.error || `Failed to load refunds (${r.status}).`);
        return;
      }
      const d = await r.json();
      setRefunds(d.refunds ?? []);
      setLoadError("");
    } catch {
      setRefunds([]);
      setLoadError("Network error while loading refunds.");
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: number, decision: string) {
    const r = await fetch(`/api/admin/refunds/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getCsrfHeader() },
      body: JSON.stringify({ status: decision, admin_note: note[id] || "" }),
    });
    if (r.ok) load();
  }

  return (
    <div className="container" style={{ paddingTop: 10 }}>
      <div className="admin-head">
        <h1>Refund requests</h1>
        <a className="btn btn-outline btn-sm" href="/api/admin/export?type=refunds">
          Export CSV
        </a>
      </div>

      <div className="toolbar">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All requests</option>
          <option value="requested">Requested (new)</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="processed">Processed</option>
        </select>
      </div>

      {loadError ? (
        <div className="alert alert-error">{loadError}</div>
      ) : refunds === null ? (
        <p className="muted">Loading…</p>
      ) : refunds.length === 0 ? (
        <p className="muted">No refund requests.</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {refunds.map((r) => (
            <div className="card" key={r.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong>{r.refund_code}</strong>{" "}
                  <span className={`pill pill-${r.status}`}>{r.status}</span>
                  <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
                    Order <strong>{r.order_code}</strong> · {r.deal_title} · ₹{r.total.toLocaleString("en-IN")}
                  </div>
                  <div className="muted" style={{ fontSize: 13.5 }}>
                    {r.full_name} ({r.email})
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {new Date(r.created_at + "Z").toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </div>
              </div>
              <p style={{ margin: "10px 0 4px" }}>
                <strong>Reason:</strong> {r.reason}
              </p>
              {r.details && (
                <p className="muted" style={{ margin: "0 0 8px", fontSize: 14 }}>
                  "{r.details}"
                </p>
              )}
              {r.admin_note && (
                <p style={{ margin: "0 0 8px", fontSize: 13.5 }}>
                  <strong>Your note:</strong> {r.admin_note}
                </p>
              )}
              {r.status === "requested" && (
                <>
                  <input
                    className="input"
                    placeholder="Internal note (optional)..."
                    value={note[r.id] || ""}
                    onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))}
                    style={{ marginBottom: 10 }}
                  />
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="btn btn-sm" onClick={() => decide(r.id, "approved")}>
                      Approve
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => decide(r.id, "rejected")}>
                      Reject
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => decide(r.id, "processed")}>
                      Mark processed
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
