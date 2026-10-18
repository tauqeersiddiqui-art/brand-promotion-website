"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import GoogleButton from "@/components/GoogleButton";

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

export default function SignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || params.get("redirect") || "";
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Ensure CSRF cookie is set on mount
  useEffect(() => {
    fetch("/api/csrf").catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Signup failed.");
        return;
      }
      router.push(next || "/account");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Create your account</h1>
        <p className="sub">Free forever. Track orders, claim cashback, and grab deals first.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <label className="form-label">Full name *</label>
          <input
            className="input"
            required
            minLength={2}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Your name"
          />
          <div style={{ height: 12 }} />
          <label className="form-label">Email *</label>
          <input
            className="input"
            type="email"
            required
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="you@example.com"
          />
          <div style={{ height: 12 }} />
          <label className="form-label">Phone (optional)</label>
          <input
            className="input"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="98765 43210"
          />
          <div style={{ height: 12 }} />
          <label className="form-label">Password * (min 8 chars)</label>
          <input
            className="input"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="••••••••"
          />
          <div style={{ height: 18 }} />
          <button className="btn btn-block" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>
        <GoogleButton />
        <p className="auth-switch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
