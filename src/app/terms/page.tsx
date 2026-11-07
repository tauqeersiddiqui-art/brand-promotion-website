import Link from "next/link";
import { getSettings, whatsappLink } from "@/lib/settings";

export const metadata = {
  title: "Terms & Conditions — Campaign Rules & Refund Policy",
  description: "Guidelines and terms for reviewers, brand promotion campaigns, 100% review refunds, and UPI disbursements.",
};

export default function TermsPage() {
  const settings = getSettings();

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 80, maxWidth: 880 }}>
      <div style={{ marginBottom: 28 }}>
        <Link href="/" className="link">
          ← Back to Home
        </Link>
      </div>

      <div className="card" style={{ padding: "36px 32px" }}>
        <span className="badge badge-brand">
          Legal &amp; campaign policy
        </span>
        <h1 style={{ fontSize: 32, margin: "14px 0 10px", letterSpacing: "-0.02em" }}>
          Terms & Conditions
        </h1>
        <p className="muted" style={{ fontSize: 14, margin: "0 0 28px" }}>
          Last updated: {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, fontSize: 14.5, lineHeight: 1.7, color: "var(--text)" }}>
          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              1. Platform Overview & Influencer Promotion Model
            </h3>
            <p className="muted" style={{ margin: 0 }}>
              {settings.site_name} operates as a verified influencer brand promotion and review reimbursement bridge connecting e-commerce brands (selling on Amazon India, Flipkart, Myntra, and direct-to-consumer stores) with authentic product reviewers and shoppers across India. Reviewers purchase products at regular retail prices and receive 100% refunds via UPI upon posting genuine, verified reviews on the respective e-commerce platform.
            </p>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              2. Reviewer Slot Reservation & Ordering Rules
            </h3>
            <ul style={{ margin: 0, paddingLeft: 22, color: "var(--muted)" }}>
              <li>
                <strong>Slot Availability:</strong> Each campaign has a limited quota of reviewer slots. You must only order products for which slots are active and available on our platform.
              </li>
              <li>
                <strong>Search Keyword Compliance:</strong> Reviewers must search for the product on Amazon/Flipkart using the exact specified campaign target keyword rather than direct links whenever required, helping organic brand discoverability.
              </li>
              <li>
                <strong>No Unauthorized Coupons:</strong> Unless explicitly provided in the campaign deal details, do not apply unauthorized coupons or discounts that reduce the order price below the campaign floor price.
              </li>
            </ul>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              3. Order Proof Submission
            </h3>
            <ul style={{ margin: 0, paddingLeft: 22, color: "var(--muted)" }}>
              <li>
                Reviewers must submit both the <strong>Desktop/App Order Confirmation Screenshot</strong> and <strong>Price Breakup Screenshot</strong> within 2 hours of placing the order.
              </li>
              <li>
                The submitted Order ID (e.g., Amazon format <code>404-XXXXXXX-XXXXXXX</code> or Flipkart <code>OD...</code>) must be clearly legible and match the uploaded screenshots.
              </li>
              <li>
                Any tampering, manipulation, or fabrication of order screenshots or invoices will result in immediate rejection, account termination, and blacklisting across all affiliate mediator networks.
              </li>
            </ul>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              4. Review Requirements & Verification
            </h3>
            <ul style={{ margin: 0, paddingLeft: 22, color: "var(--muted)" }}>
              <li>
                Reviews must be posted after the order is confirmed.
              </li>
              <li>
                Reviews must be genuine, constructive, 5-star rated, and include at least 1–2 real photos of the unboxed product on the e-commerce platform.
              </li>
              <li>
                Reviewers must allow 24 to 72 hours for the e-commerce platform (Amazon/Flipkart) to approve and publish the review before submitting the reimbursement claim.
              </li>
              <li>
                The submitted review screenshot must clearly show the reviewer profile name, rating stars, live review text, and product photos.
              </li>
            </ul>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              5. UPI Reimbursement & Payout Disbursement
            </h3>
            <ul style={{ margin: 0, paddingLeft: 22, color: "var(--muted)" }}>
              <li>
                Refunds are disbursed directly via UPI (or IMPS Bank Transfer) within <strong>24 to 48 hours</strong> of review proof approval.
              </li>
              <li>
                Upon disbursement, a valid 12-digit bank <strong>UTR Reference Number</strong> is generated and recorded. You can track this in real-time at <Link href="/track" className="link">/track</Link> or in your <Link href="/account" className="link">Reviewer Dashboard</Link>.
              </li>
              <li>
                Reviewers are solely responsible for ensuring the accuracy of the provided UPI ID (e.g., <code>username@okhdfcbank</code>). Refunds disbursed to incorrectly submitted UPI IDs cannot be recovered or refunded.
              </li>
            </ul>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--danger)" }}>
              6. Anti-Fraud & Strict No-Return Policy
            </h3>
            <div style={{ background: "rgba(244, 63, 94, 0.08)", border: "1px solid rgba(244, 63, 94, 0.25)", padding: 16, borderRadius: 10 }}>
              <p style={{ margin: "0 0 8px", color: "var(--text)", fontWeight: 600 }}>
                ⚠️ Zero Tolerance for Return/Refund Fraud:
              </p>
              <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
                Initiating a return, cancellation, or refund on Amazon, Flipkart, or any marketplace after receiving your UPI reimbursement from {settings.site_name} constitutes financial fraud. In such cases, your UPI ID and phone number will be reported across all mediator networks, permanently banned, and subjected to legal recovery under the Information Technology Act and IPC section 420.
              </p>
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              7. Questions & Dispute Resolution
            </h3>
            <p className="muted" style={{ margin: "0 0 12px" }}>
              For any issues regarding order verification delays, UTR payment proofs, or campaign inquiries, please contact our helpdesk immediately:
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {settings.whatsapp && (
                <a
                  href={whatsappLink(settings.whatsapp, "Hi, I have a query about campaign rules & terms.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm"
                  style={{ background: "#25d366" }}
                >
                  💬 WhatsApp Support
                </a>
              )}
              <Link href="/contact" className="btn btn-secondary btn-sm">
                📞 Contact Helpdesk
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
