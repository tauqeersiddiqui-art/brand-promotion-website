import Link from "next/link";
import { getSettings } from "@/lib/settings";

export const metadata = {
  title: "About Us | Brand Deals",
  description: "Learn about our platform for discovering and shopping verified deals on Indian marketplaces.",
};

export default function AboutPage() {
  const s = getSettings();

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60, maxWidth: 820 }}>
      <nav style={{ marginBottom: 24, fontSize: 14 }}>
        <Link href="/">Home</Link> {" > "} <span style={{ color: "var(--ink-soft)" }}>About Us</span>
      </nav>

      <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", marginBottom: 16 }}>
        About {s.site_name}
      </h1>
      <p style={{ fontSize: 18, color: "var(--ink-soft)", marginBottom: 36, maxWidth: 640 }}>
        Discover verified deals on Amazon, Flipkart, Myntra, and brand stores.
        Find great products at saved prices through our curated deal links.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, marginBottom: 40 }}>
        <div className="card" style={{ padding: 28 }}>
          <h3 style={{ color: "var(--brand)", marginBottom: 12 }}>Our Mission</h3>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 15 }}>
            To help you find verified deals across Indian marketplaces.
            Browse, shop directly, and save - all on trusted store websites.
          </p>
        </div>
        <div className="card" style={{ padding: 28 }}>
          <h3 style={{ color: "var(--brand)", marginBottom: 12 }}>How It Works</h3>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 15 }}>
            Browse verified deals, click "Shop on" to visit the store directly,
            apply deal codes at checkout, and enjoy your savings.
          </p>
        </div>
        <div className="card" style={{ padding: 28 }}>
          <h3 style={{ color: "var(--brand)", marginBottom: 12 }}>For Shoppers</h3>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 15 }}>
            Find deals, save money, and shop with confidence.
            All links lead directly to reputable stores with verified pricing.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 40 }}>
        <h2 style={{ marginBottom: 20 }}>Why Shoppers Choose Us</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {[
            ["Verified Deals", "Every deal link is verified for accuracy and savings."],
            ["Direct Store Links", "Shop directly on Amazon, Flipkart, and brand stores."],
            ["Multiple Platforms", "Find deals across India's top marketplaces."],
            ["Deal Codes", "Apply exclusive codes for instant savings at checkout."],
            ["Trusted Stores", "Links only to official store pages and brand websites."],
            ["Free to Use", "Browse and shop deals without any subscription fees."],
          ].map(([title, desc]) => (
            <div key={title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ color: "var(--accent)", fontSize: 20, lineHeight: 1.4 }}>✓</span>
              <div>
                <strong style={{ fontSize: 15 }}>{title}</strong>
                <p style={{ margin: "4px 0 0", color: "var(--ink-soft)", fontSize: 14 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--brand-soft)", borderRadius: "var(--radius-lg)", padding: 32, textAlign: "center" }}>
        <h2 style={{ marginBottom: 12 }}>Ready to find great deals?</h2>
        <p style={{ margin: "0 0 20px", color: "var(--ink-soft)" }}>
          Browse our verified deals and save on products you'll love.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" className="btn">Sign up</Link>
          <Link href="/browse" className="btn btn-outline">Browse deals</Link>
        </div>
      </div>
    </div>
  );
}