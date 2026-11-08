"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Stats = {
  deals: number;
  activeDeals: number;
  users: number;
  orders: number;
  pendingOrders: number;
  verifiedOrders: number;
  reimbursements: number;
  pendingReimbursements: number;
  paidReimbursements: number;
  totalDisbursed: number;
  totalOrderValue: number;
  pendingReviews: number;
  pendingRefunds: number;
  recentOrders: {
    id: number;
    order_code: string;
    external_order_id?: string;
    platform?: string;
    reviewer_name?: string;
    full_name: string;
    total: number;
    status: string;
    created_at: string;
    deal_title: string;
  }[];
  recentReimbursements: {
    id: number;
    reimbursement_code: string;
    external_order_id?: string;
    reviewer_name?: string;
    upi_id?: string;
    amount: number;
    status: string;
    created_at: string;
    deal_title: string;
  }[];
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Failed");
        return r.json();
      })
      .then(setStats)
      .catch((e) => setErr(String(e.message)));
  }, []);

  if (err) {
    return (
      <div className="container" style={{ paddingTop: 40 }}>
        <div className="alert alert-error">{err}</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="container" style={{ paddingTop: 40 }}>
        <p className="muted">Loading dashboard…</p>
      </div>
    );
  }

  const cards = [
    { label: "Active campaigns", value: `${stats.activeDeals}/${stats.deals}`, color: "var(--brand)" },
    { label: "Total reviewers / users", value: stats.users, color: "var(--ink)" },
    { label: "Order proofs submitted", value: stats.orders, color: "var(--ink)" },
    { label: "Confirmed orders", value: stats.pendingOrders, color: "var(--accent)" },
    { label: "Reimbursement claims", value: stats.reimbursements, color: "var(--ink)" },
    { label: "Pending refund payouts", value: stats.pendingReimbursements, color: "var(--accent)" },
    { label: "Total refund disbursed", value: `₹${stats.totalDisbursed.toLocaleString("en-IN")}`, color: "var(--accent)" },
    { label: "Promotional order volume", value: `₹${stats.totalOrderValue.toLocaleString("en-IN")}`, color: "var(--ink-soft)" },
  ];

  return (
    <div className="container" style={{ paddingTop: 10, paddingBottom: 60 }}>
      <div className="admin-head">
        <div>
          <h1>Admin overview &amp; operations</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Real-time influencer campaign metrics, review verifications, and UPI refund disbursement pipeline.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn btn-outline btn-sm" href="/api/admin/export?type=orders">
            Export orders CSV
          </a>
          <a className="btn btn-outline btn-sm" href="/api/admin/export?type=reimbursements">
            Export payouts CSV
          </a>
          <Link href="/admin/deals" className="btn btn-sm">
            Create campaign
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="deal-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        {cards.map((c) => (
          <div className="card" key={c.label} style={{ textAlign: "center", padding: "20px 16px" }}>
            <div style={{ fontSize: 20, marginBottom: 6, fontWeight: 800, color: c.color || "var(--brand)" }}>{c.label.slice(0,1).toUpperCase()}</div>
            <div className="stat-num" style={{ color: c.color, fontSize: 22, fontWeight: 700 }}>
              {c.value}
            </div>
            <div className="stat-label" style={{ fontSize: 12, marginTop: 4 }}>
              {c.label}
            </div>
          </div>
        ))}
      </div>

      {/* Two Column Section for Recent Submissions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 32 }}>
        {/* Recent Order Proofs */}
        <div>
          <div className="section-head" style={{ marginBottom: 12 }}>
            <h3>Recent order submissions</h3>
            <a className="link" href="/admin/orders" style={{ fontSize: 13 }}>
              View all ({stats.orders}) →
            </a>
          </div>
          {stats.recentOrders.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p className="muted">No order proofs submitted yet.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="tbl tbl-compact" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>Order & Platform</th>
                    <th>Reviewer</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentOrders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.external_order_id || o.order_code}</strong>
                        <div className="muted" style={{ fontSize: 10, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                          {o.platform || "Amazon"} · {o.deal_title?.slice(0, 18)}{o.deal_title?.length > 18 ? "…" : ""}
                        </div>
                      </td>
                      <td style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.reviewer_name || o.full_name}
                      </td>
                      <td>
                        <strong style={{ color: "var(--accent)" }}>
                          ₹{o.total.toLocaleString("en-IN")}
                        </strong>
                      </td>
                      <td>
                        <span className={`pill pill-${o.status}`} style={{ fontSize: 10 }}>
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Reimbursement Claims */}
        <div>
          <div className="section-head" style={{ marginBottom: 12 }}>
            <h3>Recent refund claims</h3>
            <a className="link" href="/admin/reimbursements" style={{ fontSize: 13 }}>
              Process payouts ({stats.pendingReimbursements} pending) →
            </a>
          </div>
          {stats.recentReimbursements && stats.recentReimbursements.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p className="muted">No reimbursement claims yet.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="tbl tbl-compact" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>Claim Code</th>
                    <th>Reviewer</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.recentReimbursements || []).map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.reimbursement_code}</strong>
                        <div className="muted" style={{ fontSize: 10, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>
                          {r.external_order_id?.slice(0, 16) || "Order"}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 12 }}>{r.reviewer_name || "Reviewer"}</div>
                        {r.upi_id && (
                          <div className="muted" style={{ fontSize: 10 }}>{r.upi_id}</div>
                        )}
                      </td>
                      <td>
                        <strong style={{ color: "var(--accent)" }}>
                          ₹{r.amount.toLocaleString("en-IN")}
                        </strong>
                      </td>
                      <td>
                        <span className={`pill pill-${r.status}`} style={{ fontSize: 10 }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
