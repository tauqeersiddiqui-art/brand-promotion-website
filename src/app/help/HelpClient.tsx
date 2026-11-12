"use client";

import { useState } from "react";
import Link from "next/link";
import type { SiteSettings } from "@/lib/settings";

export default function HelpClient({ settings }: { settings: SiteSettings }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      q: "How do I shop a deal?",
      a: "Click on any deal to view details. Click 'Shop on' to visit the store directly. Apply the deal code at checkout for your savings.",
    },
    {
      q: "What if the deal code doesn't work?",
      a: "Deal codes are verified daily. If expired, the price may have updated. Check the deal page for the latest details or try another active deal.",
    },
    {
      q: "Are these real discounts?",
      a: "Yes! All deals are verified by our team. We confirm each discount is legitimate and available on the store's website.",
    },
    {
      q: "How do I verify a deal?",
      a: "Visit the store through our 'Shop on' link, search for the product, or apply the provided code to see the discounted price.",
    },
    {
      q: "Who handles my order?",
      a: "Orders are processed directly by the marketplace or brand store. They handle shipping, returns, and refunds according to their policies.",
    },
    {
      q: "Can I track my order?",
      a: "Order tracking is handled by the store where you purchased. Use the order ID from your confirmation email.",
    },
    {
      q: "Is this platform free to use?",
      a: "Yes! There are no fees to browse deals. All deal links lead to free shopping on partner stores.",
    },
    {
      q: "Why is a deal sold out?",
      a: "Deal inventory is limited and shared across users. If sold out, check back later or browse other available deals.",
    },
  ];

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60, maxWidth: 860 }}>
      <nav style={{ marginBottom: 24, fontSize: 14 }}>
        <Link href="/">Home</Link> {" > "} <span style={{ color: "var(--ink-soft)" }}>Help &amp; Support</span>
      </nav>

      <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", marginBottom: 8 }}>
        Help &amp; Support
      </h1>
      <p style={{ fontSize: 17, color: "var(--ink-soft)", marginBottom: 40, maxWidth: 600 }}>
        Find answers to common questions about deals or contact our support team.
      </p>

      {/* Quick Actions */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 40 }}>
        <Link href="/browse" className="btn btn-outline">
          Browse Deals
        </Link>
        <Link href="/account" className="btn btn-outline">
          My Account
        </Link>
        {settings.whatsapp && (
          <a
            href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}?text=Hi%2C%20I%20need%20help%20with%20a%20deal.`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
          >
            WhatsApp Support
          </a>
        )}
        {settings.telegram && (
          <a
            href={`https://t.me/${settings.telegram.replace("@", "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
          >
            Telegram Support
          </a>
        )}
      </div>

      {/* FAQ Accordion */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {faqs.map((faq, i) => (
          <div key={i} className="card" style={{ padding: 0, overflow: "hidden" }}>
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                padding: "16px 20px",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 15,
                fontWeight: 600,
                color: "var(--ink)",
              }}
            >
              <span>{faq.q}</span>
              <span style={{ fontSize: 20, color: "var(--brand)", transition: "transform 0.2s", transform: openIndex === i ? "rotate(45deg)" : "rotate(0)" }}>+</span>
            </button>
            {openIndex === i && (
              <div style={{ padding: "0 20px 16px", color: "var(--ink-soft)", fontSize: 14, lineHeight: 1.7 }}>
                {faq.a}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Still need help? */}
      <div style={{ marginTop: 40, background: "var(--brand-soft)", borderRadius: "var(--radius-lg)", padding: 28, textAlign: "center" }}>
        <h3 style={{ marginBottom: 8 }}>Need more help?</h3>
        <p style={{ margin: "0 0 16px", color: "var(--ink-soft)", fontSize: 14 }}>
          Our support team is available 24/7 via WhatsApp and Telegram.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          {settings.whatsapp && (
            <a
              href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}?text=Hi%2C%20I%20need%20help%20with%20a%20deal.`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ background: "#25D366" }}
            >
              💬 WhatsApp
            </a>
          )}
          {settings.telegram && (
            <a
              href={`https://t.me/${settings.telegram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ background: "#0088cc" }}
            >
              ✈️ Telegram
            </a>
          )}
          {settings.support_email && (
            <a href={`mailto:${settings.support_email}`} className="btn btn-outline">
              ✉️ Email
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
