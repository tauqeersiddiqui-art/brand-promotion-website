"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Login failed.");
        return;
      }
      if (d.user.role !== "admin") {
        setError("This account is not an administrator.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Admin login</h1>
        <p className="sub">Access to the Brand Promotion control panel.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <label className="form-label">Admin email</label>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@brandpromotion.in"
          />
          <div style={{ height: 12 }} />
          <label className="form-label">Password</label>
          <input
            className="input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <div style={{ height: 18 }} />
          <button className="btn btn-block" disabled={busy}>
            {busy ? "Signing in…" : "Login to dashboard"}
          </button>
        </form>
        <p className="auth-switch" style={{ marginTop: 14 }}>
          Not the owner? <Link href="/login">User login</Link>
        </p>
      </div>
    </div>
  );
}
