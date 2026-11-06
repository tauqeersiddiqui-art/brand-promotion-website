import Link from "next/link";
import { db } from "@/lib/db";
import DealCard, { type Deal } from "@/components/DealCard";
import HomeActionTabs from "@/components/HomeActionTabs";
import AdSlot from "@/components/AdSlot";
import { getSettings, whatsappLink, telegramLink } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const settings = getSettings();

  const featured = db
    .prepare(
      `SELECT id, title, description, category, image_url, coupon_code,
              price_original, price_sale, stock, featured, product_code,
              platform, deal_type, total_slots, claimed_slots, cashback_amount
       FROM deals WHERE active = 1 AND approval_status = 'approved' AND featured = 1
       ORDER BY datetime(created_at) DESC LIMIT 8`
    )
    .all() as unknown as Deal[];

  const latest = (
    db
      .prepare(
        `SELECT id, title, description, category, image_url, coupon_code,
                price_original, price_sale, stock, featured, product_code,
                platform, deal_type, total_slots, claimed_slots, cashback_amount
         FROM deals WHERE active = 1 AND approval_status = 'approved'
         ORDER BY datetime(created_at) DESC LIMIT 12`
      )
      .all() as unknown as Deal[]
  ).filter((d) => !featured.some((f) => f.id === d.id));

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

  const showFeatured = featured.slice(0, 8);
  const showLatest = latest.slice(0, 4);

  return (
    <>
      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <span className="badge badge-brand">
            Brand promotion &amp; review cashback
          </span>

          <h1>
            Buy great products. Share honest reviews.<br />
            Get 100% cashback straight to your UPI.
          </h1>

          <p className="sub">
            Join verified reviewers earning cashback on Amazon, Flipkart and
            direct brand stores. Purchase, post your proof, and get paid —
            with UTR tracking on every payout.
          </p>

          <div className="hero-ctas">
            <Link href="#campaigns" className="btn">
              Browse live deals
            </Link>
            <Link href="/claim" className="btn btn-outline">
              Claim cashback
            </Link>
            {settings.telegram && (
              <a
                href={telegramLink(settings.telegram)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
              >
                Join Telegram channel
              </a>
            )}
          </div>

          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-num" style={{ color: "var(--brand)" }}>
                ₹{totals.disbursed.toLocaleString("en-IN")}+
              </div>
              <div className="stat-label">Paid out to reviewers</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{totals.orders}+</div>
              <div className="stat-label">Order proofs tracked</div>
            </div>
            <div className="stat-card">
              <div className="stat-num">{totals.deals}+</div>
              <div className="stat-label">Live brand campaigns</div>
            </div>
            <div className="stat-card">
              <div className="stat-num" style={{ color: "var(--accent)" }}>
                100%
              </div>
              <div className="stat-label">Guaranteed payouts</div>
            </div>
          </div>
        </div>
      </section>

      {/* Assurance bar */}
      <div className="assurance-bar">
        <div className="container assurance-inner">
          <span className="trust-item">100% cashback deals</span>
          <span className="trust-item">UPI payouts with UTR</span>
          <span className="trust-item">Brand-funded campaigns</span>
          <span className="trust-item">Verified reviewer slots</span>
        </div>
      </div>

      {/* Category strip */}
      {categories.length > 0 && (
        <div className="container">
          <div className="category-strip">
            <Link href="/browse" className="category-chip">
              All deals
            </Link>
            {categories.map((c) => (
              <Link
                key={c}
                href={`/browse?category=${encodeURIComponent(c)}`}
                className="category-chip"
              >
                {c}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Featured Deals */}
      {showFeatured.length > 0 && (
        <section className="container section" id="campaigns" style={{ paddingBottom: 24 }}>
          <div className="section-head">
            <div>
              <h2>Deals of the day</h2>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
                Featured brand campaigns with open reviewer slots.
              </p>
            </div>
            <Link href="/browse" className="link">
              View all {totals.deals} campaigns →
            </Link>
          </div>
          <div className="deal-grid">
            {showFeatured.map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </section>
      )}

      {/* Ad slot */}
      <div className="container">
        <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME} format="horizontal" />
      </div>

      {/* Fresh drops */}
      {showLatest.length > 0 && (
        <section className="container" style={{ paddingBottom: 24 }}>
          <div className="section-head">
            <div>
              <h2>New arrivals</h2>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
                Fresh offers across electronics, beauty, home and fitness.
              </p>
            </div>
            <Link href="/browse" className="link">
              View all →
            </Link>
          </div>
          <div className="deal-grid">
            {showLatest.map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </section>
      )}

      {showFeatured.length === 0 && showLatest.length === 0 && (
        <section className="container section">
          <div className="empty-state card">
            <h3>Campaigns are being restocked</h3>
            <p className="muted">
              New brand campaigns drop regularly. Join the Telegram channel to
              get notified the moment slots open.
            </p>
            <Link href="/browse" className="btn">
              Check live deals
            </Link>
          </div>
        </section>
      )}

      {/* Quick actions (forms) */}
      <HomeActionTabs />

      {/* How it works */}
      <section className="container section" style={{ marginTop: 8 }}>
        <div className="section-head" style={{ textAlign: "center", justifyContent: "center" }}>
          <h2>How it works</h2>
          <p className="muted" style={{ margin: "6px auto 0", maxWidth: 620, textAlign: "center" }}>
            Four steps from purchase to cashback in your UPI handle.
          </p>
        </div>
        <div className="steps-grid">
          {[
            {
              num: "01",
              title: "Pick a campaign",
              desc: "Choose a live deal with open slots and search the target keyword on Amazon or Flipkart.",
            },
            {
              num: "02",
              title: "Order & submit proof",
              desc: "Buy at retail price and upload your order confirmation plus price breakup screenshots.",
            },
            {
              num: "03",
              title: "Post your review",
              desc: "After delivery, publish a genuine 5-star review with product photos on the marketplace.",
            },
            {
              num: "04",
              title: "Get paid via UPI",
              desc: "Submit your live review link and UPI ID. Cashback is disbursed with a bank UTR reference.",
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

      {/* Telegram channel */}
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
              <span className="badge badge-brand">Telegram community</span>
              <h3 style={{ margin: "10px 0 6px", fontSize: 20 }}>
                Get every new deal on Telegram first
              </h3>
              <p
                className="muted"
                style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.6, maxWidth: 560 }}
              >
                New campaigns are posted to our channel the moment they go live.
                Scan the QR code or tap the button to join and grab reviewer
                slots before they fill up.
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
            <span className="badge badge-brand">Reviewer protection</span>
            <h3 style={{ margin: "10px 0 8px", fontSize: 20 }}>Payout security with UTR tracking</h3>
            <p className="muted" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6 }}>
              Every campaign is pre-funded by brands and mediators. Once your
              review goes live, proof is verified and the payout is sent
              directly to your UPI ID with a valid bank UTR reference.
            </p>
            <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {settings.whatsapp && (
                <a
                  href={whatsappLink(settings.whatsapp, "Hi, I have a question about my cashback payout.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm"
                  style={{ background: "#25d366" }}
                >
                  WhatsApp helpdesk
                </a>
              )}
              <Link href="/terms" className="btn btn-outline btn-sm">
                Campaign rules
              </Link>
            </div>
          </div>
          <div style={{ background: "var(--card)", padding: 20, borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
            <h4 style={{ margin: "0 0 10px", fontSize: 15, color: "var(--ink)" }}>Campaign guidelines:</h4>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)", fontSize: 13.5, display: "flex", flexDirection: "column", gap: 7 }}>
              <li>Do not cancel or return the product after reimbursement.</li>
              <li>Order ID and amount must match your invoice screenshots.</li>
              <li>Post genuine 5-star reviews with at least 1–2 product photos.</li>
              <li>Double-check your UPI ID before submitting a claim.</li>
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
              q: "How does 100% cashback work?",
              a: "Brands fund promotion budgets to get genuine product reviews. You buy the product on Amazon or Flipkart, submit your order proof, post a review after delivery, and receive 100% of your purchase amount back via UPI.",
            },
            {
              q: "When do I receive my payout?",
              a: "Once your review proof is verified, reimbursements are processed within 24 to 48 hours and sent to your UPI ID with a UTR reference.",
            },
            {
              q: "Can I track without an account?",
              a: "Tracking is private, so you need a free account. Log in, then open the Track Status page and search with your marketplace Order ID or BP tracking code to see the live order and payout status.",
            },
            {
              q: "What if all slots are full?",
              a: "Each campaign has a capped number of reviewer slots. Follow our Telegram channel for slot refills and new campaign drops.",
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
