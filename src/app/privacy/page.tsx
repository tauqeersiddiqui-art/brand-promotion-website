import Link from "next/link";
import { getSettings } from "@/lib/settings";

export const metadata = {
  title: "Privacy Policy — Data & Screenshot Security",
  description: "Learn how we protect your personal information, order screenshots, UPI IDs, and payout records.",
};

export default function PrivacyPage() {
  const settings = getSettings();

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 80, maxWidth: 880 }}>
      <div style={{ marginBottom: 28 }}>
        <Link href="/" className="link">
          ← Back to Home
        </Link>
      </div>

      <div className="card" style={{ padding: "36px 32px" }}>
        <span className="badge" style={{ position: "static", background: "rgba(34,211,165,0.15)", color: "var(--accent)" }}>
          🔒 Data Protection & Security
        </span>
        <h1 style={{ fontSize: 32, margin: "14px 0 10px", letterSpacing: "-0.02em" }}>
          Privacy Policy
        </h1>
        <p className="muted" style={{ fontSize: 14, margin: "0 0 28px" }}>
          Last updated: {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, fontSize: 14.5, lineHeight: 1.7, color: "var(--text)" }}>
          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              1. Information We Collect
            </h3>
            <p className="muted" style={{ margin: "0 0 10px" }}>
              To facilitate 100% review cashback and brand promotion campaigns, {settings.site_name} collects the following necessary information:
            </p>
            <ul style={{ margin: 0, paddingLeft: 22, color: "var(--muted)" }}>
              <li>
                <strong>Reviewer Identification:</strong> Your name, email address, and WhatsApp contact number.
              </li>
              <li>
                <strong>Order Details:</strong> Marketplace Order ID (Amazon/Flipkart), campaign deal code, order amount, and purchase date.
              </li>
              <li>
                <strong>Verification Artifacts:</strong> Uploaded images of your desktop/mobile order confirmation, price breakup invoice, and live 5-star review screenshots.
              </li>
              <li>
                <strong>Payout Details:</strong> UPI Virtual Payment Address (VPA) or bank account transfer details solely for issuing reimbursement payouts.
              </li>
            </ul>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              2. How We Use Your Information
            </h3>
            <ul style={{ margin: 0, paddingLeft: 22, color: "var(--muted)" }}>
              <li>To cross-check and verify your purchase with brand campaign managers and mediators.</li>
              <li>To process automated Optical Character Recognition (OCR) verification of order and review screenshots.</li>
              <li>To issue UPI cashback reimbursements directly to your bank account and provide transparent UTR tracking references.</li>
              <li>To notify you of new campaign drops, slot replenishments, and payment statuses via WhatsApp/Email.</li>
            </ul>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              3. Data Protection & File Upload Security
            </h3>
            <p className="muted" style={{ margin: 0 }}>
              All uploaded screenshots are sanitized and validated with magic-byte file inspection to prevent malicious content. We never store or request debit/credit card numbers, CVVs, net-banking passwords, or UPI PINs. Payouts are made directly to your public UPI VPA using legitimate banking channels.
            </p>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              4. Third-Party Sharing
            </h3>
            <p className="muted" style={{ margin: 0 }}>
              We do not sell, rent, or trade your personal data. Limited order proof data (such as Order ID and reviewer username) may be shared with the verified brand mediator solely to validate campaign compliance before releasing campaign funds.
            </p>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              5. Cookies &amp; Advertising
            </h3>
            <p className="muted" style={{ margin: "0 0 10px" }}>
              We use essential cookies to keep you signed in and to protect forms against cross-site
              request forgery. With your consent where required, we also allow third-party vendors,
              including Google, to use cookies to serve ads based on your prior visits to this and
              other websites.
            </p>
            <ul className="muted" style={{ margin: "0 0 10px", paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Google&apos;s use of advertising cookies enables it and its partners to serve ads to you based on your visit to this site and/or other sites on the Internet.</li>
              <li>You may opt out of personalised advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="link">Google Ads Settings</a>.</li>
              <li>You can also opt out of third-party vendor cookies at <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer" className="link">aboutads.info</a>.</li>
              <li>Some store links on this site are affiliate links; we may earn a commission at no extra cost to you.</li>
            </ul>
            <p className="muted" style={{ margin: 0 }}>
              Blocking non-essential cookies does not stop you from using the store links, submitting
              order proofs, or claiming cashback.
            </p>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              6. Contacting Our Data Privacy Officer
            </h3>
            <p className="muted" style={{ margin: "0 0 12px" }}>
              If you have any questions or would like to request data deletion, please reach out to:
            </p>
            <div style={{ background: "var(--bg-soft)", padding: 14, borderRadius: 10, border: "1px solid var(--border)" }}>
              <div>📧 Support Email: <a href={`mailto:${settings.support_email}`} className="link">{settings.support_email}</a></div>
              {settings.whatsapp && <div style={{ marginTop: 4 }}>💬 WhatsApp: +{settings.whatsapp}</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
