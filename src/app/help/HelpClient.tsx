"use client";

import { useState } from "react";
import Link from "next/link";
import type { SiteSettings } from "@/lib/settings";

export default function HelpClient({ settings }: { settings: SiteSettings }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      q: "How do I submit my order proof?",
      a: "Go to any live deal and click 'Submit Order'. Fill in your details, upload your order screenshot and price breakup screenshot, then submit. Our OCR system will verify the order automatically.",
    },
    {
      q: "How long does refund reimbursement take?",
      a: "After your review is approved, refunds are processed within 24–48 hours. You'll receive a UTR reference number in your account dashboard.",
    },
    {
      q: "What screenshots do I need to upload?",
      a: "You need two screenshots: (1) Order confirmation page showing the order ID and total amount, and (2) Price breakup/screenshot showing item price, taxes, and final amount paid.",
    },
    {
      q: "Can I cancel my order after submission?",
      a: "Yes. Go to Cancel → Search your order code → Click 'Request Cancellation'. Note: cancellations are only allowed before delivery.",
    },
    {
      q: "What is a mediator?",
      a: "Mediators are support representatives who help you with deal submissions, verification, and payout issues. You can contact them via WhatsApp or Telegram.",
    },
    {
      q: "How do I track my order status?",
      a: "Use the Track Status page — enter your order code and email to see real-time progress of verification and payout.",
    },
    {
      q: "Is this platform free to use?",
      a: "Yes! There's no subscription fee. You earn refunds by completing deals — brands pay for reviews, and you share a portion as refunds.",
    },
    {
      q: "Why was my order rejected?",
      a: "Common reasons: unclear screenshots, wrong deal selection, expired coupon, or mismatched amounts. Our team will notify you with a reason when rejection occurs.",
    },
  ];

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60, maxWidth: 860 }}>
      <nav style={{ marginBottom: 24, fontSize: 14 }}>
        <Link href="/">Home</Link> {" > "} <span style={{ color: "var(--muted)" }}>Need Help?</span>
      </nav>

      <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", marginBottom: 8 }}>
        Need Help?
      </h1>
      <p style={{ fontSize: 17, color: "var(--muted)", marginBottom: 40, maxWidth: 600 }}>
        Find answers to common questions or contact our support team directly.
      </p>

      {/* Quick Actions */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 40 }}>
        <Link href="/track" className="btn btn-outline">
          Track Order
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
        <h3 style={{ marginBottom: 8 }}>Still need help?</h3>
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
