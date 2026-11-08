"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import GoogleButton from "@/components/GoogleButton";
import { formatPhoneDisplay } from "@/lib/phone";

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

type Tab = "email" | "phone";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || params.get("redirect") || "";
  const oauthError = params.get("error");

  // Email mode state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Phone/OTP mode state
  const [activeTab, setActiveTab] = useState<Tab>("email");
  const [rawPhone, setRawPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpMessage, setOtpMessage] = useState("");
  const [debugCode, setDebugCode] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Ensure CSRF cookie is set on mount
  useEffect(() => {
    fetch("/api/csrf").catch(() => {});
  }, []);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const t = setTimeout(() => setOtpCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCountdown]);

  async function sendOtp() {
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    setBusy(true);
    setError("");
    setOtpMessage("");
    try {
      const r = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ phone: rawPhone, purpose: "login" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || "Failed to send OTP.");
        return;
      }
      setOtpSent(true);
      setOtpCountdown(60);
      // Show appropriate message based on delivery method
      const deliveryMethod = d.delivery === "telegram" ? "Telegram" : "SMS";
      setOtpMessage(`OTP sent! Check your ${deliveryMethod}.`);
      // Debug mode: capture OTP code if returned by API
      if (d.debug && d.code) {
        setDebugCode(d.code);
      }
    } catch {
      setError("Network error sending OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtpAndLogin() {
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!otpCode || otpCode.length !== 6) {
      setError("Enter the 6-digit OTP code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ phone: rawPhone, code: otpCode, purpose: "login" }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "OTP verification failed.");
        return;
      }
      const target =
        d.user.role === "admin"
          ? "/admin"
          : next || (d.user.role === "mediator" ? "/mediator" : "/account");
      router.push(target);
      router.refresh();
    } catch {
      setError("Network error verifying OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(e: React.FormEvent) {
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

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--surface-soft)", borderRadius: "var(--radius)", padding: 4 }}>
          <button
            type="button"
            onClick={() => { setActiveTab("email"); setError(""); setOtpSent(false); }}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: "calc(var(--radius) - 4px)",
              border: "none",
              cursor: "pointer",
              fontWeight: activeTab === "email" ? 700 : 500,
              fontSize: 14,
              background: activeTab === "email" ? "var(--brand)" : "transparent",
              color: activeTab === "email" ? "#fff" : "var(--ink-soft)",
              transition: "all .15s ease",
            }}
          >
            📧 Email &amp; Password
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab("phone"); setError(""); setOtpSent(false); setOtpCode(""); }}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: "calc(var(--radius) - 4px)",
              border: "none",
              cursor: "pointer",
              fontWeight: activeTab === "phone" ? 700 : 500,
              fontSize: 14,
              background: activeTab === "phone" ? "var(--brand)" : "transparent",
              color: activeTab === "phone" ? "#fff" : "var(--ink-soft)",
              transition: "all .15s ease",
            }}
          >
            📱 Phone (OTP)
          </button>
        </div>

        {activeTab === "email" ? (
          <form onSubmit={submitEmail}>
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
            <div style={{ position: "relative" }}>
              <label className="form-label">Password</label>
              <input
                className="input"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute",
                  right: 10,
                  bottom: 28,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 16,
                  lineHeight: 1,
                  color: "var(--ink-soft)",
                }}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
            <div style={{ height: 18 }} />
            <button className="btn btn-block" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : (
          <div>
            {!otpSent ? (
              <>
                <label className="form-label">Mobile Number</label>
                <input
                  className="input phone-example"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  pattern="[0-9]{10}"
                  value={rawPhone}
                  onChange={(e) => setRawPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="9876543210"
                  style={{ fontFamily: "monospace", letterSpacing: 2, fontSize: 18 }}
                />
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Enter your 10-digit Indian mobile number. We'll send a 6-digit OTP via SMS.
                </p>
                <div style={{ height: 18 }} />
                <button
                  className="btn btn-block"
                  disabled={busy || rawPhone.replace(/\D/g, "").length !== 10}
                  onClick={sendOtp}
                >
                  {busy ? "Sending OTP…" : "Send OTP"}
                </button>
              </>
            ) : (
              <>
                <p className="muted" style={{ marginBottom: 4, fontSize: 13 }}>
                  OTP sent to <strong>{formatPhoneDisplay(rawPhone)}</strong>
                  {otpCountdown > 0 && (
                    <span style={{ marginLeft: 8, color: "var(--brand)" }}>Resend in {otpCountdown}s</span>
                  )}
                </p>
                {otpMessage && <p className="muted" style={{ fontSize: 12, color: "var(--brand)", marginBottom: 8 }}>{otpMessage}</p>}
                {/* Dev-only OTP display */}
                {debugCode && (
                  <div className="alert alert-warning" style={{ background: "rgba(255, 153, 0, 0.1)", border: "1px solid rgba(255, 153, 0, 0.3)", marginBottom: 8 }}>
                    <strong>Debug OTP:</strong> {debugCode}
                  </div>
                )}
                <label className="form-label">Enter 6-Digit OTP</label>
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="● ● ● ● ● ●"
                  autoFocus
                  style={{ fontFamily: "monospace", letterSpacing: 8, fontSize: 20, textAlign: "center" }}
                />
                <div style={{ height: 12 }} />
                <button
                  className="btn btn-block"
                  disabled={busy || otpCode.length !== 6}
                  onClick={verifyOtpAndLogin}
                >
                  {busy ? "Verifying…" : "Verify &amp; Sign in"}
                </button>
                <div style={{ height: 10 }} />
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  disabled={busy || otpCountdown > 0}
                  onClick={sendOtp}
                >
                  {otpCountdown > 0 ? `Resend OTP (${otpCountdown}s)` : "Resend OTP"}
                </button>
              </>
            )}
          </div>
        )}

        <div style={{ height: 16 }} />
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
