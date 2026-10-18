import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <div>
      {session?.role === "admin" && (
        <div className="container">
          <div className="admin-tabs" style={{ marginTop: 24, marginBottom: 20 }}>
            <a href="/admin">📊 Dashboard</a>
            <a href="/admin/deals">🏷️ Deals & Slots</a>
            <a href="/admin/orders">📦 Order Proofs</a>
            <a href="/admin/reimbursements">💸 Reimbursements & Payouts</a>
            <a href="/admin/reviews">⭐ Reviews</a>
            <a href="/admin/refunds">↩️ Refunds</a>
            <a href="/admin/users">👥 Users</a>
            <a href="/admin/settings">⚙️ Settings</a>
            <a href="/" style={{ marginLeft: "auto" }}>
              ← View Site
            </a>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
