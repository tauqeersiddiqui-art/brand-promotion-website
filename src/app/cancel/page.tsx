"use client";

import { useState } from "react";
import Link from "next/link";

export default function CancelPage() {
  const [orderCode, setOrderCode] = useState("");
  const [email, setEmail] = useState("");
  const [orderData, setOrderData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOrderData(null);
    setSuccess("");

    try {
      const params = new URLSearchParams();
      if (orderCode) params.set("order_code", orderCode);
      if (email) params.set("email", email);

      const r = await fetch(`/api/orders-search?${params.toString()}`);

      const data = await r.json();

      if (!r.ok) {
        setError(data.error || "Order not found");
        return;
      }

      setOrderData(data.order);
    } catch {
      setError("Failed to fetch order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!orderData) return;

    try {
      const r = await fetch(`/api/refunds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_id: orderData.id,
          reason: "Customer requested cancellation",
        }),
      });

      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Failed to submit cancellation request");
        return;
      }

      setSuccess("Cancellation request submitted successfully. Our team will review and process it within 24 hours.");
      // Refresh order data
      const params = new URLSearchParams();
      if (orderCode) params.set("order_code", orderCode);
      if (email) params.set("email", email);

      const orderR = await fetch(`/api/orders-search?${params.toString()}`);
      const orderDataR = await orderR.json();
      if (orderR.ok && orderDataR.order) {
        setOrderData(orderDataR.order);
      }
    } catch {
      setError("Failed to submit cancellation. Please try again.");
    }
  };

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60, maxWidth: 700 }}>
      <nav style={{ marginBottom: 24, fontSize: 14 }}>
        <Link href="/">Home</Link> {" > "} <span style={{ color: "var(--ink-soft)" }}>Cancel Order</span>
      </nav>

      <h1 style={{ fontSize: "clamp(28px, 5vw, 40px)", marginBottom: 12 }}>
        Cancel Your Order
      </h1>
      <p style={{ color: "var(--ink-soft)", marginBottom: 32, fontSize: 16 }}>
        Enter your order code and email to view your order details and request cancellation.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 12, marginBottom: 32 }}>
        <input
          className="input"
          placeholder="Order code (e.g., BP-XXXXXX)"
          value={orderCode}
          onChange={(e) => setOrderCode(e.target.value)}
          required
          style={{ flex: 1 }}
        />
        <input
          className="input"
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn" disabled={loading}>
          {loading ? "Searching..." : "Search Order"}
        </button>
      </form>

      {error && (
        <div style={{ background: "var(--danger-soft)", color: "var(--danger)", padding: 16, borderRadius: "var(--radius)", marginBottom: 24 }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ background: "var(--accent-soft)", color: "var(--accent)", padding: 16, borderRadius: "var(--radius)", marginBottom: 24 }}>
          {success}
        </div>
      )}

      {orderData && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h2 style={{ marginBottom: 20, fontSize: 20 }}>Order Details</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--ink-soft)" }}>Order Code</span>
              <strong>{orderData.order_code}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--ink-soft)" }}>Deal</span>
              <span>{orderData.deal_title}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--ink-soft)" }}>Platform</span>
              <span>{orderData.platform}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--ink-soft)" }}>Total Amount</span>
              <strong>₹{orderData.total?.toLocaleString("en-IN") || "N/A"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
              <span style={{ color: "var(--ink-soft)" }}>Status</span>
              <span className={`badge ${orderData.status === 'confirmed' ? 'badge-warning' : 'badge-success'}`}>
                {orderData.status || 'N/A'}
              </span>
            </div>
          </div>

          {orderData.cancellable && (
            <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
              <p style={{ color: "var(--ink-soft)", marginBottom: 16, fontSize: 14 }}>
                You can cancel this order at any time before it's processed.
              </p>
              <button className="btn" onClick={handleCancel} style={{ background: "var(--danger)" }}>
                Request Cancellation
              </button>
            </div>
          )}
        </div>
      )}

      {!orderData && !error && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ink-soft)" }}>
          <p>Your order details will appear here after searching.</p>
        </div>
      )}
    </div>
  );
}