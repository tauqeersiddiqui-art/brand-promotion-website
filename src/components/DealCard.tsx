import Link from "next/link";

export type Deal = {
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
  product_code?: string;
  platform?: string;
  deal_type?: string;
  total_slots?: number;
  claimed_slots?: number;
  target_keyword?: string;
  cashback_amount?: number;
};

export function discountPct(d: { price_original?: number; price_sale?: number }): number {
  if (!d.price_original || !d.price_sale || d.price_original <= d.price_sale) return 0;
  return Math.round(((d.price_original - d.price_sale) / d.price_original) * 100);
}

function platformClass(platform?: string): string {
  const p = (platform || "").toLowerCase();
  if (p.includes("amazon")) return "amazon";
  if (p.includes("flipkart")) return "flipkart";
  if (p.includes("myntra")) return "myntra";
  return "brand";
}

export default function DealCard({ deal }: { deal: Deal }) {
  const disc = discountPct(deal);
  const totalSlots = deal.total_slots || 50;
  const claimedSlots = deal.claimed_slots || 0;
  const remainingSlots = Math.max(0, totalSlots - claimedSlots);
  const slotPct = Math.min(100, Math.round((claimedSlots / totalSlots) * 100));
  const is100Pct = deal.deal_type === "100% Cashback" || (deal.cashback_amount && deal.cashback_amount >= deal.price_sale);

  return (
    <article className="deal-card">
      <Link href={`/deal/${deal.id}`} className="deal-media" aria-label={deal.title}>
        {deal.image_url ? (
          <img src={deal.image_url} alt={deal.title} loading="lazy" />
        ) : (
          <div className="deal-placeholder">—</div>
        )}
        {is100Pct ? (
          <span className="deal-tag deal-tag-cashback">100% cashback</span>
        ) : disc > 0 ? (
          <span className="deal-tag deal-tag-discount">{disc}% off</span>
        ) : null}

        {deal.platform && (
          <span className={`deal-platform platform-${platformClass(deal.platform)}`}>
            {deal.platform}
          </span>
        )}

        {deal.featured === 1 && <span className="deal-tag" style={{ background: "var(--warn)", color: "#ffffff" }}>★ Hot</span>}
      </Link>

      <div className="deal-body">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="deal-cat">{deal.category}</span>
          {deal.product_code && (
            <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>
              #{deal.product_code}
            </span>
          )}
        </div>

        <h3 className="deal-title">
          <Link href={`/deal/${deal.id}`}>{deal.title}</Link>
        </h3>

        <p className="deal-desc">{deal.description}</p>

        <div style={{ margin: "4px 0 2px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: remainingSlots <= 5 ? "var(--danger)" : "var(--muted)" }}>
            <span>{remainingSlots > 0 ? `${remainingSlots} slots left` : "Slots full"}</span>
            <span>{claimedSlots} / {totalSlots} claimed</span>
          </div>
          <div className="slot-bar-wrap">
            <div className="slot-bar-fill" style={{ width: `${slotPct}%`, background: remainingSlots <= 5 ? "var(--danger)" : undefined }} />
          </div>
        </div>

        <div className="deal-prices">
          <span className="price-now">₹{deal.price_sale.toLocaleString("en-IN")}</span>
          {disc > 0 && (
            <span className="price-was">₹{deal.price_original.toLocaleString("en-IN")}</span>
          )}
          {is100Pct && (
            <span className="pill pill-delivered" style={{ marginLeft: "auto", fontSize: 11.5 }}>
              Free after review
            </span>
          )}
        </div>

        <div className="deal-actions">
          <Link href={`/deal/${deal.id}`} className="btn">
            {remainingSlots > 0 ? "View deal" : "View details"}
          </Link>
          {deal.coupon_code && (
            <span className="btn btn-outline btn-sm" style={{ cursor: "default" }}>
              🎟 {deal.coupon_code}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
