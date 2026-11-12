import Link from "next/link";
import { getSettings, whatsappLink } from "@/lib/settings";

export const metadata = {
  title: "Terms & Conditions — Deal Purchase & Shopping Guidelines",
  description: "Guidelines and terms for accessing deals, purchasing, and following store policies.",
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
          Legal &amp; deal policy
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
              1. Platform Access & Deal Shopping
            </h3>
            <p className="muted" style={{ margin: 0 }}>
              {settings.site_name} provides links to verified deals on Indian e-commerce platforms including Amazon India, Flipkart, Myntra, Ajio, Meesho, and direct brand stores. We help you find and save on products through verified deal links.
            </p>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              2. Deal Access & Shopping Guidelines
            </h3>
            <ul style={{ margin: 0, paddingLeft: 22, color: "var(--ink-soft)" }}>
              <li>
                <strong>Deal Availability:</strong> Each deal has limited inventory. Click "Shop on" to verify current availability on the store.
              </li>
              <li>
                <strong>Deal Codes:</strong> Apply the provided coupon code during checkout to receive the advertised savings.
              </li>
              <li>
                <strong>Price Verification:</strong> Deal prices are verified daily. If a deal expires, the product returns to regular pricing.
              </li>
            </ul>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              3. Affiliate & Store Links
            </h3>
            <ul style={{ margin: 0, paddingLeft: 22, color: "var(--ink-soft)" }}>
              <li>
                Some links on our site are affiliate links. We may earn a small commission at no extra cost to you.
              </li>
              <li>
                All purchases are completed on the store's own website. You'll be redirected to their checkout process.
              </li>
              <li>
                Order confirmations, returns, and refunds are handled exclusively by the store's customer support.
              </li>
            </ul>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              4. Account Registration & Usage
            </h3>
            <ul style={{ margin: 0, paddingLeft: 22, color: "var(--ink-soft)" }}>
              <li>
                Creating an account is optional but allows access to deal history, saved items, and notifications.
              </li>
              <li>
                Please use accurate information and do not create multiple accounts.
              </li>
              <li>
                Accounts may be deactivated for violations of our deal policies.
              </li>
            </ul>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              5. Contact & Support
            </h3>
            <p className="muted" style={{ margin: "0 0 12px" }}>
              For questions about deals, accessibility issues, or account issues, please contact our support team:
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {settings.whatsapp && (
                <a
                  href={whatsappLink(settings.whatsapp, "Hi, I need help with a deal.")}
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
