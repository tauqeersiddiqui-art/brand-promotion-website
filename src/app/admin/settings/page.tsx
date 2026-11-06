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
    </div>
  );
}
