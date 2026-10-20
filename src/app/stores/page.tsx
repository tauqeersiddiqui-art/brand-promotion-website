import type { Metadata } from "next";
import { db } from "@/lib/db";
import AdSlot from "@/components/AdSlot";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop on India's leading platforms",
  description:
    "Open Amazon, Flipkart, Myntra, Ajio, Meesho, Nykaa, Croma and leading brand stores from one page. Buy directly on the store's website — orders, payments, delivery and returns stay with that store.",
};

type Store = {
  name: string;
  url: string;
  search: (q: string) => string;
  category: string;
  blurb: string;
};

const MARKETPLACES: Store[] = [
  {
    name: "Amazon.in",
    url: "https://www.amazon.in",
    search: (q) => `https://www.amazon.in/s?k=${encodeURIComponent(q)}`,
    category: "Everything store",
    blurb: "Electronics, home, fashion and daily essentials with fast Prime delivery.",
  },
  {
    name: "Flipkart",
    url: "https://www.flipkart.com",
    search: (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`,
    category: "Everything store",
    blurb: "Big Billion Days pricing, electronics, mobiles and household products.",
  },
  {
    name: "Myntra",
    url: "https://www.myntra.com",
    search: (q) => `https://www.myntra.com/${encodeURIComponent(q)}?rawQuery=${encodeURIComponent(q)}`,
    category: "Fashion",
    blurb: "Clothing, footwear and accessories from top Indian and global labels.",
  },
  {
    name: "Ajio",
    url: "https://www.ajio.com",
    search: (q) => `https://www.ajio.com/search/?text=${encodeURIComponent(q)}`,
    category: "Fashion",
    blurb: "Trend-led fashion, sneakers and ethnic wear at outlet-style prices.",
  },
  {
    name: "Meesho",
    url: "https://www.meesho.com",
    search: (q) => `https://www.meesho.com/search?q=${encodeURIComponent(q)}`,
    category: "Value shopping",
    blurb: "Budget-friendly fashion, home decor and kitchen products.",
  },
  {
    name: "Snapdeal",
    url: "https://www.snapdeal.com",
    search: (q) => `https://www.snapdeal.com/search?keyword=${encodeURIComponent(q)}`,
    category: "Value shopping",
    blurb: "Affordable everyday products with frequent bank offers.",
  },
  {
    name: "Tata CLiQ",
    url: "https://www.tatacliq.com",
    search: (q) => `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(q)}`,
    category: "Premium retail",
    blurb: "Curated fashion, beauty and electronics from trusted brands.",
  },
  {
    name: "Nykaa",
    url: "https://www.nykaa.com",
    search: (q) => `https://www.nykaa.com/search/result/?q=${encodeURIComponent(q)}`,
    category: "Beauty",
    blurb: "Makeup, skincare, haircare and wellness with authentic brand stock.",
  },
  {
    name: "Croma",
    url: "https://www.croma.com",
    search: (q) => `https://www.croma.com/searchB?q=${encodeURIComponent(q)}`,
    category: "Electronics",
    blurb: "Appliances, laptops, TVs and gadgets with installation support.",
  },
  {
    name: "Reliance Digital",
    url: "https://www.reliancedigital.in",
    search: (q) => `https://www.reliancedigital.in/search?q=${encodeURIComponent(q)}`,
    category: "Electronics",
    blurb: "Consumer electronics, mobiles and large appliances.",
  },
  {
    name: "Decathlon",
    url: "https://www.decathlon.in",
    search: (q) => `https://www.decathlon.in/search?query=${encodeURIComponent(q)}`,
    category: "Sports & fitness",
    blurb: "Sportswear, gym gear, cycling and outdoor equipment.",
  },
  {
    name: "Lenskart",
    url: "https://www.lenskart.com",
    search: (q) => `https://www.lenskart.com/search?q=${encodeURIComponent(q)}`,
    category: "Eyewear",
    blurb: "Eyeglasses, sunglasses and contact lenses with home try-on.",
  },
  {
    name: "FirstCry",
    url: "https://www.firstcry.com",
    search: (q) => `https://www.firstcry.com/search?q=${encodeURIComponent(q)}`,
    category: "Baby & kids",
    blurb: "Baby care, toys, clothing and maternity products.",
  },
  {
    name: "Pepperfry",
    url: "https://www.pepperfry.com",
    search: (q) => `https://www.pepperfry.com/site_product/search?q=${encodeURIComponent(q)}`,
    category: "Home & furniture",
    blurb: "Furniture, mattresses and home decor with delivery and assembly.",
  },
  {
    name: "Shopsy",
    url: "https://www.shopsy.in",
    search: (q) => `https://www.shopsy.in/search?q=${encodeURIComponent(q)}`,
    category: "Value shopping",
    blurb: "Flipkart's budget marketplace for resellers and low-price finds.",
  },
  {
    name: "BigBasket",
    url: "https://www.bigbasket.com",
    search: (q) => `https://www.bigbasket.com/ps/?q=${encodeURIComponent(q)}`,
    category: "Groceries",
    blurb: "Groceries, fresh produce and household staples delivered.",
  },
];

const BRANDS: Store[] = [
  {
    name: "Mamaearth",
    url: "https://mamaearth.in",
    search: (q) => `https://mamaearth.in/search?q=${encodeURIComponent(q)}`,
    category: "Personal care",
    blurb: "Toxin-free skincare, haircare and baby care products.",
  },
  {
    name: "boAt",
    url: "https://www.boat-lifestyle.com",
    search: (q) => `https://www.boat-lifestyle.com/search?q=${encodeURIComponent(q)}`,
    category: "Audio & wearables",
    blurb: "Earbuds, headphones, smartwatches and speakers.",
  },
  {
    name: "Wakefit",
    url: "https://www.wakefit.co",
    search: (q) => `https://www.wakefit.co/search?q=${encodeURIComponent(q)}`,
    category: "Home",
    blurb: "Sleep-focused mattresses, pillows and furniture.",
  },
  {
    name: "Bewakoof",
    url: "https://www.bewakoof.com",
    search: (q) => `https://www.bewakoof.com/search?search_query=${encodeURIComponent(q)}`,
    category: "Fashion",
    blurb: "Graphic tees, pop-culture merch and casual wear.",
  },
  {
    name: "The Souled Store",
    url: "https://www.thesouledstore.com",
    search: (q) => `https://www.thesouledstore.com/search?q=${encodeURIComponent(q)}`,
    category: "Fashion",
    blurb: "Licensed pop-culture apparel and accessories.",
  },
  {
    name: "Noise",
    url: "https://www.gonoise.com",
    search: (q) => `https://www.gonoise.com/search?q=${encodeURIComponent(q)}`,
    category: "Audio & wearables",
    blurb: "Smartwatches, earbuds and connected lifestyle devices.",
  },
];

function liveCounts(): Record<string, number> {
  try {
    const rows = db
      .prepare("SELECT platform, COUNT(*) AS c FROM deals WHERE active = 1 AND approval_status = 'approved' GROUP BY platform")
      .all() as { platform: string; c: number }[];
    return Object.fromEntries(rows.map((r) => [r.platform.toLowerCase(), r.c]));
  } catch {
    return {};
  }
}

function countFor(counts: Record<string, number>, name: string): number {
  const key = name.toLowerCase();
  if (counts[key]) return counts[key];
  if (key.startsWith("amazon")) return counts["amazon"] || 0;
  if (key.startsWith("flipkart")) return counts["flipkart"] || 0;
  return 0;
}

function StoreCard({ store, count }: { store: Store; count: number }) {
  return (
    <article className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>{store.name}</h3>
        {count > 0 && (
          <span className="badge badge-outline" style={{ whiteSpace: "nowrap" }}>
            {count} featured deal{count === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <span className="muted" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {store.category}
      </span>
      <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
        {store.blurb}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto", paddingTop: 6 }}>
        <a
          className="btn btn-sm"
          href={store.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Visit store
        </a>
        <a
          className="btn btn-outline btn-sm"
          href={store.search("deals")}
          target="_blank"
          rel="noopener noreferrer"
        >
          Search on store
        </a>
      </div>
    </article>
  );
}

export default function StoresPage() {
  const counts = liveCounts();

  return (
    <>
      <section className="container section" style={{ paddingTop: 42 }}>
        <div className="section-head" style={{ display: "block", textAlign: "center" }}>
          <span className="badge badge-outline">Store directory</span>
          <h1 style={{ margin: "12px 0 10px" }}>Open India&apos;s leading online stores</h1>
          <p className="muted" style={{ maxWidth: 720, margin: "0 auto", fontSize: 15 }}>
            Choose a marketplace or brand below and shop on that store&apos;s own website. Your order,
            payment, delivery, return and refund are handled entirely by that store. This page is only
            a helpful directory of links — there is no order or refund form to fill here.
          </p>
        </div>

        <div className="alert alert-info" style={{ margin: "22px auto 0", maxWidth: 820, textAlign: "center" }}>
          We do not sell products, collect payments, or process orders and refunds. Please complete
          your purchase and any return or refund request on the store&apos;s website.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            margin: "26px 0 34px",
          }}
        >
          {[
            ["1", "Pick a store", "Find the marketplace or brand you want to shop from and open it with our link."],
            ["2", "Buy on the store's site", "Choose the product, pay, and track delivery directly in the store's app or website."],
            ["3", "Use the store's support", "Returns, replacements and refunds are handled by that store's own help centre."],
          ].map(([step, title, text]) => (
            <div className="card" key={step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "var(--gradient-brand)",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 700,
                  flex: "0 0 auto",
                }}
              >
                {step}
              </span>
              <div>
                <h4 style={{ margin: "0 0 4px", fontSize: 15 }}>{title}</h4>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>{text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="section-head">
          <h2>Marketplaces</h2>
          <span className="muted" style={{ fontSize: 13 }}>Opens the store&apos;s own website</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: 14,
          }}
        >
          {MARKETPLACES.map((store) => (
            <StoreCard key={store.name} store={store} count={countFor(counts, store.name)} />
          ))}
        </div>

        <div style={{ margin: "32px 0" }}>
          <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_STORES} format="horizontal" />
        </div>

        <div className="section-head">
          <h2>Brand stores</h2>
          <span className="muted" style={{ fontSize: 13 }}>Buy direct from the brand</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: 14,
          }}
        >
          {BRANDS.map((store) => (
            <StoreCard key={store.name} store={store} count={countFor(counts, store.name)} />
          ))}
        </div>

        <div className="card" style={{ marginTop: 34, background: "var(--brand-soft)", borderColor: "var(--border-hover)" }}>
          <h3 style={{ marginTop: 0, fontSize: 17 }}>Please note</h3>
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, display: "flex", flexDirection: "column", gap: 6 }}>
            <li>All purchases happen on the store&apos;s website under that store&apos;s terms and conditions.</li>
            <li>We never ask for payment, card details, OTPs or order proofs for purchases made on other stores.</li>
            <li>For order status, delivery, replacement or refund, contact the store where you bought the product.</li>
            <li>Some store links may be promotional or affiliate links; the price you pay is unchanged.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
