"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ClaimRefundForm from "@/components/ClaimRefundForm";

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
  refunds?: { id: number; refund_code: string; reason: string; status: string }[];
  review?: { review_code: string; status: string; rating: number };
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

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState<"orders" | "reimbursements" | "new_claim">("orders");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [refundFor, setRefundFor] = useState<Order | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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

  return (
    <div className="container" style={{ paddingTop: 36, paddingBottom: 60 }}>
      <div className="admin-head">
        <div>
          <h1>Reviewer dashboard</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Manage your submitted campaign orders, review proofs, and track UPI refund disbursements.
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
          Refunds &amp; payouts ({reimbursements.length})
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
                    const reviewEligible = o.status === "confirmed" && !o.review;
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
                          <span className="muted" style={{ fontSize: 12 }}>
                            —
                          </span>
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
                            {!reviewEligible && o.status === "confirmed" && !activeRefund && (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 12, padding: "5px 10px" }}
                                onClick={() => {
                                  setRefundFor(o);
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
              <h3>No refund claims recorded yet</h3>
              <p className="muted">
                Once you post your 5-star review on Amazon/Flipkart, claim your refund here.
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
          <ClaimRefundForm />
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
            style={{ maxWidth: 640, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Submit refund form</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setRefundFor(null)}
                style={{ padding: "2px 8px" }}
              >
                ✕
              </button>
            </div>
            <p className="muted" style={{ margin: "0 0 16px", fontSize: 13.5 }}>
              {refundFor.deal_title} — Order {refundFor.external_order_id || refundFor.order_code} · ₹{refundFor.total.toLocaleString("en-IN")}. Post your review on Amazon/Flipkart, then submit the order, review and seller feedback screenshots below.
            </p>
            <ClaimRefundForm
              initialOrderId={refundFor.external_order_id || refundFor.order_code}
              onSuccess={() => setRefundFor(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
