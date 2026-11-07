"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only correlation id the server logs; keep it in the
    // browser console so a user can quote it to support.
    console.error("[app] render error", error.digest || error.message);
  }, [error]);

  return (
    <div className="container" style={{ paddingTop: 64, paddingBottom: 80, textAlign: "center" }}>
      <div style={{ fontSize: 44 }} aria-hidden="true">⚠️</div>
      <h1 style={{ fontSize: 26, margin: "12px 0 8px" }}>Something went wrong</h1>
      <p className="muted" style={{ maxWidth: 460, margin: "0 auto 20px" }}>
        This page could not be loaded. Your orders and submissions are safe — try again,
        or head back to the deals list.
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={reset}>
          Try again
        </button>
        <Link href="/browse" className="btn btn-secondary">
          Browse deals
        </Link>
      </div>
      {error.digest && (
        <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>
          Reference: <code>{error.digest}</code>
        </p>
      )}
    </div>
  );
}
