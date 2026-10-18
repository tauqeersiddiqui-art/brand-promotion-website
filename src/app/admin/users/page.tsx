"use client";

import { useCallback, useEffect, useState } from "react";

type User = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  created_at: string;
  order_count: number;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ search, page: String(page) });
    try {
      const r = await fetch(`/api/admin/users?${qs}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setUsers([]);
        setLoadError(d.error || `Failed to load users (${r.status}).`);
        return;
      }
      const d = await r.json();
      setUsers(d.users ?? []);
      setPages(d.pages ?? 1);
      setLoadError("");
    } catch {
      setUsers([]);
      setLoadError("Network error while loading users.");
    }
  }, [search, page]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <div className="container" style={{ paddingTop: 10 }}>
      <div className="admin-head">
        <h1>Users</h1>
      </div>

      <div className="toolbar">
        <input
          className="input"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {loadError ? (
        <div className="alert alert-error">{loadError}</div>
      ) : users === null ? (
        <p className="muted">Loading…</p>
      ) : users.length === 0 ? (
        <p className="muted">No users found.</p>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Orders</th><th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td>{u.email}</td>
                  <td>{u.phone || "—"}</td>
                  <td>
                    <span className={`pill ${u.role === "admin" ? "pill-approved" : "pill-confirmed"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>{u.order_count}</td>
                  <td className="muted">
                    {new Date(u.created_at + "Z").toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="toolbar" style={{ justifyContent: "center", marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </button>
          <span className="muted">Page {page} of {pages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
