"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import GoogleButton from "@/components/GoogleButton";

const OAUTH_MESSAGES: Record<string, string> = {
  "google-not-configured": "Google sign-in is not set up on this server yet.",
  "access_denied": "Google sign-in was cancelled.",
  "Sign-in session expired. Please try again.": "Sign-in session expired. Please try again.",
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

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || params.get("redirect") || "";
  const oauthError = params.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      const target =
        d.user.role === "admin"
          ? "/admin"
          : next || (d.user.role === "mediator" ? "/mediator" : "/account");
      router.push(target);
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
        <h1>Welcome back</h1>
        <p className="sub">Sign in to track orders and claim refunds faster.</p>

        {oauthError && (
          <div className="alert alert-error">
            {OAUTH_MESSAGES[oauthError] || decodeURIComponent(oauthError)}
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={submit}>
          <label className="form-label">Email</label>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
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
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <GoogleButton next={next} />

        <p className="auth-switch">
          New here? <Link href="/signup">Create a free account</Link>
        </p>
        <p className="auth-switch" style={{ marginTop: 4 }}>
          Are you the owner? <Link href="/admin/login">Admin login</Link>
        </p>
        <p className="auth-switch" style={{ marginTop: 4 }}>
          Approved mediator? <Link href="/login?next=/mediator">Mediator login</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-wrap"><p className="muted">Loading…</p></div>}>
      <LoginForm />
    </Suspense>
  );
}
