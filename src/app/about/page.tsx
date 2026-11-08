import Link from "next/link";
import { getSettings } from "@/lib/settings";

export const metadata = {
  title: "About Us | Brand Promotion",
  description: "Learn about Brand Promotion - India's #1 influencer refunds and brand deals platform.",
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
        We connect verified reviewers with brands for honest product reviews and 100% refunds on
        purchases from Amazon, Flipkart, Myntra, and direct brand stores.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, marginBottom: 40 }}>
        <div className="card" style={{ padding: 28 }}>
          <h3 style={{ color: "var(--brand)", marginBottom: 12 }}>Our Mission</h3>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 15 }}>
            To create a transparent marketplace where brands get authentic reviews and reviewers
            earn real refunds — with no hidden fees, no subscriptions, and direct UPI payouts.
          </p>
        </div>
        <div className="card" style={{ padding: 28 }}>
          <h3 style={{ color: "var(--brand)", marginBottom: 12 }}>How It Works</h3>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 15 }}>
            Browse live brand campaigns, place your order, submit proof (screenshot + price breakup),
            post an honest review, and get reimbursed 100% straight to your UPI or bank account.
          </p>
        </div>
        <div className="card" style={{ padding: 28 }}>
          <h3 style={{ color: "var(--brand)", marginBottom: 12 }}>For Brands</h3>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 15 }}>
            Reach thousands of verified reviewers who actually buy and review your products.
            Set your campaign budget, control slots, and track every order from submission to payout.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 40 }}>
        <h2 style={{ marginBottom: 20 }}>Why Reviewers Choose Us</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {[
            ["100% Refunds", "Get the full purchase amount reimbursed to your UPI or bank account."],
            ["Verified Payouts", "Every payout is tracked with a UTR reference for transparency."],
            ["Multiple Platforms", "Shop from Amazon, Flipkart, Myntra, or direct brand stores."],
            ["Screenshot Verification", "Submit order and price breakup screenshots for instant verification."],
            ["Dedicated Support", "24/7 support via WhatsApp, Telegram, and email."],
            ["No Subscription", "Join free. Pay nothing. Earn only when you complete a campaign."],
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
        <h2 style={{ marginBottom: 12 }}>Ready to start?</h2>
        <p style={{ margin: "0 0 20px", color: "var(--ink-soft)" }}>
          Join thousands of verified reviewers earning refunds today.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" className="btn">Join free</Link>
          <Link href="/browse" className="btn btn-outline">Browse deals</Link>
        </div>
      </div>
    </div>
  );
}