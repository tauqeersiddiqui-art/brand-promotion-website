import { Metadata } from "next";
import ClaimRefundForm from "@/components/ClaimRefundForm";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Submit Refund | Brand Deals Hub",
  description: "Submit your order proof and feedback screenshots to claim your savings.",
};

export default function RefundPage() {
  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/" className="link">← Back to Home</Link>
      </div>

      <div className="section-head">
        <span className="badge badge-outline">Refund form</span>
        <h1 style={{ margin: "12px 0 10px" }}>Submit refund request</h1>
        <p className="muted" style={{ maxWidth: 600, margin: "0 auto", fontSize: 15 }}>
          Submit your order proof and feedback screenshots to receive your savings payout.
        </p>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <ClaimRefundForm />
      </div>
    </div>
  );
}