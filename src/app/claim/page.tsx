import { Metadata } from "next";
import ClaimRefundForm from "@/components/ClaimRefundForm";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Claim Refund | Brand Promotion",
  description: "Submit your order proof, review screenshots, and seller feedback to receive 100% UPI refund.",
};

export default function ClaimPage() {
  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/" className="link">← Back to Home</Link>
      </div>

      <div className="section-head">
        <span className="badge badge-outline">Refund claim</span>
        <h1 style={{ margin: "12px 0 10px" }}>Submit your refund claim</h1>
        <p className="muted" style={{ maxWidth: 600, margin: "0 auto", fontSize: 15 }}>
          Your order is immediately confirmed upon submission. Once your 5-star review is live on Amazon/Flipkart,
          submit your refund form to receive refund as per deal within 10-15 days.
        </p>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <ClaimRefundForm />
      </div>
    </div>
  );
}