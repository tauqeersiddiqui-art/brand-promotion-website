import Link from "next/link";
import { whatsappLink, telegramLink, type SiteSettings } from "@/lib/settings";

export default function Footer({ settings: s }: { settings: SiteSettings }) {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <div className="brand" style={{ marginBottom: 10 }}>
            <span className="logo">BP</span> {s.site_name}
          </div>
          <p style={{ margin: 0, maxWidth: 320, color: "var(--muted)", fontSize: 13.5 }}>
            {s.tagline}. Genuine brand campaigns with direct UPI refund for verified reviewers.
          </p>
          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className="badge badge-refund">
              Direct UPI Payouts
            </span>
            <span className="badge badge-outline">
              Verified Reviews
            </span>
          </div>
        </div>

        <div>
          <h4>Reviewer Hub</h4>
          <Link href="/browse">Live brand deals</Link>
          <Link href="/stores">Shop all stores</Link>
          <Link href="/#submit-order">Submit order proof</Link>
          <Link href="/#claim-refund">Claim refund</Link>
          <Link href="/track">Track payout status</Link>
          <Link href="/account">My dashboard</Link>
        </div>

        <div>
          <h4>Company</h4>
          <Link href="/about">About us</Link>
          <Link href="/contact">Contact helpdesk</Link>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms &amp; conditions</Link>
          <Link href="/login?next=/mediator">Mediator login</Link>
          <Link href="/admin/login">Admin login</Link>
        </div>

        <div>
          <h4>Direct support</h4>
          {s.whatsapp && (
            <a href={whatsappLink(s.whatsapp, "Hi! I need help with a deal payout.")} target="_blank" rel="noopener noreferrer">
              WhatsApp support
            </a>
          )}
          {s.telegram && (
            <a href={telegramLink(s.telegram)} target="_blank" rel="noopener noreferrer">
              Telegram VIP channel
            </a>
          )}
          {s.support_email && (
            <a href={`mailto:${s.support_email}`}>{s.support_email}</a>
          )}
          {s.instagram && (
            <a href={`https://instagram.com/${s.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer">
              Instagram @{s.instagram.replace(/^@/, "")}
            </a>
          )}
        </div>
      </div>

      <div className="container" style={{ marginTop: 36, paddingTop: 20, borderTop: "1px solid var(--border)", fontSize: 13, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <span>© {new Date().getFullYear()} {s.site_name}. Brand campaigns &amp; reviewer refund platform.</span>
        <span>For verified reviewers</span>
      </div>
    </footer>
  );
}
