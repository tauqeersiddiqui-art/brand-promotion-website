import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { sanitizeText } from "@/lib/sanitize";
import { getCsrfTokenFromCookies } from "@/lib/csrf";
import { requireAdmin } from "@/lib/api-helpers";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const PAGE_HEADERS = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-IN,en;q=0.9",
};

/** Read a <meta> tag content by property/name, in either attribute order. */
function metaContent(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const first = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
    "i"
  );
  const second = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
    "i"
  );
  const m = html.match(first) || html.match(second);
  return m ? m[1] : "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Return the first number matched by any of the patterns (0 when none). */
function firstNumber(html: string, patterns: RegExp[]): number {
  for (const p of patterns) {
    const m = html.match(p);
    if (!m) continue;
    const n = parseFloat(m[1].replace(/[,\s]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/**
 * Build a readable title from the product URL slug. Flipkart/Amazon block
 * automated server requests, but the slug is always available locally:
 * /motorola-amphisoundx-vibe-120-w.../p/itmXXX -> "Motorola Amphisoundx Vibe 120 W..."
 */
function titleFromUrlSlug(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const m = u.pathname.match(/\/([a-z0-9][a-z0-9-]+)\/(?:p|dp)\//i);
    if (!m) return "";
    const SMALL = new Set(["and", "or", "with", "for", "the", "of", "in", "to", "on", "a", "an"]);
    return m[1]
      .split("-")
      .filter(Boolean)
      .map((w, i) =>
        i > 0 && SMALL.has(w.toLowerCase())
          ? w.toLowerCase()
          : w.charAt(0).toUpperCase() + w.slice(1)
      )
      .join(" ")
      .slice(0, 200);
  } catch {
    return "";
  }
}

/** Parse title/price/image out of a Flipkart product page (live or archived). */
function parseFlipkartHtml(html: string) {
  const ogTitle = decodeEntities(metaContent(html, "og:title"));
  const pageTitle = decodeEntities((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "");
  const rawTitle = (ogTitle || pageTitle).trim();

  // Bot-wall pages still return HTTP 200, but with Flipkart's generic site
  // title ("Buy Products Online at Best Price in India..."), so treat that as
  // "no data" instead of autofilling garbage.
  if (/^(Buy\s+)?Products Online at Best Price in India|^Online Shopping India|All Categories\s*\|\s*Flipkart\.com/i.test(rawTitle)) {
    return { title: "", price: 0, originalPrice: 0, image: "", description: "" };
  }

  const title = rawTitle
    .replace(/\s*[-\u2013|]\s*Price in India.*$/i, "")
    .replace(/\s*[-\u2013|]\s*Buy\s.*$/i, "")
    .replace(/^\s*Buy\s+/i, "")
    .trim();

  // Flipkart embeds pricing as JSON (escaped and unescaped variants):
  // \"ppd\":{\"fsp\":199,\"finalPrice\":199,\"mrp\":550,...}
  const price = firstNumber(html, [
    /\\?"finalPrice\\?":\s*(\d+(?:\.\d+)?)/,
    /\\?"fsp\\?":\s*(\d+(?:\.\d+)?)/,
    /Nx9bqj[^>]*>\u20B9([\d,]+)/,
    /VU-ZEz[^>]*>\u20B9([\d,]+)/,
  ]);
  const mrp = firstNumber(html, [/\\?"mrp\\?":\s*(\d+(?:\.\d+)?)/]);

  let image = metaContent(html, "og:image");
  // Bump Flipkart CDN thumbnails to a sharper standard size.
  if (image) image = image.replace(/\/image\/\d+\/\d+\//, "/image/832/832/");

  const description = decodeEntities(metaContent(html, "description")).slice(0, 500);

  return { title, price, originalPrice: mrp || price, image, description };
}

/** Pull 5 useful SEO keywords out of a product title. */
function keywordFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .join(" ");
}

/** True for error/captcha pages that must not be autofilled as a title. */
function isUnusableTitle(title: string): boolean {
  return /^(page not found|sorry!?\s+something went wrong|robot check|enter the characters you see below|amazon\.[a-z.]+)$/i.test(
    title.trim()
  );
}

/** Fetch product details from Amazon/Flipkart product URL. */
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  // CSRF protection
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = await getCsrfTokenFromCookies();
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh and try again." },
      { status: 403 }
    );
  }

  // Rate limiting
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = await applyRateLimit("apiGeneral", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { url } = body as { url?: string };
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Product URL is required." }, { status: 400 });
  }

  const cleanUrl = sanitizeText(url.trim(), 800);

  // Detect the platform from the parsed hostname, not from substring matches:
  // `http://internal/flipkart` would otherwise pass the check and make the
  // server fetch an arbitrary internal URL (SSRF).
  let host = "";
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanUrl);
    host = parsedUrl.hostname.toLowerCase();
  } catch {
    return NextResponse.json({ error: "Product URL is not valid." }, { status: 400 });
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return NextResponse.json({ error: "Product URL must use http(s)." }, { status: 400 });
  }

  const isAmazonHost = /(^|\.)amazon\.(?:in|com|co\.uk|de|fr|ca|es|it|co\.jp|com\.au|ae|sa|sg|nl|se|pl)$/.test(host);
  const isFlipkartHost = /(^|\.)flipkart\.com$/.test(host);

  // Detect platform and extract product ID
  let platform = "Amazon";
  let productId = "";

  const amazonPatterns = [
    /amazon\.(?:in|com|co\.uk|de|fr|ca|es|it|co\.jp|com\.au|ae|sa|sg|nl|se|pl)\/.*(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/i,
    /amazon\.(?:in|com|co\.uk|de|fr|ca|es|it|co\.jp|com\.au|ae|sa|sg|nl|se|pl)\/.*\/([A-Z0-9]{10})(?:\/|\?|$)/i,
  ];

  const flipkartPatterns = [
    /flipkart\.com\/.*\/p\/(itm[A-Z0-9]+)/i,
    /flipkart\.com\/.*[?&]pid=([A-Z0-9]+)/i,
    /flipkart\.com\/.*\/p\/([A-Z0-9]+)/i,
  ];

  if (isAmazonHost) {
    if (/\/deals|\/gp\/best-sellers|\/gp\/most-wished-for|\/gp\/new-releases|\/s\?/i.test(cleanUrl)) {
      return NextResponse.json(
        {
          error: "This is a category/deals listing page, not a product page.",
          hint: "Use a product detail URL like: https://www.amazon.in/dp/B0XXXXXXXX",
        },
        { status: 400 }
      );
    }
    platform = "Amazon";
    for (const pattern of amazonPatterns) {
      const match = cleanUrl.match(pattern);
      if (match) {
        productId = match[1];
        break;
      }
    }
  } else if (isFlipkartHost) {
    if (/\/search|\/category|\/brand|\/offers/i.test(cleanUrl)) {
      return NextResponse.json(
        {
          error: "This is a category/search page, not a product page.",
          hint: "Use a product detail URL like: https://www.flipkart.com/product-name/p/ITMXXXXXXXX",
        },
        { status: 400 }
      );
    }
    platform = "Flipkart";
    for (const pattern of flipkartPatterns) {
      const match = cleanUrl.match(pattern);
      if (match) {
        productId = match[1];
        break;
      }
    }
  }

  if (!productId) {
    return NextResponse.json(
      {
        error: "Invalid product URL. Please use a product detail page URL, not a category/deals listing page.",
        hint: "Use format: https://www.amazon.in/dp/B0XXXXXXXX or https://www.flipkart.com/product-name/p/ITMXXXXXXXX",
      },
      { status: 400 }
    );
  }

  let productData: {
    title: string;
    price: number;
    originalPrice: number;
    image: string;
    description: string;
  } | null = null;

  try {
    if (platform === "Amazon") {
      const response = await fetch(`https://www.amazon.in/dp/${productId}`, {
        headers: PAGE_HEADERS,
        signal: AbortSignal.timeout(12000),
      });
      const html = await response.text();

      const titleMatch = html.match(/<span id="productTitle"[^>]*>\s*([^<]+?)\s*<\/span>/);
      let title = titleMatch ? decodeEntities(titleMatch[1].trim()) : "";
      if (!title) {
        // Fallback: <title> tag, stripped of the " : Amazon.in: ..." suffix.
        const t = decodeEntities((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "");
        title = t.split(/\s*[:\|\-]\s*Amazon\./i)[0].trim();
      }

      const price = firstNumber(html, [
        /<span class="a-price-whole">([\d,]+)/,
        /"priceAmount":\s*([\d.]+)/,
        /<span class="a-offscreen">\u20B9([\d,]+)/,
      ]);
      const mrp =
        firstNumber(html, [/<span class="a-text-price"[^>]*>\s*<span class="a-offscreen">\u20B9([\d,]+)/]) ||
        price;

      let image =
        (html.match(/id="landingImage"[^>]*src="([^"]+)"/) ||
          html.match(/data-old-hires="([^"]+)"/) ||
          html.match(/"hiRes":"([^"]+)"/) ||
          [])[1] || "";
      if (!image) image = metaContent(html, "og:image");

      const descMatch = html.match(/<div id="feature-bullets"[^>]*>([\s\S]*?)<\/div>/);
      let description = "";
      if (descMatch) {
        description = descMatch[1]
          .replace(/<[^>]+>/g, "\n")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500);
      }
      if (!description) description = decodeEntities(metaContent(html, "description")).slice(0, 500);

      productData = isUnusableTitle(title)
        ? { title: "", price: 0, originalPrice: 0, image: "", description: "" }
        : { title, price, originalPrice: mrp || price, image, description };
    } else if (platform === "Flipkart") {
      // Flipkart now aggressively blocks server-side requests (PerimeterX
      // bot-wall + 429s) from both residential and datacenter IPs, so the page
      // may come back as a generic shell. Try the live page, then fall back to
      // the title encoded in the URL slug. Never throws - a partial autofill
      // is still useful.
      let parsed = { title: "", price: 0, originalPrice: 0, image: "", description: "" };
      try {
        const response = await fetch(parsedUrl.toString(), {
          headers: PAGE_HEADERS,
          signal: AbortSignal.timeout(10000),
        });
        parsed = parseFlipkartHtml(await response.text());
      } catch (err) {
        console.warn("[ProductFetch] Flipkart direct fetch failed:", err);
      }

      if (!parsed.title) parsed.title = titleFromUrlSlug(cleanUrl);
      productData = parsed;
    }
  } catch (err) {
    console.warn("[ProductFetch] Error fetching product:", err);
    return NextResponse.json(
      {
        error: "Could not reach the product page. Please check the URL and enter details manually if it persists.",
      },
      { status: 502 }
    );
  }

  const derivedTitle = productData?.title || titleFromUrlSlug(cleanUrl);

  if (!derivedTitle) {
    return NextResponse.json(
      {
        error:
          "Could not read product details from that page (the marketplace may be blocking automated access right now). Please fill the fields manually.",
      },
      { status: 400 }
    );
  }

  const keywords = keywordFromTitle(derivedTitle);

  if (!productData || productData.price <= 0) {
    // The marketplace blocked the page, but we could still recover the title
    // (from the slug or an archived copy) - return it as a partial autofill so
    // the admin only has to type the price.
    return NextResponse.json({
      ok: true,
      partial: true,
      platform,
      productId,
      title: derivedTitle,
      priceSale: 0,
      priceOriginal: 0,
      imageUrl: productData?.image || "",
      targetKeyword: keywords,
      description: productData?.description || "",
      note: `We filled in the ${productData?.image ? "title and image" : "title"} from the product link, but the price could not be read automatically (${platform} may be blocking automated access, or the listing may be unavailable). Please enter the sale price and MRP manually${productData?.image ? "" : ", then add a product image (upload a screenshot or paste an image URL)"}.`,
    });
  }

  return NextResponse.json({
    ok: true,
    platform,
    productId,
    title: derivedTitle,
    priceSale: productData.price,
    priceOriginal: productData.originalPrice || productData.price,
    imageUrl: productData.image,
    targetKeyword: keywords,
    description: productData.description || "",
  });
}
