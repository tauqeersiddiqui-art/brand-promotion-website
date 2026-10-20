"use client";

import { useCallback, useEffect, useState } from "react";

type User = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  mediator_code: string;
  mediator_status: string;
  created_at: string;
  order_count: number;
};

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

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [msg, setMsg] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/csrf").catch(() => {});
  }, []);

  async function updateUser(id: number, fields: Record<string, string>) {
    setSavingId(id);
    setMsg("");
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      const r = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: getCsrfHeader(),
        body: fd,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(d.error || `Update failed (${r.status}).`);
        return;
      }
      setMsg(`Account updated. ${d.note || ""}`.trim());
      load();
    } catch {
      setMsg("Network error while updating the account.");
    } finally {
      setSavingId(null);
    }
  }

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

      {msg && <div className="alert alert-success">{msg}</div>}

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
                <th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Mediator</th><th>Orders</th><th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td>{u.email}</td>
                  <td>{u.phone || "—"}</td>
                  <td>
                    <select
                      className="input"
                      value={u.role}
                      disabled={savingId === u.id}
                      onChange={(e) => updateUser(u.id, { role: e.target.value })}
                      style={{ minWidth: 110 }}
                    >
                      <option value="user">user</option>
                      <option value="mediator">mediator</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>
                    {u.role === "mediator" || u.mediator_code ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <code style={{ fontSize: 12 }}>{u.mediator_code || "—"}</code>
                        <select
                          className="input"
                          value={u.mediator_status || "active"}
                          disabled={savingId === u.id || u.role !== "mediator"}
                          onChange={(e) => updateUser(u.id, { mediator_status: e.target.value })}
                          style={{ minWidth: 110 }}
                        >
                          <option value="active">active</option>
                          <option value="suspended">suspended</option>
                        </select>
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
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
