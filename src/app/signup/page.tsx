"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import GoogleButton from "@/components/GoogleButton";
import { formatPhoneDisplay } from "@/lib/phone";

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

export default function SignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || params.get("redirect") || "";

  // Email mode
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  // Phone/OTP mode
  const [activeTab, setActiveTab] = useState<Tab>("email");
  const [rawPhone, setRawPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [postOtpName, setPostOtpName] = useState("");
  const [postOtpEmail, setPostOtpEmail] = useState("");
  const [postOtpPassword, setPostOtpPassword] = useState("");
  const [showPostOtpPassword, setShowPostOtpPassword] = useState(false);
  const [hasCredentialFields, setHasCredentialFields] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/csrf").catch(() => {});
  }, []);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const t = setTimeout(() => setOtpCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCountdown]);

  async function sendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ phone: rawPhone, purpose: "signup" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || "Failed to send OTP.");
        return;
      }
      setOtpSent(true);
      setOtpCountdown(60);
    } catch {
      setError("Network error sending OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndProceed() {
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length !== 10) { setError("Please enter a valid 10-digit mobile number."); return; }
    if (!otpCode || otpCode.length !== 6) { setError("Enter the 6-digit OTP code."); return; }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ phone: rawPhone, code: otpCode, purpose: "signup" }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "OTP verification failed."); return; }
      // Auto-created user → no password yet; show credential fields for first-time setup
      if (d.user?.isNewUser) {
        setHasCredentialFields(true);
      } else {
        setError("An account already exists for this number. Please sign in instead.");
      }
    } catch {
      setError("Network error verifying OTP.");
    } finally {
      setBusy(false);
    }
  }

  async function finalizeSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!postOtpName.trim() || !postOtpEmail.trim() || !postOtpPassword.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (postOtpPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ name: postOtpName.trim(), email: postOtpEmail.trim(), phone: rawPhone, password: postOtpPassword }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Signup failed."); return; }
      router.push(next || "/account");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Signup failed."); return; }
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
        <p className="sub">Free forever. Track orders, claim refunds, and grab deals first.</p>
        {error && <div className="alert alert-error">{error}</div>}

        {/* Tab switcher */}
        {!hasCredentialFields && (
          <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--surface-soft)", borderRadius: "var(--radius)", padding: 4 }}>
            <button type="button" onClick={() => { setActiveTab("email"); setError(""); }}
              style={{ flex: 1, padding: "8px 0", borderRadius: "calc(var(--radius) - 4px)", border: "none", cursor: "pointer", fontWeight: activeTab === "email" ? 700 : 500, fontSize: 14, background: activeTab === "email" ? "var(--brand)" : "transparent", color: activeTab === "email" ? "#fff" : "var(--ink-soft)", transition: "all .15s ease" }}>
              📧 Email &amp; Password
            </button>
            <button type="button" onClick={() => { setActiveTab("phone"); setError(""); setOtpSent(false); setOtpCode(""); }}
              style={{ flex: 1, padding: "8px 0", borderRadius: "calc(var(--radius) - 4px)", border: "none", cursor: "pointer", fontWeight: activeTab === "phone" ? 700 : 500, fontSize: 14, background: activeTab === "phone" ? "var(--brand)" : "transparent", color: activeTab === "phone" ? "#fff" : "var(--ink-soft)", transition: "all .15s ease" }}>
              📱 Phone (OTP)
            </button>
          </div>
        )}

        {hasCredentialFields ? (
          /* Step 2: Set credentials after OTP verified */
          <form onSubmit={finalizeSignup}>
            <label className="form-label">Full name *</label>
            <input className="input" required minLength={2} value={postOtpName} onChange={(e) => setPostOtpName(e.target.value)} placeholder="Your name" />
            <div style={{ height: 12 }} />
            <label className="form-label">Email *</label>
            <input className="input" type="email" required value={postOtpEmail} onChange={(e) => setPostOtpEmail(e.target.value)} placeholder="you@example.com" />
            <div style={{ height: 12 }} />
            <div style={{ position: "relative" }}>
              <label className="form-label">Password * (min 8 chars, letters + numbers)</label>
              <input className="input" type={showPostOtpPassword ? "text" : "password"} required minLength={8} value={postOtpPassword} onChange={(e) => setPostOtpPassword(e.target.value)} placeholder="••••••••" style={{ paddingRight: 44 }} />
              <button type="button" tabIndex={-1} onClick={() => setShowPostOtpPassword((v) => !v)}
                style={{ position: "absolute", right: 10, bottom: 28, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 16, lineHeight: 1, color: "var(--ink-soft)" }} title={showPostOtpPassword ? "Hide password" : "Show password"}>
                {showPostOtpPassword ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Your account was created via <strong>{formatPhoneDisplay(rawPhone)}</strong>. Set your email and password to complete registration.
            </p>
            <div style={{ height: 18 }} />
            <button className="btn btn-block" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
          </form>
        ) : activeTab === "email" ? (
          <form onSubmit={submitEmail}>
            <label className="form-label">Full name *</label>
            <input className="input" required minLength={2} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" />
            <div style={{ height: 12 }} />
            <label className="form-label">Email *</label>
            <input className="input" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" />
            <div style={{ height: 12 }} />
            <div style={{ position: "relative" }}>
              <label className="form-label">Password * (min 8 chars, letters + numbers)</label>
              <input className="input" type={showPassword ? "text" : "password"} required minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" style={{ paddingRight: 44 }} />
              <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)}
                style={{ position: "absolute", right: 10, bottom: 28, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 16, lineHeight: 1, color: "var(--ink-soft)" }} title={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
            <div style={{ height: 18 }} />
            <button className="btn btn-block" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
          </form>
        ) : (
          /* Phone OTP flow */
          <div>
            {!otpSent ? (
              <>
                <label className="form-label">Mobile Number *</label>
                <input className="input" type="tel" inputMode="numeric" maxLength={10} pattern="[0-9]{10}" value={rawPhone}
                  onChange={(e) => setRawPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="9876543210" style={{ fontFamily: "monospace", letterSpacing: 2, fontSize: 18 }} />
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Enter your 10-digit Indian mobile number. We'll send a 6-digit OTP via SMS.
                </p>
                <div style={{ height: 18 }} />
                <button className="btn btn-block" disabled={busy || rawPhone.replace(/\D/g, "").length !== 10} onClick={sendOtp}>
                  {busy ? "Sending OTP…" : "Send OTP"}
                </button>
              </>
            ) : (
              <>
                <p className="muted" style={{ marginBottom: 4, fontSize: 13 }}>
                  OTP sent to <strong>{formatPhoneDisplay(rawPhone)}</strong>
                  {otpCountdown > 0 && <span style={{ marginLeft: 8, color: "var(--brand)" }}>Resend in {otpCountdown}s</span>}
                </p>
                <label className="form-label">Enter 6-Digit OTP</label>
                <input className="input" type="text" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="● ● ● ● ● ●" autoFocus style={{ fontFamily: "monospace", letterSpacing: 8, fontSize: 20, textAlign: "center" }} />
                <div style={{ height: 12 }} />
                <button className="btn btn-block" disabled={busy || otpCode.length !== 6} onClick={verifyAndProceed}>
                  {busy ? "Verifying…" : "Verify"}
                </button>
                <div style={{ height: 10 }} />
                <button type="button" className="btn btn-ghost btn-block" disabled={busy || otpCountdown > 0} onClick={sendOtp}>
                  {otpCountdown > 0 ? `Resend OTP (${otpCountdown}s)` : "Resend OTP"}
                </button>
              </>
            )}
          </div>
        )}

        <div style={{ height: 16 }} />
        <GoogleButton />
        <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
