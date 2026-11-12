"use client";

import { useEffect, useState } from "react";
import SubmitOrderProofForm from "./SubmitOrderProofForm";
import ClaimRefundForm from "./ClaimRefundForm";
import QuickTrackForm from "./QuickTrackForm";

export default function HomeActionTabs() {
  const [tab, setTab] = useState<"submit" | "claim" | "track">("submit");

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash;
      if (hash === "#claim-refund" || hash === "#claim") {
        setTab("claim");
      } else if (hash === "#track" || hash === "#track-status") {
        setTab("track");
      } else if (hash === "#submit-order" || hash === "#submit") {
        setTab("submit");
      }
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  return (
    <section className="container section" id="quick-actions" style={{ marginTop: 8, marginBottom: 24 }}>
      <span id="submit-order" style={{ display: "block", position: "relative", top: -90 }} />
      <span id="claim-refund" style={{ display: "block", position: "relative", top: -90 }} />
      <span id="track" style={{ display: "block", position: "relative", top: -90 }} />
      <div className="action-panel">
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <h2 style={{ margin: "0 0 6px" }}>Deal actions</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Submit your order proof, share feedback, or track savings status.
          </p>
        </div>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div className="tab-group" style={{ marginBottom: 24 }}>
          <button
            type="button"
            className={`tab-btn ${tab === "submit" ? "active" : ""}`}
            onClick={() => {
              setTab("submit");
              window.history.replaceState(null, "", "#submit-order");
            }}
          >
            1. Submit order proof
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === "claim" ? "active" : ""}`}
            onClick={() => {
              setTab("claim");
              window.history.replaceState(null, "", "#claim-refund");
            }}
          >
            2. Submit feedback
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === "track" ? "active" : ""}`}
            onClick={() => {
              setTab("track");
              window.history.replaceState(null, "", "#track");
            }}
          >
            3. Track savings
          </button>
        </div>

        {tab === "submit" && <SubmitOrderProofForm />}
        {tab === "claim" && <ClaimRefundForm />}
        {tab === "track" && <QuickTrackForm />}
        </div>
      </div>
    </section>
  );
}
