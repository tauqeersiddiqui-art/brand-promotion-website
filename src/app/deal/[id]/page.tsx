import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { discountPct } from "@/components/DealCard";
import SubmitOrderProofForm from "@/components/SubmitOrderProofForm";
import AdSlot from "@/components/AdSlot";

export const dynamic = "force-dynamic";

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
  cashback_amount?: number;
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
  const is100Pct = deal.deal_type === "100% Cashback" || (deal.cashback_amount && deal.cashback_amount >= deal.price_sale);

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/browse" className="link" style={{ fontSize: 14 }}>
          ← Back to all live campaigns
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
              {is100Pct ? (
                <span className="deal-tag deal-tag-cashback">100% cashback</span>
              ) : disc > 0 ? (
                <span className="deal-tag deal-tag-discount">{disc}% off</span>
              ) : null}

              {deal.featured === 1 && (
                <span className="deal-tag" style={{ background: "var(--warn)", color: "#ffffff" }}>★ Hot campaign</span>
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
              <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
                Campaign code: <code style={{ color: "var(--brand)" }}>{deal.product_code}</code>
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
              {is100Pct && (
                <span className="pill pill-delivered" style={{ fontSize: 12, marginLeft: "auto" }}>
                  100% reimbursement after review
                </span>
              )}
            </div>

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
                  {remainingSlots} reviewer slots left
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
                <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Payout by deal type</h4>
                <div style={{ display: "grid", gap: 8 }}>
                  {Number(deal.review_amount) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span>Review deal (5★ + written review)</span>
                      <strong>₹{Number(deal.review_amount).toLocaleString("en-IN")}</strong>
                    </div>
                  )}
                  {Number(deal.rating_amount) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span>Rating deal (5★ rating only)</span>
                      <strong>₹{Number(deal.rating_amount).toLocaleString("en-IN")}</strong>
                    </div>
                  )}
                  {Number(deal.only_order_amount) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span>Only order deal (no review)</span>
                      <strong>₹{Number(deal.only_order_amount).toLocaleString("en-IN")}</strong>
                    </div>
                  )}
                </div>
                <p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>
                  Pick one deal type when you submit your order proof. Payout is issued after the campaign checks
                  below are completed.
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
                <a
                  className="btn"
                  href={`/go/${deal.id}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  style={{ flex: 1 }}
                >
                  Open listing on {deal.platform || "store"} →
                </a>
              )}
              {deal.coupon_code && (
                <div className="btn btn-outline" style={{ cursor: "default" }}>
                  Coupon: {deal.coupon_code}
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
                    Open order form →
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
                    Open refund / claim form →
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
              <h3>Campaign slots full</h3>
              <p className="muted">
                All {totalSlots} reviewer slots for this campaign have been claimed. Browse other live campaigns.
              </p>
              <Link href="/browse" className="btn mt">
                Browse other campaigns
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
            Customer reviews{avgRating > 0 && <span className="muted" style={{ fontSize: 16, marginLeft: 10 }}>{avgRating} / 5 · {reviews.length} verified</span>}
          </h2>
        </div>
        {reviews.length === 0 ? (
          <p className="muted">No reviews yet — claim a slot and be the first to review this product.</p>
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
                      <span className="pill pill-delivered" style={{ marginLeft: 10, fontSize: 11 }}>Verified reviewer</span>
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
