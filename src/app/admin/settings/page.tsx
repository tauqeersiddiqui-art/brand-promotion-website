"use client";

import { useEffect, useState } from "react";
import type { SiteSettings } from "@/lib/settings";

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

const FIELDS: { key: keyof SiteSettings; label: string; hint?: string; textarea?: boolean; rows?: number }[] = [
  { key: "site_name", label: "Site Name", hint: "Brand platform brand name" },
  { key: "tagline", label: "Tagline", hint: "Shown under the site name and in Google results" },
  { key: "announcement", label: "Announcement Banner", hint: "Leave empty to hide the top banner", textarea: true, rows: 2 },
  { key: "whatsapp", label: "WhatsApp Support Number", hint: "With country code, digits only — e.g. 919876543210" },
  { key: "telegram", label: "Telegram Channel / VIP Username", hint: "Without @ — e.g. brandpromotion" },
  { key: "support_email", label: "Support Email", hint: "Reviewer helpdesk email" },
  { key: "instagram", label: "Instagram Handle (optional)", hint: "Without @" },
  { key: "mediators", label: "Registered Mediators / Agencies", hint: "Comma-separated mediator names (e.g. Direct, Amit Mediator, Rahul Agency, VIP Campaigns)", textarea: true, rows: 2 },
  { key: "rules_instructions", label: "Global Campaign & Reimbursement Instructions", hint: "Markdown/bulleted rules displayed on deal cards, submit forms, and terms page", textarea: true, rows: 5 },
];

export default function AdminSettingsPage() {
  const [s, setS] = useState<SiteSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [loadError, setLoadError] = useState("");

  // Password reset state
  const [resetMode, setResetMode] = useState<"none" | "current" | "emergency">("none");
  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [emergencyKey, setEmergencyKey] = useState("");
  const [showEmergencyKey, setShowEmergencyKey] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d?.settings) {
          setS(d.settings);
          setLoadError("");
        } else {
          setLoadError(d?.error || "Failed to load settings.");
        }
      })
      .catch(() => setLoadError("Network error while loading settings."));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify(s),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg({ type: "err", text: d.error || "Save failed." });
      } else {
        setMsg({ type: "ok", text: "Settings saved ✅ — refresh the site to see changes." });
      }
    } catch {
      setMsg({ type: "err", text: "Network error while saving. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(mode: "current" | "emergency") {
    setResetBusy(true);
    setResetMsg(null);

    try {
      const body: Record<string, unknown> = {
        newPassword,
      };
      if (mode === "current") {
        body.currentPassword = currentPassword;
      } else {
        body.key = emergencyKey;
      }

      const r = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));

      if (!r.ok) {
        setResetMsg({ type: "err", text: d.error || "Password reset failed." });
      } else {
        setResetMsg({ type: "ok", text: d.message || "Password reset successfully." });
        setResetMode("none");
        setCurrentPassword("");
        setNewPassword("");
        setEmergencyKey("");
      }
    } catch {
      setResetMsg({ type: "err", text: "Network error. Please try again." });
    } finally {
      setResetBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="container" style={{ paddingTop: 10 }}>
        <div className="alert alert-error">{loadError}</div>
      </div>
    );
  }

  if (!s) {
    return (
      <div className="container" style={{ paddingTop: 10 }}>
        <p className="muted">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 10, maxWidth: 760, paddingBottom: 60 }}>
      <div className="admin-head">
        <div>
          <h1>⚙️ Brand Platform Settings</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Configure site metadata, WhatsApp/Telegram integration, agency mediators list, and reimbursement instructions.
          </p>
        </div>
      </div>

      {msg && (
        <div className={`alert ${msg.type === "ok" ? "alert-success" : "alert-error"}`}>
          {msg.text}
        </div>
      )}

      <form onSubmit={save} className="card" style={{ padding: 28 }}>
        {FIELDS.map((f) => (
          <div key={f.key} style={{ marginBottom: 18 }}>
            <label className="form-label">{f.label}</label>
            {f.textarea ? (
              <textarea
                className="input"
                rows={f.rows || 3}
                value={s[f.key] || ""}
                onChange={(e) => setS({ ...s, [f.key]: e.target.value })}
              />
            ) : (
              <input
                className="input"
                value={s[f.key] || ""}
                onChange={(e) => setS({ ...s, [f.key]: e.target.value })}
              />
            )}
            {f.hint && (
              <p className="muted" style={{ fontSize: 12, margin: "4px 0 0 2px" }}>
                {f.hint}
              </p>
            )}
          </div>
        ))}
        <button className="btn" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>
          {busy ? "Saving…" : "💾 Save Platform Settings"}
        </button>
      </form>

      {/* Password Reset Section */}
      <div className="card" style={{ padding: 28, marginTop: 24 }}>
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>🔑 Admin Password Reset</h2>

        {resetMode === "none" && (
          <button
            className="btn btn-secondary"
            onClick={() => setResetMode("current")}
            style={{ marginBottom: 12 }}
          >
            Reset with Current Password
          </button>
        )}

        {resetMode === "none" && (
          <div style={{ padding: 12, backgroundColor: "#fff5f5", borderRadius: 4, marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13 }}>
              <strong>Emergency access:</strong> If you've lost the password, set <code>RESET_PASSWORD_KEY</code>
              in Railway environment variables, then use that key to reset without the current password.
            </p>
          </div>
        )}

        {(resetMode === "current" || resetMode === "emergency") && (
          <div style={{ border: "1px solid #e0e0e0", borderRadius: 4, padding: 16, marginBottom: 12 }}>
            {resetMode === "current" && (
              <div style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ marginBottom: 4 }}>Current Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    className="input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowCurrentPassword((v) => !v)}
                    style={{
                      position: "absolute",
                      right: 10,
                      bottom: 8,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 16,
                      lineHeight: 1,
                      color: "var(--ink-soft)",
                    }}
                    title={showCurrentPassword ? "Hide password" : "Show password"}
                  >
                    {showCurrentPassword ? "👁️" : "👁️‍🗨️"}
                  </button>
                </div>
              </div>
            )}

            {resetMode === "emergency" && (
              <div style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ marginBottom: 4 }}>Emergency Reset Key</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showEmergencyKey ? "text" : "password"}
                    className="input"
                    value={emergencyKey}
                    onChange={(e) => setEmergencyKey(e.target.value)}
                    placeholder="Enter RESET_PASSWORD_KEY from Railsway env"
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowEmergencyKey((v) => !v)}
                    style={{
                      position: "absolute",
                      right: 10,
                      bottom: 8,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 16,
                      lineHeight: 1,
                      color: "var(--ink-soft)",
                    }}
                    title={showEmergencyKey ? "Hide key" : "Show key"}
                  >
                    {showEmergencyKey ? "👁️" : "👁️‍🗨️"}
                  </button>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label className="form-label" style={{ marginBottom: 4 }}>New Password (min 8 characters)</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showNewPassword ? "text" : "password"}
                  className="input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowNewPassword((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 10,
                    bottom: 8,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: 16,
                    lineHeight: 1,
                    color: "var(--ink-soft)",
                  }}
                  title={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn"
                onClick={() => setResetMode("none")}
                style={{ flex: 1 }}
                disabled={resetBusy}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => resetPassword(resetMode)}
                style={{ flex: 1 }}
                disabled={resetBusy || newPassword.length < 8}
              >
                {resetBusy ? "Resetting…" : "Reset Password"}
              </button>
            </div>
          </div>
        )}

        {resetMsg && (
          <div className={`alert ${resetMsg.type === "ok" ? "alert-success" : "alert-error"}`}>
            {resetMsg.text}
          </div>
        )}

        <p style={{ fontSize: 12, color: "#666", marginTop: 12 }}>
          After resetting, you can log in with your admin email and new password.
        </p>
      </div>
    </div>
  );
}