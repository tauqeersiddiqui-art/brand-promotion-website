"use client";

import { useEffect, useState } from "react";

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

type RestoreResponse = {
  ok?: boolean;
  mode?: "full" | "deals";
  restored?: Record<string, number>;
  error?: string;
};

export default function AdminBackupPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Ensure CSRF cookie is set on mount
  useEffect(() => {
    fetch("/api/csrf").catch(() => {});
  }, []);

  async function restore() {
    if (!file) return;
    if (
      !confirm(
        "This REPLACES the current site data with the contents of the backup file. Continue?"
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const text = await file.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        setMsg({ type: "err", text: "That file is not valid JSON." });
        return;
      }
      const r = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "content-type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify(body),
      });
      const d = (await r.json().catch(() => ({}))) as RestoreResponse;
      if (!r.ok) {
        setMsg({ type: "err", text: d.error || `Restore failed (${r.status}).` });
        return;
      }
      const parts = Object.entries(d.restored || {})
        .map(([k, v]) => `${v} ${k}`)
        .join(", ");
      setMsg({
        type: "ok",
        text: `Restore complete (${
          d.mode === "deals" ? "deals file" : "full backup"
        }). Restored: ${parts || "no rows"}. Open the site or /browse to see your deals.`,
      });
      setFile(null);
    } catch {
      setMsg({ type: "err", text: "Network error while restoring." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 10, paddingBottom: 60 }}>
      <div className="admin-head">
        <div>
          <h1>Backup &amp; restore</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Protect your campaigns, orders and payouts against hosting resets.
          </p>
        </div>
      </div>

      <div className="alert alert-error" style={{ marginBottom: 20 }}>
        <strong>Important:</strong> on Render&apos;s free plan the database is erased on
        every redeploy or restart, and the site then re-creates only the 4 sample
        deals. Download a backup after each publishing session, and restore it right
        after any deploy to bring your real deals back.
      </div>

      {msg && (
        <div className={`alert ${msg.type === "ok" ? "alert-success" : "alert-error"}`}>
          {msg.text}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 20,
        }}
      >
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0, fontSize: 17 }}>1. Download a backup</h3>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            Downloads a JSON file with <strong>everything</strong>: campaigns, users,
            order proofs, cashback claims, reviews, settings and payouts. Keep it
            somewhere safe (e.g. Google Drive). Do this after every admin
            session that adds or edits campaigns.
          </p>
          <a className="btn" href="/api/admin/backup">
            Download full backup (JSON)
          </a>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0, fontSize: 17 }}>2. Restore from a backup</h3>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            Upload a backup file to put its data back. This accepts both full
            backups (from the download button) and deals-only arrays such as{" "}
            <code>live-deals-backup.json</code>. Restoring <strong>replaces</strong>{" "}
            the current data.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="input"
              type="file"
              accept="application/json,.json"
              style={{ flex: 1, minWidth: 200 }}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button className="btn" onClick={restore} disabled={busy || !file}>
              {busy ? "Restoring…" : "Restore backup"}
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 24, marginTop: 20 }}>
        <h3 style={{ marginTop: 0, fontSize: 17 }}>Recommended workflow (free hosting)</h3>
        <ol className="muted" style={{ fontSize: 13.5, lineHeight: 1.8, margin: 0, paddingLeft: 20 }}>
          <li>Log in to admin and publish or edit your campaigns.</li>
          <li>Open this page and click <strong>Download full backup</strong> before you leave.</li>
          <li>
            Any time the site reverts to the 4 sample deals (after a deploy, restart
            or long idle period), come back here, upload your latest backup file and
            click <strong>Restore backup</strong>.
          </li>
          <li>
            Long term: a paid Render instance with a persistent disk (or an external
            database) removes this problem completely.
          </li>
        </ol>
      </div>
    </div>
  );
}
