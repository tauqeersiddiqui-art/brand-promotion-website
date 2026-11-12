import Link from "next/link";
import { getSettings } from "@/lib/settings";

export const metadata = {
  title: "Privacy Policy — Data Protection",
  description: "Learn how we protect your personal information and account data.",
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
          🔒 Data Protection
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
              To facilitate deal access and account management, {settings.site_name} collects the following necessary information:
            </p>
            <ul style={{ margin: 0, paddingLeft: 22, color: "var(--ink-soft)" }}>
              <li>
                <strong>Account Information:</strong> Your name, email address, and WhatsApp contact number.
              </li>
              <li>
                <strong>Preference Data:</strong> Desired deal categories, favorite platforms, and notification preferences.
              </li>
              <li>
                <strong>Deal Interaction:</strong> Saved deals, viewed items, and engagement with deal notifications.
              </li>
            </ul>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              2. How We Use Your Information
            </h3>
            <ul style={{ margin: 0, paddingLeft: 22, color: "var(--ink-soft)" }}>
              <li>To show relevant deals based on your preferences and browsing history.</li>
              <li>To send notifications about new deals matching your saved categories.</li>
              <li>To maintain your account settings and saved item preferences.</li>
              <li>To improve our deal discovery features and platform personalization.</li>
            </ul>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              3. Data Security
            </h3>
            <p className="muted" style={{ margin: 0 }}>
              We take your privacy seriously. Account data is stored securely with encryption at rest.
              We never store payment card numbers, CVVs, or other sensitive financial information.
              All purchases are completed directly on the store's own checkout process.
            </p>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              4. Third-Party Sharing
            </h3>
            <p className="muted" style={{ margin: 0 }}>
              We do not sell or trade your personal data. We may share anonymized usage data with analytics partners to improve our service.
            </p>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              5. Cookies &amp; Analytics
            </h3>
            <p className="muted" style={{ margin: "0 0 10px" }}>
              We use essential cookies to keep you signed in and to protect forms against cross-site
              request forgery. We also use analytics cookies to understand how visitors use our site.
            </p>
            <ul className="muted" style={{ margin: "0 0 10px", paddingLeft: 18, lineHeight: 1.7 }}>
              <li>We use <a href="https://www.google.com/analytics" target="_blank" rel="noopener noreferrer" className="link">Google Analytics</a> to understand site usage.</li>
              <li>You may opt out of personalised advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="link">Google Ads Settings</a>.</li>
            </ul>
            <p className="muted" style={{ margin: 0 }}>
              Blocking non-essential cookies does not stop you from browsing deals.
            </p>
          </section>

          <section>
            <h3 style={{ fontSize: 18, margin: "0 0 8px", color: "var(--accent)" }}>
              6. Your Rights & Contact
            </h3>
            <p className="muted" style={{ margin: "0 0 12px" }}>
              You may request access to, correction of, or deletion of your personal data.
              For privacy requests or questions, contact us at:
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
