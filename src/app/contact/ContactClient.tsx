"use client";

import { useState } from "react";
import Link from "next/link";

export default function ContactClient({
  whatsappHref,
  telegramHref,
  supportEmail,
}: {
  whatsappHref: string;
  telegramHref: string;
  supportEmail: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("Deal / Store Question");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Simulate brief sending or save inquiry
    await new Promise((resolve) => setTimeout(resolve, 800));
    setBusy(false);
    setSubmitted(true);
  }

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 80, maxWidth: 880 }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/" className="link">
          ← Back to Home
        </Link>
      </div>

      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
            <span className="badge badge-brand">
              Deal support
            </span>
            <h1 style={{ fontSize: 32, margin: "10px 0 6px", letterSpacing: "-0.02em" }}>
              Get in touch with our team
            </h1>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            Have questions about a deal, store access, or general inquiries? We&apos;re here to help!
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, marginTop: 24 }}>
        {/* Contact Info Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ padding: 22 }}>
            <div style={{ fontSize: 24, marginBottom: 8, fontWeight: 800, color: "var(--brand)" }} aria-hidden="true">—</div>
            <h3 style={{ margin: "0 0 6px", fontSize: 17 }}>Instant WhatsApp support</h3>
            <p className="muted" style={{ margin: "0 0 12px", fontSize: 13.5 }}>
              Chat directly with our deal specialists for help with discounts, store access, or deal codes.
            </p>
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm"
                style={{ background: "#25d366" }}
              >
                Chat on WhatsApp ↗
              </a>
            ) : (
              <span className="muted" style={{ fontSize: 13 }}>WhatsApp support is temporarily unavailable.</span>
            )}
          </div>

          <div className="card" style={{ padding: 22 }}>
            <div style={{ fontSize: 24, marginBottom: 8, fontWeight: 800, color: "var(--ink-soft)" }} aria-hidden="true">—</div>
            <h3 style={{ margin: "0 0 6px", fontSize: 17 }}>Telegram deal channel</h3>
            <p className="muted" style={{ margin: "0 0 12px", fontSize: 13.5 }}>
              Join our Telegram community to get instant alerts on new deals and stock updates.
            </p>
            {telegramHref ? (
              <a
                href={telegramHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
              >
                Join Telegram ↗
              </a>
            ) : (
              <span className="muted" style={{ fontSize: 13 }}>The Telegram channel is being set up.</span>
            )}
          </div>

          <div className="card" style={{ padding: 22 }}>
            <div style={{ fontSize: 24, marginBottom: 8, fontWeight: 800, color: "var(--ink-soft)" }} aria-hidden="true">—</div>
            <h3 style={{ margin: "0 0 6px", fontSize: 17 }}>Email support</h3>
            <p className="muted" style={{ margin: "0 0 10px", fontSize: 13.5 }}>
              For brand partnerships, questions, or general inquiries:
            </p>
            <code style={{ background: "var(--bg)", padding: "4px 8px", borderRadius: 6, fontSize: 13 }}>
              {supportEmail}
            </code>
          </div>
        </div>

        {/* Contact Form */}
        <div className="card" style={{ padding: 28 }}>
          {submitted ? (
            <div style={{ textAlign: "center", padding: "36px 10px" }}>
              <div className="muted" style={{ fontSize: 44, marginBottom: 12, display: "block" }}>—</div>
              <h3 style={{ margin: "0 0 8px" }}>Message received!</h3>
              <p className="muted" style={{ fontSize: 14, margin: "0 0 20px" }}>
                Our support desk has received your ticket and will respond within 4-12 hours.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSubmitted(false);
                  setMessage("");
                  setOrderId("");
                }}
              >
                Send Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>Submit a Support Ticket</h3>
              <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
                Fill out the form below with your query or deal details.
              </p>

              <div>
                <label className="form-label">Your Full Name *</label>
                <input
                  className="input"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
                <div>
                  <label className="form-label">Email Address *</label>
                  <input
                    className="input"
                    type="email"
                    required
                    placeholder="name@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">WhatsApp Number *</label>
                  <input
                    className="input"
                    type="tel"
                    required
                    placeholder="10-digit number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
                <div>
                  <label className="form-label">Inquiry Type</label>
                  <select
                    className="input"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  >
                    <option>Deal / Store Question</option>
                    <option>Deal Code Issue</option>
                    <option>Product Availability</option>
                    <option>Brand Partnership Inquiry</option>
                    <option>Other Question</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Deal ID or Name (Optional)</label>
                  <input
                    className="input"
                    placeholder="Deal name or ID"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Message Details *</label>
                <textarea
                  className="input"
                  rows={4}
                  required
                  placeholder="Explain your question or provide any relevant details…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              <button className="btn mt" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
                {busy ? "Submitting Ticket…" : "📩 Send Support Request"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
