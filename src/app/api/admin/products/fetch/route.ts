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

  if (cleanUrl.includes("amazon")) {
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
  } else if (cleanUrl.includes("flipkart")) {
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

      productData = { title, price, originalPrice: mrp || price, image, description };
    } else if (platform === "Flipkart") {
      // Fetch the exact product URL the admin pasted (keeps the pid param),
      // because /p/<id> alone is not a valid Flipkart product route.
      const response = await fetch(cleanUrl, {
        headers: PAGE_HEADERS,
        signal: AbortSignal.timeout(12000),
      });
      const html = await response.text();

      const ogTitle = decodeEntities(metaContent(html, "og:title"));
      const pageTitle = decodeEntities((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "");
      const title = (ogTitle || pageTitle)
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

      productData = { title, price, originalPrice: mrp || price, image, description };
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

  if (!productData || !productData.title || productData.price <= 0) {
    return NextResponse.json(
      {
        error:
          "Could not read product details from that page (the marketplace may be blocking automated access right now). Please fill the fields manually.",
      },
      { status: 400 }
    );
  }

  // Generate suggested keyword from title
  const keywords = productData.title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5)
    .join(" ");

  return NextResponse.json({
    ok: true,
    platform,
    productId,
    title: productData.title,
    priceSale: productData.price,
    priceOriginal: productData.originalPrice || productData.price,
    imageUrl: productData.image,
    targetKeyword: keywords,
    description: productData.description || "",
  });
}
