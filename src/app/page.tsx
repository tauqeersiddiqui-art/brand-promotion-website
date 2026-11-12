import Link from "next/link";
import { db } from "@/lib/db";
import DealCard, { type Deal } from "@/components/DealCard";
import AdSlot from "@/components/AdSlot";
import { getSettings, whatsappLink, telegramLink } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const settings = getSettings();

  const featured = db
    .prepare(
      `SELECT id, title, description, category, image_url, coupon_code,
              price_original, price_sale, stock, featured, product_code,
              platform, deal_type, total_slots, claimed_slots, refund_amount
       FROM deals WHERE active = 1 AND approval_status = 'approved' AND featured = 1
       ORDER BY datetime(created_at) DESC LIMIT 8`
    )
    .all() as unknown as Deal[];

  const categories = (
    db
      .prepare(
        `SELECT DISTINCT category FROM deals
         WHERE active = 1 AND approval_status = 'approved' AND category != ''
         ORDER BY category LIMIT 12`
      )
      .all() as { category: string }[]
  ).map((c) => c.category);

  const totalDisbursed = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS r FROM reimbursements
         WHERE status = 'paid'`
      )
      .get() as { r: number }
  ).r;

  const totals = {
    deals: (db.prepare("SELECT COUNT(*) AS c FROM deals WHERE active = 1 AND approval_status = 'approved'").get() as { c: number }).c,
    orders: (db.prepare("SELECT COUNT(*) AS c FROM orders").get() as { c: number }).c,
    reimbursements: (db.prepare("SELECT COUNT(*) AS c FROM reimbursements WHERE status = 'paid'").get() as { c: number }).c,
    disbursed: totalDisbursed > 0 ? Math.round(totalDisbursed) : 0,
  };

  // Deterministic per-day rotation index so the same deal shows all day and
  // adding a new campaign doesn't instantly bump the card away.
  const dayIndex = Math.floor(Date.now() / 86400000);

  return (
    <>
      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <span className="badge badge-brand">
            Brand deals &amp; instant savings
          </span>

          <h1>
            Find hot deals on Amazon, Flipkart &amp; brand stores.<br />
            Save up to 100% with verified offers.
          </h1>

          <p className="sub">
            Browse featured deals on India's leading marketplaces. Purchase
            directly on the store's website with exclusive savings.
          </p>

          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-num" style={{ color: "var(--accent)" }}>
                {totals.deals.toLocaleString("en-IN")}
              </div>
              <div className="stat-label">Live deals</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{totals.orders.toLocaleString("en-IN")}</div>
              <div className="stat-label">Orders placed</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">₹{totals.disbursed.toLocaleString("en-IN")}+</div>
              <div className="stat-label">Saved by users</div>
            </div>
            <div className="stat-card">
              <div className="stat-num" style={{ color: "var(--brand)" }}>
                100%
              </div>
              <div className="stat-label">Verified deals</div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <div className="assurance-bar">
        <div className="container assurance-inner">
          <span className="trust-item">Verified deals</span>
          <span className="trust-item">Direct store links</span>
          <span className="trust-item">Instant savings</span>
          <span className="trust-item">Category selection</span>
        </div>
      </div>

      {/* Featured deals, rotated per day */}
      {featured.length > 0 && (
        <section className="container section" style={{ paddingBottom: 24 }}>
          <div className="section-head" style={{ textAlign: "center", justifyContent: "center" }}>
            <h2>Featured deal</h2>
            <p className="muted" style={{ margin: "6px auto 0", maxWidth: 560, textAlign: "center" }}>
              Hand-picked deal from our top brands. New deals added regularly.
            </p>
          </div>
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <DealCard deal={featured[dayIndex % featured.length]} />
          </div>
        </section>
      )}

      {/* How to shop */}
      <section id="how-to-shop" className="container section" style={{ marginTop: 8 }}>
        <div className="section-head" style={{ textAlign: "center", justifyContent: "center" }}>
          <h2>How to shop deals</h2>
          <p className="muted" style={{ margin: "6px auto 0", maxWidth: 620, textAlign: "center" }}>
            Three simple steps to get your savings.
          </p>
        </div>
        <div className="steps-grid">
          {[
            {
              num: "01",
              title: "Browse deals",
              desc: "Explore verified deals on Amazon, Flipkart, and brand stores. Check the savings.",
            },
            {
              num: "02",
              title: "Shop directly",
              desc: "Click 'Shop on' to visit the store. Use the deal code for instant savings.",
            },
            {
              num: "03",
              title: "Enjoy your purchase",
              desc: "Complete checkout on the store's site. Deal prices apply automatically.",
            },
          ].map((s) => (
            <div className="step-card" key={s.num}>
              <div className="step-badge">{s.num}</div>
              <div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Category feed */}
      {settings.telegram && (
        <section className="container" style={{ paddingBottom: 10 }}>
          <div
            className="card"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 24,
              alignItems: "center",
              padding: 26,
              background:
                "radial-gradient(420px 200px at 0% 0%, rgba(56, 189, 248, 0.10), transparent 65%), var(--surface)",
            }}
          >
            <div>
              <span className="badge badge-brand">Category feed</span>
              <h3 style={{ margin: "10px 0 6px", fontSize: 20 }}>
                Get new deals on Telegram first
              </h3>
              <p
                className="muted"
                style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.6, maxWidth: 560 }}
              >
                New deals are posted to our channel the moment they go live.
                Scan the QR code or tap the button to join and never miss a deal.
              </p>
              <a
                href={telegramLink(settings.telegram)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
                style={{ background: "linear-gradient(135deg, #229ED9, #38bdf8)" }}
              >
                Join @{settings.telegram.replace(/^@/, "")} on Telegram
              </a>
            </div>
            <img
              src="/brandreviewer-telegram-qr.png"
              alt={`Telegram QR code for @${settings.telegram.replace(/^@/, "")}`}
              width={150}
              height={150}
              style={{
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "#fff",
                padding: 6,
                justifySelf: "center",
              }}
            />
          </div>
        </section>
      )}

      {/* Trust banner */}
      <section className="container section">
        <div className="card trust-banner" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 30, alignItems: "center" }}>
          <div>
            <span className="badge badge-brand">Deal guarantee</span>
            <h3 style={{ margin: "10px 0 8px", fontSize: 20 }}>Verified deals with direct store shopping</h3>
            <p className="muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6 }}>
              Every deal is verified for authenticity. Click through to shop directly on
              the marketplace or brand store. Savings are applied automatically.
            </p>
            <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {settings.whatsapp && (
                <a
                  href={whatsappLink(settings.whatsapp, "Hi, I have a question about a deal.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm"
                  style={{ background: "#25d366" }}
                >
                  WhatsApp support
                </a>
              )}
              <Link href="/terms" className="btn btn-outline btn-sm">
                Deal terms
              </Link>
            </div>
          </div>
          <div style={{ background: "var(--card)", padding: 20, borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
            <h4 style={{ margin: "0 0 10px", fontSize: 15, color: "var(--ink)" }}>How to shop:</h4>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--ink-soft)", fontSize: 13.5, display: "flex", flexDirection: "column", gap: 7 }}>
              <li>Click "Shop on" to visit the store directly.</li>
              <li>Use the deal code at checkout for savings.</li>
              <li>Save the product page for easy access.</li>
              <li>Check stock availability before purchasing.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container section">
        <div className="section-head" style={{ textAlign: "center", justifyContent: "center" }}>
          <h2>Frequently asked questions</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
          {[
            {
              q: "How do I get the deal price?",
              a: "Click 'Shop on' to visit the store directly. The deal discount applies at checkout. No separate refund process needed.",
            },
            {
              q: "What deal codes are available?",
              a: "Each deal page shows a unique coupon code. Apply it during checkout on the store's site for instant savings.",
            },
            {
              q: "Can I track my order?",
              a: "Order tracking is handled by the store. You need a free account to access deal history and saved items.",
            },
            {
              q: "What if a deal is sold out?",
              a: "Deal inventory is limited. Check back later or join our Telegram channel for new deal alerts and inventory updates.",
            },
          ].map((faq, i) => (
            <div className="card" key={i}>
              <h4 style={{ margin: "0 0 8px", fontSize: 15, color: "var(--ink)" }}>Q. {faq.q}</h4>
              <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
