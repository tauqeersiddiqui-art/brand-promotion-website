"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSessionUser } from "./useSessionUser";
import LoginRequired from "./LoginRequired";

type TrackingResult = {
  found: boolean;
  type?: "single" | "multiple";
  order?: {
    order_code: string;
    external_order_id: string;
    product_code: string;
    platform: string;
    deal_title: string;
    deal_image: string;
    reviewer_name: string;
    mediator_name: string;
    total: number;
    order_date: string;
    status: string;
    ocr_order_match: number;
    created_at: string;
  };
  reimbursements?: {
    reimbursement_code: string;
    amount: number;
    payout_method: string;
    upi_id: string;
    status: string;
    utr_number: string;
    admin_note: string;
    created_at: string;
  }[];
  orders?: {
    order_code: string;
    external_order_id: string;
    deal_title: string;
    status: string;
    total: number;
    created_at: string;
  }[];
};

export default function QuickTrackForm({ initialQuery }: { initialQuery?: string }) {
  const { user, loading: authLoading } = useSessionUser();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery || "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState("");

  async function handleTrack(searchVal: string) {
    if (!searchVal.trim()) return;
    setBusy(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`/api/track?q=${encodeURIComponent(searchVal.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No records found matching your query.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error while checking status. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Only auto-search once the session check confirms a logged-in user;
    // otherwise the request would 401 for guests behind the login gate.
    if (initialQuery && !authLoading && user) {
      handleTrack(initialQuery);
    }
  }, [initialQuery, authLoading, user]);

  if (authLoading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <p className="muted" style={{ margin: 0 }}>Checking login status…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginRequired
        title="Log in to track your orders"
        description="Order and payout status is private to your account. Log in or create a free account to see where your submission stands."
        next={pathname && pathname !== "/" ? pathname : "/#track"}
      />
    );
  }

  return (
    <div className="card">
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 20 }}>Track savings status</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          Enter your <strong>Amazon/Flipkart Order ID</strong> (e.g. 404-1234567-1234567), <strong>Tracking Code</strong> (BP-...), or registered <strong>Phone Number</strong>.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleTrack(query);
        }}
        style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}
      >
        <input
          className="input"
          style={{ flex: 1, minWidth: 240 }}
          placeholder="e.g. 404-1234567-1234567 or 9876543210"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          required
        />
        <button className="btn" disabled={busy}>
          {busy ? "Checking…" : "Track Live →"}
        </button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {result && result.found && result.type === "single" && result.order && (
        <div style={{ marginTop: 10 }}>
          {/* Order Header Summary */}
          <div
            style={{
              background: "var(--bg-soft)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div>
                <span className="pill pill-confirmed" style={{ marginRight: 8 }}>
                  {result.order.platform}
                </span>
                <strong style={{ fontSize: 16 }}>{result.order.deal_title}</strong>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  Order ID: <span style={{ color: "var(--text)", fontWeight: 600 }}>{result.order.external_order_id}</span> · Code: {result.order.order_code}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span className={`pill pill-${result.order.status}`} style={{ fontSize: 13, textTransform: "capitalize" }}>
                  {result.order.status}
                </span>
                <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>
                  ₹{result.order.total.toLocaleString("en-IN")}
                </div>
              </div>
            </div>
          </div>

          {/* Stepped Timeline */}
          <h4 style={{ margin: "0 0 12px", fontSize: 15 }}>📋 Payout Progression</h4>
          <div className="timeline">
            {/* Step 1: Order Proof Submitted */}
            <div className="timeline-item">
              <div className="timeline-dot done">✓</div>
              <div className="timeline-content">
                <strong>1. Order Proof Submitted</strong>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                  Order proof uploaded for {result.order.platform}. Participant: {result.order.reviewer_name}.
                  {result.order.ocr_order_match === 1 && " (OCR Match Verified)"}
                </p>
              </div>
            </div>

            {/* Step 2: Order Verified */}
            <div className="timeline-item">
              <div className={`timeline-dot ${result.order.status === "confirmed" ? "done" : "active"}`}>
                {result.order.status === "confirmed" ? "✓" : "2"}
              </div>
              <div className="timeline-content">
                <strong>2. Order Verification</strong>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                  {result.order.status === "confirmed"
                    ? "Your order proof has been verified by the brand team."
                    : "Pending admin review. Usually confirmed within a few hours."}
                </p>
              </div>
            </div>

            {/* Step 3: Review & Reimbursement Submitted */}
            {result.reimbursements && result.reimbursements.length > 0 ? (
              result.reimbursements.map((rem, idx) => (
                <div className="timeline-item" key={idx}>
                  <div className={`timeline-dot ${rem.status === "paid" ? "done" : "active"}`}>
                    {rem.status === "paid" ? "✓" : "3"}
                  </div>
                  <div className="timeline-content">
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                      <strong>3. Savings Credit ({rem.reimbursement_code})</strong>
                      <span className={`pill pill-${rem.status}`}>{rem.status}</span>
                    </div>
                    <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
                      Savings: ₹{rem.amount.toLocaleString("en-IN")} via UPI ({rem.upi_id}).
                    </p>

                    {rem.status === "paid" && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: 10,
                          borderRadius: 8,
                          background: "rgba(34, 211, 165, 0.12)",
                          border: "1px solid rgba(34, 211, 165, 0.3)",
                        }}
                      >
                        <div style={{ color: "var(--accent)", fontWeight: 700, fontSize: 13.5 }}>
                          🎉 Savings Credited Successfully!
                        </div>
                        {rem.utr_number && (
                          <div style={{ fontSize: 13, marginTop: 4 }}>
                            UTR Ref: <code style={{ background: "var(--bg)", padding: "2px 6px", borderRadius: 4 }}>{rem.utr_number}</code>
                          </div>
                        )}
                        {rem.admin_note && (
                          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                            Note: {rem.admin_note}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="timeline-item">
                <div className="timeline-dot">3</div>
                <div className="timeline-content">
                  <strong>3. Submit feedback</strong>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                    Share your feedback on {result.order.platform}, then submit the order details
                    below to receive your savings.
                  </p>
                    <Link href="/claim" className="btn btn-sm btn-ghost" style={{ marginTop: 8 }}>
                      Submit feedback →
                    </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Multiple orders found via phone number */}
      {result && result.found && result.type === "multiple" && result.orders && (
        <div>
          <h4 style={{ margin: "0 0 12px" }}>Found {result.orders.length} orders for your account:</h4>
          <div style={{ display: "grid", gap: 12 }}>
            {result.orders.map((o) => (
              <div
                key={o.order_code}
                className="card"
                style={{
                  background: "var(--bg-soft)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 14,
                }}
              >
                <div>
                  <strong>{o.deal_title}</strong>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                    ID: {o.external_order_id} ({o.order_code}) · ₹{o.total}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setQuery(o.external_order_id);
                    handleTrack(o.external_order_id);
                  }}
                >
                  Track →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
