"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSessionUser } from "./useSessionUser";
import LoginRequired from "./LoginRequired";

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

export default function ClaimCashbackForm() {
  const { user, loading: authLoading } = useSessionUser();
  const pathname = usePathname();
  const [externalOrderId, setExternalOrderId] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("upi");
  const [upiId, setUpiId] = useState("");
  // The API reads discrete fields (account_number / account_holder /
  // ifsc_code / bank_name). A single free-text "bank_details" blob was never
  // read by the route, so bank payouts could never be submitted.
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [amount, setAmount] = useState<string | number>("");
  const [reviewLink, setReviewLink] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewFile, setReviewFile] = useState<File | null>(null);
  const [reviewFileUrl, setReviewFileUrl] = useState("");
  const [fileResetKey, setFileResetKey] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ocrMsg, setOcrMsg] = useState("");
  const [success, setSuccess] = useState<{
    reimbursement_code: string;
    amount: number;
    upi_id: string;
    status: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/csrf").catch(() => {});
  }, []);

  async function handleReviewScreenshotChange(file: File | null) {
    setReviewFile(file);
    setReviewFileUrl("");
    if (!file) return;
    setOcrMsg("Analyzing review screenshot for rating & order details…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("ocr", "true");
      const r = await fetch("/api/upload", { method: "POST", headers: getCsrfHeader(), body: fd });
      const d = await r.json();
      if (!r.ok) {
        setOcrMsg(d.error || "Screenshot upload failed. Please try again.");
        setReviewFile(null);
        return;
      }
      // Reuse the URL from the OCR pass; re-uploading the same bytes hit the
      // duplicate-hash check and failed the claim with a 409.
      setReviewFileUrl(d.url || "");
      setOcrMsg("✅ Review screenshot uploaded.");
    } catch {
      setOcrMsg("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      // The OCR pass already uploaded the file; only upload if it produced no URL.
      let reviewScreenshotUrl = reviewFileUrl;
      if (reviewFile && !reviewScreenshotUrl) {
        const fd = new FormData();
        fd.append("file", reviewFile);
        const r = await fetch("/api/upload", { method: "POST", headers: getCsrfHeader(), body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to upload review screenshot");
        reviewScreenshotUrl = d.url;
      }
      if (!reviewScreenshotUrl) throw new Error("Please upload your review screenshot.");

      const payload = {
        external_order_id: externalOrderId.trim(),
        reviewer_name: reviewerName.trim(),
        payout_method: payoutMethod,
        upi_id: upiId.trim(),
        account_number: accountNumber.trim(),
        account_holder: accountHolder.trim(),
        ifsc_code: ifscCode.trim(),
        bank_name: bankName.trim(),
        amount: amount ? Number(amount) : undefined,
        review_screenshot_url: reviewScreenshotUrl,
        review_link: reviewLink.trim(),
        // The route reads `review_text`; `review_notes` was silently dropped.
        review_text: reviewNotes.trim(),
        review_rating: 5,
      };

      const res = await fetch("/api/reimbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify(payload),
      });

      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Failed to submit reimbursement claim.");
      } else {
        setSuccess({
          reimbursement_code: d.reimbursement_code,
          amount: d.amount,
          upi_id: d.upi_id,
          status: d.status,
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "36px 20px" }}>
        <div className="muted" style={{ fontSize: 44, marginBottom: 10, display: "block" }}>—</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 24, color: "var(--accent)" }}>
          Reimbursement claim submitted!
        </h2>
        <p className="muted" style={{ maxWidth: 500, margin: "0 auto 16px" }}>
          Claim Ref: <strong style={{ color: "var(--brand)" }}>{success.reimbursement_code}</strong>.
          Payout amount: <strong>₹{success.amount.toLocaleString("en-IN")}</strong>.
        </p>

        <div className="alert alert-success" style={{ maxWidth: 480, margin: "0 auto 20px" }}>
          ⚡ Payouts are verified and disbursed directly to <strong>{success.upi_id || "your account"}</strong> within 24-48 hours. You will receive a UTR reference upon completion.
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
          <Link href={`/track?q=${encodeURIComponent(externalOrderId || success.reimbursement_code)}`} className="btn">
            🔍 Track Payout Status
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSuccess(null);
              setExternalOrderId("");
              setReviewFile(null);
              setReviewFileUrl("");
              setOcrMsg("");
              setFileResetKey((k) => k + 1);
            }}
          >
            Claim Another
          </button>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <p className="muted" style={{ margin: 0 }}>Checking login status…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginRequired
        title="Log in to claim your cashback"
        description="Claims are linked to the account that submitted the order proof so payouts go to the right person. Log in or create a free account to continue."
        next={pathname && pathname !== "/" ? pathname : "/#claim-cashback"}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 20 }}>Claim review cashback / reimbursement</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          Once your product is delivered & review is live on Amazon/Flipkart, submit your proof for 100% UPI cashback.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {ocrMsg && <div className="alert alert-info">{ocrMsg}</div>}

      <div className="form-grid">
        <div>
          <label className="form-label">Amazon / Flipkart Order ID *</label>
          <input
            className="input"
            required
            value={externalOrderId}
            onChange={(e) => setExternalOrderId(e.target.value)}
            placeholder="e.g. 404-1234567-1234567 or OD..."
          />
          <span className="muted" style={{ fontSize: 12 }}>
            Must match your previously submitted order proof.
          </span>
        </div>

        <div>
          <label className="form-label">Reviewer Profile Name (Optional)</label>
          <input
            className="input"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            placeholder="Name displayed on your review"
          />
        </div>

        <div>
          <label className="form-label">Reimbursement Amount (₹) (Optional)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Defaults to full order amount"
          />
        </div>

        <div>
          <label className="form-label">Payout Method *</label>
          <select
            className="input"
            value={payoutMethod}
            onChange={(e) => setPayoutMethod(e.target.value)}
          >
            <option value="upi">Instant UPI (GPay, PhonePe, Paytm)</option>
            <option value="bank">Bank Transfer (IMPS / NEFT)</option>
          </select>
        </div>

        {payoutMethod === "upi" ? (
          <div className="full">
            <label className="form-label">UPI ID (VPA) *</label>
            <input
              className="input"
              required
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g. yourname@okhdfcbank or 9876543210@paytm"
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Double-check your UPI ID carefully for smooth cashback disbursement.
            </span>
          </div>
        ) : (
          <div className="full">
            <div className="form-grid" style={{ margin: 0 }}>
              <div>
                <label className="form-label" htmlFor="bank-account-number">Account Number *</label>
                <input
                  id="bank-account-number"
                  className="input"
                  required
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="9-18 digit account number"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="bank-holder">Account Holder Name *</label>
                <input
                  id="bank-holder"
                  className="input"
                  required
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="As printed on your passbook"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="bank-ifsc">IFSC Code *</label>
                <input
                  id="bank-ifsc"
                  className="input"
                  required
                  value={ifscCode}
                  onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                  placeholder="e.g. HDFC0001234"
                />
              </div>
              <div>
                <label className="form-label" htmlFor="bank-name">Bank Name (Optional)</label>
                <input
                  id="bank-name"
                  className="input"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. HDFC Bank"
                />
              </div>
            </div>
          </div>
        )}

        <div className="full">
          <label className="form-label">Live Review URL / Link (Optional)</label>
          <input
            className="input"
            type="url"
            value={reviewLink}
            onChange={(e) => setReviewLink(e.target.value)}
            placeholder="https://www.amazon.in/gp/customer-reviews/..."
          />
        </div>

        <div className="full" style={{ background: "var(--bg-soft)", padding: 14, borderRadius: 12, border: "1px solid var(--border)" }}>
          <label className="form-label" style={{ color: "var(--accent)", fontSize: 13.5 }}>
            Live review screenshot * (Showing 5 stars &amp; reviewer name)
          </label>
          <input
            key={`review-${fileResetKey}`}
            className="input"
            type="file"
            required={!reviewFileUrl}
            accept="image/*"
            onChange={(e) => handleReviewScreenshotChange(e.target.files?.[0] ?? null)}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            Upload screenshot of the published 5-star review from Amazon/Flipkart app or web.
          </span>
        </div>

        <div className="full">
          <label className="form-label">Comments / Additional Details</label>
          <textarea
            className="input"
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Any feedback or notes about the review…"
            style={{ minHeight: 60 }}
          />
        </div>

        <div className="full">
          <button className="btn btn-block" disabled={busy}>
            {busy ? "Submitting Claim…" : "💸 Claim 100% Payout Now →"}
          </button>
        </div>
      </div>
    </form>
  );
}
