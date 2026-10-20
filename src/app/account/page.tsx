"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ClaimCashbackForm from "@/components/ClaimCashbackForm";

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
  refund_code: string;
  reason: string;
  status: string;
  admin_note: string;
  created_at: string;
};

type ReviewInfo = { review_code: string; status: string; rating: number } | null;

type Order = {
  id: number;
  order_code: string;
  external_order_id: string;
  product_code: string;
  platform: string;
  deal_title: string;
  deal_image: string;
  reviewer_name: string;
  quantity: number;
  variant: string;
  total: number;
  status: string;
  created_at: string;
  refunds: Refund[];
  review: ReviewInfo;
};

type Reimbursement = {
  id: number;
  reimbursement_code: string;
  external_order_id: string;
  order_code: string;
  deal_title: string;
  reviewer_name: string;
  payout_method: string;
  upi_id: string;
  amount: number;
  status: string;
  utr_number: string;
  admin_note: string;
  created_at: string;
};

const REASONS = [
  "Item not received",
  "Wrong item delivered",
  "Damaged / defective product",
  "Quality not as described",
  "Duplicate order",
  "Cancelled on platform",
  "Other",
];

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState<"orders" | "reimbursements" | "new_claim">("orders");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [refundFor, setRefundFor] = useState<Order | null>(null);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // review modal state
  const [reviewFor, setReviewFor] = useState<Order | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [shot, setShot] = useState<File | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/orders/me");
    if (r.status === 401) {
      window.location.href = "/login?next=/account";
      return;
    }
    if (!r.ok) {
      setLoadError("Could not load your orders. Please refresh the page.");
      setOrders([]);
      return;
    }
    const d = await r.json();
    setOrders(d.orders ?? []);
    setLoadError("");

    // Claims come from the session-scoped /api/reimbursements endpoint.
    // They were previously read from /api/track, which nests them per order
    // and has no top-level `reimbursements` key, so this tab never rendered.
    fetch("/api/reimbursements")
      .then((res) => (res.ok ? res.json() : { reimbursements: [] }))
      .then((reimbData) => setReimbursements(reimbData?.reimbursements ?? []))
      .catch(() => setReimbursements([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewFor) return;
    setReviewBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("order_id", String(reviewFor.id));
      fd.set("rating", String(rating));
      fd.set("text", reviewText);
      if (shot) fd.set("screenshot", shot);

      const r = await fetch("/api/reviews", { method: "POST", headers: getCsrfHeader(), body: fd });
      const d = await r.json();
      if (!r.ok) {
        setMsg({ type: "err", text: d.error || "Review submission failed." });
      } else {
        setMsg({
          type: "ok",
          text:
            d.note ||
            `Review ${d.review_code} submitted! Our team will verify and process your review cashback.`,
        });
        setReviewFor(null);
        setReviewText("");
        setShot(null);
        setRating(5);
        load();
      }
    } catch {
      setMsg({ type: "err", text: "Network error. Please try again." });
    } finally {
      setReviewBusy(false);
    }
  }

  async function submitRefund(e: React.FormEvent) {
    e.preventDefault();
    if (!refundFor) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ order_id: refundFor.id, reason, details }),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg({ type: "err", text: d.error || "Refund request failed." });
      } else {
        setMsg({
          type: "ok",
          text: `Refund request ${d.refund_code} submitted!`,
        });
        setRefundFor(null);
        setDetails("");
        load();
      }
    } catch {
      setMsg({ type: "err", text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 36, paddingBottom: 60 }}>
      <div className="admin-head">
        <div>
          <h1>Reviewer dashboard</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Manage your submitted campaign orders, review proofs, and track UPI cashback disbursements.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/browse" className="btn btn-secondary btn-sm">
            🔥 Live Deals
          </Link>
          <Link href="/track" className="btn btn-sm">
            🔍 Track by Order ID
          </Link>
        </div>
      </div>

      {msg && (
        <div className={`alert ${msg.type === "ok" ? "alert-success" : "alert-error"}`}>
          {msg.text}
        </div>
      )}

      {/* Account Tabs */}
      <div className="admin-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === "orders" ? "active" : ""}`}
          onClick={() => setActiveTab("orders")}
          style={{ width: "auto" }}
        >
          My orders ({orders?.length ?? 0})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "reimbursements" ? "active" : ""}`}
          onClick={() => setActiveTab("reimbursements")}
          style={{ width: "auto" }}
        >
          Cashback &amp; payouts ({reimbursements.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === "new_claim" ? "active" : ""}`}
          onClick={() => setActiveTab("new_claim")}
          style={{ width: "auto" }}
        >
          Submit refund request
        </button>
      </div>

      {activeTab === "orders" && (
        <>
          {loadError ? (
            <div className="alert alert-error">{loadError}</div>
          ) : orders === null ? (
            <p className="muted">Loading your campaign orders…</p>
          ) : orders.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 48 }}>
                <div className="muted" style={{ fontSize: 34, marginBottom: 10, display: "block" }}>—</div>
                <h3>No submitted orders yet</h3>
              <p className="muted">Claim a slot from our live deals and submit your order screenshot!</p>
              <Link href="/browse" className="btn mt">
                🔥 Browse Live Deals
              </Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Order & Platform</th>
                    <th>Campaign Deal</th>
                    <th>Reviewer Name</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Reimbursement Action</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const activeRefund = o.refunds?.some((r) =>
                      ["requested", "approved", "processed"].includes(r.status)
                    );
                    const reviewEligible =
                      ["confirmed", "verified", "shipped", "delivered"].includes(o.status) && !o.review;
                    return (
                      <tr key={o.id}>
                        <td>
                          <strong>{o.external_order_id || o.order_code}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {o.platform || "Amazon"} · {new Date(o.created_at + "Z").toLocaleDateString("en-IN", { dateStyle: "medium" })}
                          </div>
                        </td>
                        <td>
                          <strong>{o.deal_title}</strong>
                          {o.product_code && (
                            <div className="muted" style={{ fontSize: 12 }}>#{o.product_code}</div>
                          )}
                        </td>
                        <td>{o.reviewer_name || "—"}</td>
                        <td>
                          <strong>₹{o.total.toLocaleString("en-IN")}</strong>
                        </td>
                        <td>
                          <span className={`pill pill-${o.status}`}>{o.status}</span>
                        </td>
                        <td>
                            <Link
                              href={`/#claim-cashback`}
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 12, padding: "5px 10px" }}
                            >
                              Claim ₹{o.total}
                            </Link>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Link
                              href={`/track?q=${encodeURIComponent(o.external_order_id || o.order_code)}`}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: 12, padding: "5px 10px" }}
                            >
                              🔍 Track
                            </Link>
                            {reviewEligible && (
                              <button
                                className="btn btn-sm"
                                style={{ fontSize: 12, padding: "5px 10px" }}
                                onClick={() => {
                                  setReviewFor(o);
                                  setReviewText("");
                                  setShot(null);
                                  setRating(5);
                                  setMsg(null);
                                }}
                              >
                                Submit review
                              </button>
                            )}
                              {o.review && (
                                <span
                                  className={`pill pill-${o.review.status}`}
                                  title={`Your ${o.review.rating}-star review is ${o.review.status}`}
                                >
                                  {o.review.status}
                                </span>
                              )}
                            {o.status === "delivered" && !activeRefund && (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 12, padding: "5px 10px" }}
                                onClick={() => {
                                  setRefundFor(o);
                                  setReason(REASONS[0]);
                                  setDetails("");
                                  setMsg(null);
                                }}
                              >
                                Request refund
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === "reimbursements" && (
        <div>
          {reimbursements.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 48 }}>
              <div className="muted" style={{ fontSize: 34, marginBottom: 10, display: "block" }}>—</div>
              <h3>No reimbursement claims recorded yet</h3>
              <p className="muted">
                Once you post your 5-star review on Amazon/Flipkart, claim your reimbursement here.
              </p>
                <button
                  type="button"
                  className="btn mt"
                  onClick={() => setActiveTab("new_claim")}
                >
                  Submit refund request
                </button>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Claim Ref</th>
                    <th>Order ID</th>
                    <th>Payout Method</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>UTR / Bank Ref</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {reimbursements.map((r) => (
                    <tr key={r.reimbursement_code || r.id}>
                      <td>
                        <strong>{r.reimbursement_code}</strong>
                      </td>
                      <td>{r.external_order_id}</td>
                      <td>
                        {r.payout_method?.toUpperCase()} ({r.upi_id})
                      </td>
                      <td>
                        <strong style={{ color: "var(--accent)" }}>₹{r.amount.toLocaleString("en-IN")}</strong>
                      </td>
                      <td>
                        <span className={`pill pill-${r.status}`}>{r.status}</span>
                      </td>
                      <td>
                        {r.utr_number ? (
                          <code style={{ background: "var(--bg)", padding: "2px 6px", borderRadius: 4 }}>
                            {r.utr_number}
                          </code>
                        ) : (
                          <span className="muted">Pending disbursement</span>
                        )}
                      </td>
                      <td className="muted">
                        {new Date(r.created_at + "Z").toLocaleDateString("en-IN", { dateStyle: "medium" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "new_claim" && (
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <ClaimCashbackForm />
        </div>
      )}

      {/* Review Modal */}
      {reviewFor && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,6,12,0.7)",
            display: "grid",
            placeItems: "center",
            zIndex: 100,
            padding: 20,
          }}
          onClick={() => setReviewFor(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 500, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Review {reviewFor.deal_title}</h3>
            <p className="muted" style={{ fontSize: 14 }}>
              Order {reviewFor.external_order_id || reviewFor.order_code}. Upload your review screenshot for verification.
            </p>
            <form onSubmit={submitReview}>
              <label className="form-label">Rating *</label>
              <div style={{ display: "flex", gap: 6, fontSize: 26, cursor: "pointer" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    onClick={() => setRating(n)}
                    style={{ color: n <= rating ? "var(--warn)" : "var(--border)" }}
                    aria-label={`${n} star`}
                  >
                    ★
                  </span>
                ))}
              </div>
              <div style={{ height: 12 }} />
              <label className="form-label">Your review text *</label>
              <textarea
                className="input"
                required
                minLength={5}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Product quality, delivery speed, packaging…"
              />
              <div style={{ height: 12 }} />
              <label className="form-label">Live Review Screenshot (PNG/JPG — OCR auto-scanned)</label>
              <input
                className="input"
                type="file"
                accept="image/*"
                onChange={(e) => setShot(e.target.files?.[0] ?? null)}
              />
              <div style={{ height: 16 }} />
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" disabled={reviewBusy} style={{ flex: 1 }}>
                  {reviewBusy ? "Submitting…" : "Submit Review Proof"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setReviewFor(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundFor && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,6,12,0.7)",
            display: "grid",
            placeItems: "center",
            zIndex: 100,
            padding: 20,
          }}
          onClick={() => setRefundFor(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 480, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Refund for {refundFor.external_order_id || refundFor.order_code}</h3>
            <p className="muted" style={{ fontSize: 14 }}>
              {refundFor.deal_title} — ₹{refundFor.total.toLocaleString("en-IN")}
            </p>
            <form onSubmit={submitRefund}>
              <label className="form-label">Reason *</label>
              <select
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <div style={{ height: 12 }} />
              <label className="form-label">Details (optional)</label>
              <textarea
                className="input"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Tell us what happened…"
              />
              <div style={{ height: 16 }} />
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" disabled={busy} style={{ flex: 1 }}>
                  {busy ? "Submitting…" : "Submit refund request"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRefundFor(null)}
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
