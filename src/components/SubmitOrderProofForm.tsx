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

type DealOption = {
  id: number;
  title: string;
  product_code: string;
  platform: string;
  price_sale: number;
  total_slots: number;
  claimed_slots: number;
  deal_type?: string;
  review_amount?: number;
  rating_amount?: number;
  only_order_amount?: number;
};

export default function SubmitOrderProofForm({ initialDealId }: { initialDealId?: number }) {
  const { user, loading: authLoading } = useSessionUser();
  const pathname = usePathname();
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [mediatorOptions, setMediatorOptions] = useState<string[]>([]);
  const [dealId, setDealId] = useState<number | string>(initialDealId || "");
  const [externalOrderId, setExternalOrderId] = useState("");
  const [platform, setPlatform] = useState("Amazon");
  const [dealType, setDealType] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [mediatorName, setMediatorName] = useState("Direct");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [total, setTotal] = useState<string | number>("");
  const [notes, setNotes] = useState("");

  const [orderFile, setOrderFile] = useState<File | null>(null);
  // Reuse the URL returned by the OCR upload so the file is uploaded once.
  const [orderFileUrl, setOrderFileUrl] = useState("");
  const [fileResetKey, setFileResetKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{
    order_code: string;
    external_order_id: string;
    ocr_match: number;
    ocr_extracted_id?: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/deals?limit=50")
      .then((r) => r.json())
      .then((d) => {
        if (d?.deals) setDeals(d.deals);
      })
      .catch(() => {});

    // Ensure the CSRF cookie exists before the first submit.
    fetch("/api/csrf").catch(() => {});
  }, []);

  // Prefill contact details from the logged-in account (never overwrite typing).
  useEffect(() => {
    if (!user) return;
    setFullName((v) => v || user.name || "");
    setEmail((v) => v || user.email || "");
    setPhone((v) => v || user.phone || "");
  }, [user]);

  // Sync platform/price when a campaign is selected.
  // `total` is deliberately not a dependency: including it re-filled the field
  // whenever the user cleared it, making the input impossible to edit.
  useEffect(() => {
    if (!dealId) return;
    const selected = deals.find((d) => d.id === Number(dealId));
    if (!selected) return;
    if (selected.platform) setPlatform(selected.platform);
    if (selected.price_sale) setTotal(selected.price_sale);
    const options = [
      Number(selected.review_amount) > 0
        ? { value: "Review Deal", label: `Review deal (5★ + text) — ₹${Number(selected.review_amount).toLocaleString("en-IN")}` }
        : null,
      Number(selected.rating_amount) > 0
        ? { value: "Rating Deal", label: `Rating deal (5★ only) — ₹${Number(selected.rating_amount).toLocaleString("en-IN")}` }
        : null,
      Number(selected.only_order_amount) > 0
        ? { value: "Only Order Deal", label: `Only order deal — ₹${Number(selected.only_order_amount).toLocaleString("en-IN")}` }
        : null,
    ].filter((o): o is { value: string; label: string } => o !== null);
    setDealType((prev) => (options.some((o) => o.value === prev) ? prev : options[0]?.value || ""));
  }, [dealId, deals]);

  const selectedDeal = deals.find((d) => d.id === Number(dealId));
  const dealTypeOptions = selectedDeal
    ? [
        Number(selectedDeal.review_amount) > 0
          ? { value: "Review Deal", label: `Review deal (5★ + text) — ₹${Number(selectedDeal.review_amount).toLocaleString("en-IN")}` }
          : null,
        Number(selectedDeal.rating_amount) > 0
          ? { value: "Rating Deal", label: `Rating deal (5★ only) — ₹${Number(selectedDeal.rating_amount).toLocaleString("en-IN")}` }
          : null,
        Number(selectedDeal.only_order_amount) > 0
          ? { value: "Only Order Deal", label: `Only order deal — ₹${Number(selectedDeal.only_order_amount).toLocaleString("en-IN")}` }
          : null,
      ].filter((o): o is { value: string; label: string } => o !== null)
    : [];

  // Handle Order Screenshot Upload & Auto OCR extraction
  async function handleOrderScreenshotChange(file: File | null) {
    setOrderFile(file);
    setOrderFileUrl("");
    if (!file) return;
    setUploading(true);
    setOcrMsg("Analyzing order screenshot with OCR…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("ocr", "true");
      const r = await fetch("/api/upload", { method: "POST", headers: getCsrfHeader(), body: fd });
      const d = await r.json();
      if (!r.ok) {
        setOcrMsg(d.error || "Screenshot upload failed. Please try again.");
        setOrderFile(null);
        return;
      }
      setOrderFileUrl(d.url || "");
      // The response carries extracted_order_id; it has no `ocr_text` key, so
      // the previous `d.ocr_text` guard never passed and the auto-detect
      // message never appeared.
      if (d.extracted_order_id) {
        setExternalOrderId(d.extracted_order_id);
        setOcrMsg(`✅ Auto-detected Order ID: ${d.extracted_order_id}`);
      } else {
        setOcrMsg("ℹ️ Screenshot uploaded. Please ensure the Order ID is clearly visible.");
      }
    } catch {
      setOcrMsg("");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      // The order screenshot is usually already uploaded by the OCR pass; only
      // upload here if that did not produce a URL.
      let orderScreenshotUrl = orderFileUrl;

      if (orderFile && !orderScreenshotUrl) {
        const fd = new FormData();
        fd.append("file", orderFile);
        const r = await fetch("/api/upload", { method: "POST", headers: getCsrfHeader(), body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to upload order screenshot");
        orderScreenshotUrl = d.url;
      }

      if (!orderScreenshotUrl) throw new Error("Please upload your order screenshot.");

      const payload = {
        deal_id: dealId ? Number(dealId) : undefined,
        external_order_id: externalOrderId.trim(),
        platform,
        deal_type: dealType || undefined,
        reviewer_name: reviewerName.trim(),
        mediator_name: mediatorName.trim(),
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        order_date: orderDate,
        // The API reads `unit_price`, not `total`. Sending `total` meant the
        // amount the reviewer actually paid was discarded and every order was
        // stored at the campaign price, which then fed OCR amount matching and
        // the reimbursement cap.
        unit_price: total ? Number(total) : 0,
        notes: notes.trim(),
        order_screenshot_url: orderScreenshotUrl,
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify(payload),
      });

      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Failed to submit order proof.");
      } else {
        setSuccess({
          order_code: d.order_code,
          external_order_id: d.external_order_id,
          ocr_match: d.ocr_match,
          ocr_extracted_id: d.ocr_extracted_id,
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
          Order proof submitted successfully!
        </h2>
        <p className="muted" style={{ maxWidth: 500, margin: "0 auto 20px" }}>
          Your tracking reference is{" "}
          <strong style={{ color: "var(--brand)" }}>{success.order_code}</strong>. Keep your
          Amazon/Flipkart Order ID (<strong>{success.external_order_id}</strong>) safe.
        </p>

        {success.ocr_match === 1 ? (
          <div className="alert alert-success" style={{ maxWidth: 480, margin: "0 auto 20px" }}>
            ✓ Automated OCR Match: Screenshot Order ID matches perfectly!
          </div>
        ) : (
          <div className="alert alert-info" style={{ maxWidth: 480, margin: "0 auto 20px" }}>
            ℹ️ Your order proof has been received. Ready for refund claims.
          </div>
        )}

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
          <Link href={`/track?q=${encodeURIComponent(success.external_order_id)}`} className="btn">
            🔍 Track Live Status
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSuccess(null);
              setExternalOrderId("");
              setOrderFile(null);
              setOrderFileUrl("");
              setOcrMsg("");
              // Remount the uncontrolled file inputs so their `required` state
              // and DOM values reset together with React state.
              setFileResetKey((k) => k + 1);
            }}
          >
            Submit Another Order
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
        title="Log in to submit your order proof"
        description="Order proofs must be linked to a free account so you can track approval and receive your refund payout. It takes 30 seconds to sign up."
        next={pathname && pathname !== "/" ? pathname : "/#submit-order"}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 20 }}>Submit order proof</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          Upload your order confirmation screenshot after placing the order on Amazon/Flipkart.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {ocrMsg && <div className="alert alert-info">{ocrMsg}</div>}

      <div className="form-grid">
        <div className="full">
          <label className="form-label">Select Campaign / Deal *</label>
          <select
            className="input"
            required
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
          >
            <option value="">-- Choose active campaign or direct deal --</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                [{d.platform}] {d.product_code ? `#${d.product_code} - ` : ""}{d.title} (₹{d.price_sale}) — {Math.max(0, d.total_slots - d.claimed_slots)} slots left
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label">Platform *</label>
          <select
            className="input"
            required
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="Amazon">Amazon</option>
            <option value="Flipkart">Flipkart</option>
            <option value="Myntra">Myntra</option>
            <option value="Brand Store">Brand Store</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div>
          <label className="form-label">
            {platform === "Amazon" ? "Amazon Order ID (e.g. 404-1234567-1234567) *" : "Order ID *"}
          </label>
          <input
            className="input"
            required
            value={externalOrderId}
            onChange={(e) => setExternalOrderId(e.target.value)}
            placeholder={platform === "Amazon" ? "404-XXXXXXX-XXXXXXX" : "OD1234567890..."}
          />
        </div>

        {dealTypeOptions.length > 0 && (
          <div>
            <label className="form-label">Deal Type *</label>
            <select
              className="input"
              required
              value={dealType}
              onChange={(e) => setDealType(e.target.value)}
            >
              {dealTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="form-label">Reviewer Profile Name *</label>
          <input
            className="input"
            required
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            placeholder="Name displayed on your Amazon/Flipkart account"
          />
        </div>

        <div>
          <label className="form-label">Mediator / Campaign Code (Optional)</label>
          <input
            className="input"
            value={mediatorName}
            onChange={(e) => setMediatorName(e.target.value)}
            placeholder="Direct or Mediator Name"
          />
        </div>

        <div>
          <label className="form-label">Your Full Name *</label>
          <input
            className="input"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="John Doe"
          />
        </div>

        <div>
          <label className="form-label">WhatsApp Mobile Number *</label>
          <input
            className="input"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210 (For payout alerts)"
          />
        </div>

        <div>
          <label className="form-label">Email Address *</label>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="form-label">Order Date *</label>
          <input
            className="input"
            type="date"
            required
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
          />
        </div>

        <div>
          <label className="form-label">Order Total Paid (₹) *</label>
          <input
            className="input"
            type="number"
            step="0.01"
            required
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="e.g. 999"
          />
        </div>

        {/* Screenshot upload */}
        <div className="full" style={{ background: "var(--bg-soft)", padding: 14, borderRadius: 12, border: "1px solid var(--border)" }}>
          <label className="form-label" style={{ color: "var(--accent)", fontSize: 13.5 }}>
            Order screenshot * (Auto-scanned by OCR)
          </label>
          <input
            key={`order-${fileResetKey}`}
            className="input"
            type="file"
            required={!orderFileUrl}
            accept="image/*"
            onChange={(e) => handleOrderScreenshotChange(e.target.files?.[0] ?? null)}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            Must clearly show the Order ID, Product Title, and Order Date.
          </span>
        </div>

        <div className="full">
          <label className="form-label">Additional Notes (Optional)</label>
          <textarea
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any special notes or instructions…"
            style={{ minHeight: 60 }}
          />
        </div>

        <div className="full">
          <button className="btn btn-block" disabled={busy || uploading}>
            {busy || uploading ? "Processing & uploading…" : "Submit order proof now →"}
          </button>
        </div>
      </div>
    </form>
  );
}
