import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { discountPct } from "@/components/DealCard";
import SubmitOrderProofForm from "@/components/SubmitOrderProofForm";
import AdSlot from "@/components/AdSlot";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: idRaw } = await params;
  const id = parseInt(idRaw, 10);
  if (!Number.isInteger(id) || id < 1) return { title: "Deal not found" };

  const deal = db
    .prepare(
      "SELECT title, description, image_url, price_sale, price_original FROM deals WHERE id = ? AND active = 1 AND approval_status = 'approved'"
    )
    .get(id) as
    | { title: string; description: string; image_url: string; price_sale: number; price_original: number }
    | undefined;
  if (!deal) return { title: "Deal not found" };

  const price = `₹${Number(deal.price_sale).toLocaleString("en-IN")}`;
  const description = (
    deal.description?.trim() ||
    `${deal.title} — featured live deal at ${price}.`
  ).slice(0, 155);
  const path = `/deal/${id}`;

  return {
    title: deal.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title: deal.title,
      description,
      url: path,
      images: deal.image_url ? [{ url: deal.image_url, alt: deal.title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: deal.title,
      description,
      images: deal.image_url ? [deal.image_url] : undefined,
    },
  };
}

type DealRow = {
  id: number;
  title: string;
  description: string;
  category: string;
  image_url: string;
  coupon_code: string;
  price_original: number;
  price_sale: number;
  stock: number;
  featured: number;
  active: number;
  deal_url: string;
  product_code?: string;
  platform?: string;
  deal_type?: string;
  total_slots?: number;
  claimed_slots?: number;
  target_keyword?: string;
  instructions?: string;
  refund_amount?: number;
  review_amount?: number;
  rating_amount?: number;
  only_order_amount?: number;
  order_form_url?: string;
  refund_form_url?: string;
};

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idRaw } = await params;
  const id = parseInt(idRaw, 10);
  if (!Number.isInteger(id) || id < 1) notFound();

  const deal = db
    .prepare("SELECT * FROM deals WHERE id = ? AND active = 1 AND approval_status = 'approved'")
    .get(id) as DealRow | undefined;
  if (!deal) notFound();

  const reviews = db
    .prepare(
      `SELECT rv.rating, rv.text, rv.screenshot_url, rv.created_at, u.name AS user_name
       FROM reviews rv JOIN users u ON u.id = rv.user_id
       WHERE rv.deal_id = ? AND rv.status = 'approved'
       ORDER BY datetime(rv.created_at) DESC LIMIT 20`
    )
    .all(id) as { rating: number; text: string; screenshot_url: string; created_at: string; user_name: string }[];

  const avgRating =
    reviews.length > 0
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
      : 0;

  const disc = discountPct(deal);
  const totalSlots = deal.total_slots || 50;
  const claimedSlots = deal.claimed_slots || 0;
  const remainingSlots = Math.max(0, totalSlots - claimedSlots);
  const outOfSlots = remainingSlots <= 0;
  const isFullRefund = deal.refund_amount && deal.refund_amount >= deal.price_sale;

  // Product structured data: lets Google show price, availability and the
  // review rating directly in search results.
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: deal.title,
    description: deal.description || deal.title,
    ...(deal.image_url ? { image: [deal.image_url] } : {}),
    category: deal.category,
    ...(deal.product_code ? { sku: deal.product_code, mpn: deal.product_code } : {}),
    brand: { "@type": "Brand", name: deal.platform || "Brand Deals Hub" },
    offers: {
      "@type": "Offer",
      price: Number(deal.price_sale),
      priceCurrency: "INR",
      availability: outOfSlots
        ? "https://schema.org/SoldOut"
        : "https://schema.org/InStock",
      url: `${siteUrl()}/deal/${deal.id}`,
    },
    ...(avgRating > 0 && reviews.length > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: avgRating,
            reviewCount: reviews.length,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <script
        type="application/ld+json"
        // JSON.stringify + `<` escaping keeps user-entered title/description
        // from closing the script tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div style={{ marginBottom: 16 }}>
        <Link href="/browse" className="link" style={{ fontSize: 14 }}>
          ← Back to all deals
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 28,
          alignItems: "start",
        }}
      >
        {/* Deal media & campaign info */}
        <div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="deal-media" style={{ aspectRatio: "1 / 1" }}>
              {deal.image_url ? (
                <img src={deal.image_url} alt={deal.title} />
              ) : (
                <div className="deal-placeholder">—</div>
              )}
              {isFullRefund ? (
                <span className="deal-tag deal-tag-deal">Instant savings</span>
              ) : disc > 0 ? (
                <span className="deal-tag deal-tag-discount">{disc}% off</span>
              ) : null}

              {deal.featured === 1 && (
                <span className="deal-tag" style={{ background: "var(--warn)", color: "#ffffff" }}>★ Deal</span>
              )}
            </div>
          </div>

          <div className="card mt">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="deal-cat">{deal.category}</span>
              {deal.platform && (
                <span className="badge badge-outline" style={{ textTransform: "uppercase", fontSize: 11 }}>
                  {deal.platform}
                </span>
              )}
            </div>

            <h1 style={{ margin: "10px 0 12px", fontSize: 26, letterSpacing: "-0.02em" }}>
              {deal.title}
            </h1>

            {deal.product_code && (
              <div style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 10 }}>
                Deal code: <code style={{ color: "var(--brand)" }}>{deal.product_code}</code>
              </div>
            )}

            <div className="deal-prices" style={{ marginBottom: 18 }}>
              <span className="price-now" style={{ fontSize: 26 }}>
                ₹{deal.price_sale.toLocaleString("en-IN")}
              </span>
              {disc > 0 && (
                <span className="price-was" style={{ fontSize: 16 }}>
                  ₹{deal.price_original.toLocaleString("en-IN")}
                </span>
              )}
              {isFullRefund && (
                <span className="pill pill-deal" style={{ fontSize: 12, marginLeft: "auto" }}>
                  Special offer
                </span>
              )}
            </div>

            {Number(deal.refund_amount) > 0 && (
              <div
                style={{
                  background: "var(--brand-soft)",
                  border: "1px solid #c7d2fe",
                  borderRadius: "var(--radius-lg)",
                  padding: "12px 16px",
                  marginBottom: 18,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  alignItems: "center",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#1e1b4b",
                }}
              >
                <span>Special offer</span>
                <strong>₹{deal.price_sale.toLocaleString("en-IN")}</strong>
                <span>→</span>
                <strong style={{ color: "var(--brand)" }}>₹{Number(deal.refund_amount).toLocaleString("en-IN")}</strong>
                <span>→</span>
                <span style={{ color: "var(--brand)" }}>
                  net ₹{Math.max(0, deal.price_sale - Number(deal.refund_amount)).toLocaleString("en-IN")}
                </span>
              </div>
            )}

            <div
              style={{
                background: "var(--bg-soft)",
                padding: 14,
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border)",
                marginBottom: 18,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                <span style={{ color: remainingSlots <= 5 ? "var(--danger)" : "var(--accent)" }}>
                  {remainingSlots} deals available
                </span>
                <span className="muted">{claimedSlots} / {totalSlots} claimed</span>
              </div>
              <div className="slot-bar-wrap" style={{ marginTop: 8 }}>
                <div
                  className="slot-bar-fill"
                  style={{
                    width: `${Math.min(100, Math.round((claimedSlots / totalSlots) * 100))}%`,
                    background: remainingSlots <= 5 ? "var(--danger)" : undefined,
                  }}
                />
              </div>
            </div>

            {deal.target_keyword && (
              <div
                style={{
                  background: "var(--brand-soft)",
                  border: "1px solid #c7d2fe",
                  padding: 14,
                  borderRadius: "var(--radius-lg)",
                  marginBottom: 18,
                }}
              >
                <div style={{ fontSize: 11.5, textTransform: "uppercase", color: "#6366f1", fontWeight: 800 }}>
                  Search keyword on {deal.platform || "the marketplace"}:
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1e1b4b", marginTop: 4 }}>
                  “{deal.target_keyword}”
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                  Search this exact keyword to find the brand listing.
                </div>
              </div>
            )}

            <p style={{ color: "var(--ink-soft)", fontSize: 14.5, lineHeight: 1.7 }}>
              {deal.description}
            </p>

            {(Number(deal.review_amount) > 0 ||
              Number(deal.rating_amount) > 0 ||
              Number(deal.only_order_amount) > 0) && (
              <div
                style={{
                  background: "var(--bg-soft)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: 14,
                  margin: "18px 0 0",
                }}
              >
                <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Offer details</h4>
                <div style={{ display: "grid", gap: 8 }}>
                  {Number(deal.review_amount) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span>Review deal (₹{Number(deal.review_amount).toLocaleString("en-IN")} credited)</span>
                    </div>
                  )}
                  {Number(deal.rating_amount) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span>Rating deal (₹{Number(deal.rating_amount).toLocaleString("en-IN")})</span>
                    </div>
                  )}
                  {Number(deal.only_order_amount) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span>Order deal (₹{Number(deal.only_order_amount).toLocaleString("en-IN")})</span>
                    </div>
                  )}
                </div>
                <p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>
                  Amount credited after order verification.
                </p>
              </div>
            )}

            {deal.instructions && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>Notes &amp; instructions</h4>
                <p className="muted" style={{ margin: 0, fontSize: 13.5, whiteSpace: "pre-wrap" }}>
                  {deal.instructions}
                </p>
              </div>
            )}

            <div className="mt" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {deal.deal_url && (
                outOfSlots ? (
                  <span
                    className="btn"
                    style={{ flex: 1, cursor: "not-allowed", opacity: 0.45, background: "var(--ink-soft)" }}
                  >
                    🚫 Deal sold out — no availability
                  </span>
                ) : (
                  <a
                    className="btn"
                    href={deal.deal_url || `/go/${deal.id}`}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    style={{ flex: 1 }}
                  >
                    Shop →
                  </a>
                )
              )}
              {deal.coupon_code && (
                <div className="btn btn-outline" style={{ cursor: "default" }}>
                  Code: {deal.coupon_code}
                </div>
              )}
            </div>

            {(deal.order_form_url || deal.refund_form_url) && (
              <div className="mt" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {deal.order_form_url && (
                  <a
                    className="btn btn-secondary"
                    href={deal.order_form_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ flex: 1 }}
                  >
                    Open submission page →
                  </a>
                )}
                {deal.refund_form_url && (
                  <a
                    className="btn btn-secondary"
                    href={deal.refund_form_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ flex: 1 }}
                  >
                    Open feedback page →
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Submit order proof */}
        <div>
          {outOfSlots ? (
            <div className="card" style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40 }} aria-hidden="true">—</div>
              <h3>Deal sold out</h3>
              <p className="muted">
                All deals have been claimed. Browse other live deals.
              </p>
              <Link href="/browse" className="btn mt">
                Browse other deals
              </Link>
            </div>
          ) : (
            <SubmitOrderProofForm initialDealId={deal.id} />
          )}
        </div>
      </div>

      {/* Ad slot */}
      <div className="mt">
        <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_DEAL} format="horizontal" />
      </div>

      {/* Reviews */}
      <section className="mt" style={{ paddingBottom: 20 }}>
        <div className="section-head">
          <h2>
            Customer feedback{avgRating > 0 && <span className="muted" style={{ fontSize: 16, marginLeft: 10 }}>{reviews.length} verified</span>}
          </h2>
        </div>
        {reviews.length === 0 ? (
          <p className="muted">Be the first to check out this deal.</p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {reviews.map((r, i) => (
              <div className="card" key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 16, color: "#b45309" }}>
                      <span style={{ letterSpacing: "-0.05em" }}>{"★".repeat(r.rating)}</span>
                      <span style={{ color: "var(--border)" }}>{"★".repeat(5 - r.rating)}</span>
                      <strong style={{ marginLeft: 8, fontSize: 14 }}>{r.user_name}</strong>
                      <span className="pill pill-delivered" style={{ marginLeft: 10, fontSize: 11 }}>Verified shopper</span>
                    </div>
                  </div>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {new Date(r.created_at + "Z").toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  </span>
                </div>
                <p style={{ margin: "10px 0 0", whiteSpace: "pre-wrap" }}>{r.text}</p>
                {r.screenshot_url && (
                  <a href={r.screenshot_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 10 }}>
                    <img src={r.screenshot_url} alt="Review proof" style={{ maxHeight: 150, borderRadius: 8, border: "1px solid var(--border)" }} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
