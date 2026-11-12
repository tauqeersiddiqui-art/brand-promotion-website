import { Metadata } from "next";
import ClaimRefundForm from "@/components/ClaimRefundForm";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Submit Feedback | Brand Deals Hub",
  description: "Share your feedback about your deal purchase. Your input helps us improve deal quality.",
};

export default function ClaimPage() {
  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/" className="link">← Back to Home</Link>
      </div>

      <div className="section-head">
        <span className="badge badge-outline">Feedback form</span>
        <h1 style={{ margin: "12px 0 10px" }}>Share your feedback</h1>
        <p className="muted" style={{ maxWidth: 600, margin: "0 auto", fontSize: 15 }}>
          Tell us about your deal purchase experience. Feedback helps us improve deal quality and sharing.
        </p>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <ClaimRefundForm />
      </div>
    </div>
  );
}