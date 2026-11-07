import { sanitizeText } from "./sanitize";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const PAGE_HEADERS = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-IN,en;q=0.9",
};

/**
 * Share-sheet shorteners used by Amazon and Flipkart (e.g. link.amazon/XXXX,
 * amzn.to/XXXX, fkrt.it/XXXX). These redirect to the real product page, so we
 * expand them before detecting the platform/product ID.
 */
const SHORT_LINK_HOST = /^(?:link\.amazon|amzn\.to|amzn\.in|a\.co|dl\.flipkart\.com|fkrt\.it)$/i;

const AMAZON_HOST = /(^|\.)amazon\.(?:in|com|co\.uk|de|fr|ca|es|it|co\.jp|com\.au|ae|sa|sg|nl|se|pl)$/;
const FLIPKART_HOST = /(^|\.)flipkart\.com$/;

export type ProductFetchResult =
  | {
      ok: true;
      partial?: boolean;
      platform: string;
      productId: string;
      url: string;
      title: string;
      priceSale: number;
      priceOriginal: number;
      imageUrl: string;
      targetKeyword: string;
      description: string;
      category: string;
      note?: string;
    }
  | { ok: false; status: number; error: string; hint?: string };

const CATEGORY_RULES: Array<[string, RegExp]> = [
  [
    "Footwear",
    /\b(?:shoes?|sneakers?|sandals?|flip[\s-]?flops?|slippers?|loafers?|heels?|boots?|footwear|crocs|chappals?|jutti|mojari|cleats?)\b/i,
  ],
  [
    "Beauty & Care",
    /\b(?:serum|creams?|moisturi[sz]ers?|shampoo|conditioners?|face\s?wash|cleanser|sunscreen|lipsticks?|lip\s?balm|makeup|foundation|kajal|eyeliner|perfume|deodorant|body\s?lotion|body\s?wash|hair\s?oil|hair\s?mask|beard\s?oil|trimmers?|shavers?|razors?|soaps?|face\s?mask|sheet\s?mask|nail\s?polish)\b/i,
  ],
  [
    "Health & Wellness",
    /\b(?:proteins?|supplements?|vitamins?|multivitamins?|omega|collagen|ayurvedic|thermometers?|bp\s?monitor|blood\s?pressure|glucose|oximeters?|massagers?|massage\s?gun|heating\s?pad|sanitizers?|hand\s?wash|medicines?|tablets?|capsules?)\b/i,
  ],
  [
    "Home & Kitchen",
    /\b(?:kitchen|cookware|pressure\s?cooker|frying\s?pan|kadai|tawa|mixers?|grinders?|blenders?|air\s?fryer|microwave|oven|refrigerators?|fridge|washing\s?machine|vacuum|cleaners?|mops?|dusters?|bedsheets?|pillows?|mattress|curtains?|sofa|chairs?|tables?|furniture|storage|organizers?|bottles?|flask|utensils?|plates?|cups?|mugs?)\b/i,
  ],
  [
    "Electronics",
    /\b(?:earbuds?|headphones?|earphones?|speakers?|soundbars?|smart\s?watch|smartphone|mobile|phones?|laptops?|tablets?|televisions?|tv|monitors?|projectors?|chargers?|power\s?bank|cables?|keyboards?|mouse|routers?|printers?|cameras?|drones?|hard\s?disk|ssd|pen\s?drive|memory\s?card|bluetooth|led|bulbs?|fans?)\b/i,
  ],
  [
    "Fitness & Sports",
    /\b(?:gym|dumbbells?|barbells?|yoga|resistance\s?bands?|treadmills?|cycles?|bicycles?|cricket|footballs?|badminton|tennis|basketballs?|sports?|fitness|exercise|push\s?up|pull\s?up|skipping\s?rope)\b/i,
  ],
  [
    "Fashion",
    /\b(?:shirts?|t[\s-]?shirts?|jeans?|trousers?|pants?|kurtas?|sarees?|dress(?:es)?|tops?|jackets?|hoodies?|sweaters?|shorts?|track\s?pants?|leggings?|wallets?|handbags?|backpacks?|bags?|belts?|watches?|sunglasses?|socks?|caps?|hats?)\b/i,
  ],
];

/** Pick the campaign category from the product title/description. */
export function inferCategory(input: string): string {
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(input)) return category;
  }
  return "General";
}

function withScheme(raw: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/** Follow short-link redirects and return the final product URL. */
async function expandShortLink(url: string, timeout = 10000): Promise<string> {
  const res = await fetch(url, {
    headers: PAGE_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  });
  const finalUrl = res.url;
  let host = "";
  try {
    host = new URL(finalUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
  if (!SHORT_LINK_HOST.test(host)) return finalUrl;

  // Some shorteners answer with a meta-refresh/JS redirect page instead of a
  // 3xx. Pull the first Amazon/Flipkart URL out of the HTML as a fallback.
  const html = await res.text();
  const match = html.match(
    /https?:\/\/(?:www\.)?(?:amazon\.[a-z.]{2,}|flipkart\.com)\/[^\s"'<>\\]+/i
  );
  return match ? match[0] : finalUrl;
}

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
      if (image.startsWith("//")) image = `https:${image}`;
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
  return /^(page not found|sorry!?\s+something went wrong|robot check|enter the characters you see below|amazon\.[a-z.]+|flipkart\.[a-z.]+|all categories\s*\|\s*flipkart|buy\s+products\s+online|online shopping\s+india)$/i.test(
    title.trim()
  );
}

/** Fetch product details from an Amazon/Flipkart product URL. */
export async function fetchProductDetails(rawUrl: string): Promise<ProductFetchResult> {
  let cleanUrl = withScheme(sanitizeText(rawUrl.trim(), 800));

  // Detect the platform from the parsed hostname, not from substring matches:
  // `http://internal/flipkart` would otherwise pass the check and make the
  // server fetch an arbitrary internal URL (SSRF).
  let host = "";
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cleanUrl);
    host = parsedUrl.hostname.toLowerCase();
  } catch {
    return { ok: false, status: 400, error: "Product URL is not valid." };
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return { ok: false, status: 400, error: "Product URL must use http(s)." };
  }

  if (SHORT_LINK_HOST.test(host)) {
    try {
      const expanded = await expandShortLink(parsedUrl.toString());
      parsedUrl = new URL(expanded);
      host = parsedUrl.hostname.toLowerCase();
      cleanUrl = parsedUrl.toString();
    } catch {
      return {
        ok: false,
        status: 400,
        error:
          "Could not open the short product link. Please paste the full Amazon/Flipkart product URL instead.",
      };
    }

    if (SHORT_LINK_HOST.test(host)) {
      return {
        ok: false,
        status: 400,
        error: "The short link did not resolve to a product page.",
        hint: "Open the link in a browser and paste the full product URL (it should contain /dp/ASIN or /p/ITM...).",
      };
    }
  }

  const isAmazonHost = AMAZON_HOST.test(host);
  const isFlipkartHost = FLIPKART_HOST.test(host);

  if (!isAmazonHost && !isFlipkartHost) {
    return {
      ok: false,
      status: 400,
      error: "Only Amazon and Flipkart product links are supported.",
      hint: "Paste a product page URL from amazon.in or flipkart.com (short share links are supported).",
    };
  }

  let searchableUrl = cleanUrl;
  try {
    searchableUrl = decodeURIComponent(cleanUrl);
  } catch {
    /* keep the original when the URL contains malformed escapes */
  }

  // Detect platform and extract product ID
  let platform = "Amazon";
  let productId = "";
  let amazonTld = "in"; // Default to amazon.in for Indian region

  const amazonPatterns = [
    /amazon\.(?:in|com|co\.uk|de|fr|ca|es|it|co\.jp|com\.au|ae|sa|sg|nl|se|pl)\/.*(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/i,
    /amazon\.(?:in|com|co\.uk|de|fr|ca|es|it|co\.jp|com\.au|ae|sa|sg|nl|se|pl)\/.*\/([A-Z0-9]{10})(?:\/|\?|$)/i,
  ];

  const flipkartPatterns = [
    /flipkart\.com\/.*\/p\/(itm[A-Z0-9]+)/i,
    /flipkart\.com\/.*[?&]pid=([A-Z0-9]+)/i,
    /flipkart\.com\/.*\/p\/([A-Z0-9]+)/i,
  ];

  // Extract Amazon TLD from the original URL before fetching
  const amazonTldMatch = host.match(/amazon\.(?:in|com|co\.uk|de|fr|ca|es|it|co\.jp|com\.au|ae|sa|sg|nl|se|pl)/i);
  if (amazonTldMatch) {
    amazonTld = amazonTldMatch[0].replace("amazon.", "");
  }

  if (isAmazonHost) {
    if (/\/deals|\/gp\/best-sellers|\/gp\/most-wished-for|\/gp\/new-releases|\/s\?/i.test(searchableUrl)) {
      return {
        ok: false,
        status: 400,
        error: "This is a category/deals listing page, not a product page.",
        hint: "Use a product detail URL like: https://www.amazon.in/dp/B0XXXXXXXX",
      };
    }
    platform = "Amazon";
    for (const pattern of amazonPatterns) {
      const match = searchableUrl.match(pattern);
      if (match) {
        productId = match[1];
        break;
      }
    }
  } else if (isFlipkartHost) {
    if (/\/search|\/category|\/brand|\/offers/i.test(searchableUrl)) {
      return {
        ok: false,
        status: 400,
        error: "This is a category/search page, not a product page.",
        hint: "Use a product detail URL like: https://www.flipkart.com/product-name/p/ITMXXXXXXXX",
      };
    }
    platform = "Flipkart";
    for (const pattern of flipkartPatterns) {
      const match = searchableUrl.match(pattern);
      if (match) {
        productId = match[1];
        break;
      }
    }
  }

  if (!productId) {
    return {
      ok: false,
      status: 400,
      error: "Invalid product URL. Please use a product detail page URL, not a category/deals listing page.",
      hint: "Use format: https://www.amazon.in/dp/B0XXXXXXXX or https://www.flipkart.com/product-name/p/ITMXXXXXXXX",
    };
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
      // Validate the Amazon region is supported
      if (!/^amazon\.(?:in|com|co\.uk|de|fr|ca|es|it|co\.jp|com\.au|ae|sa|sg|nl|se|pl)$/i.test(host)) {
        return { ok: false, status: 400, error: "Amazon region not supported." };
      }

      // Build the fetch URL using the extracted region from the original URL
      const fetchUrl = `https://www.amazon.${amazonTld}/dp/${productId}`;
      const response = await fetch(fetchUrl, {
        headers: PAGE_HEADERS,
        signal: AbortSignal.timeout(12000),
      });

      // Check for bot/blocked responses
      if (response.status === 429) {
        return {
          ok: false,
          status: 429,
          error: "Amazon is blocking automated requests (rate limit). Please try again later or enter details manually.",
          hint: "Amazon/Flipkart may be temporarily blocking server-side requests. You can fill the product details manually.",
        };
      }

      if (response.status === 403) {
        return {
          ok: false,
          status: 403,
          error: "Access forbidden by Amazon. The product page may require a browser.",
          hint: "Open the link in a browser to verify it's accessible, then try again or fill details manually.",
        };
      }

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
      if (image.startsWith("//")) image = `https:${image}`;

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
        : { title, price: mrp || price, originalPrice: mrp || price, image, description };
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

        // Check if Flipkart is blocking the request
        if (response.status === 429) {
          console.warn("[ProductFetch] Flipkart blocked the request with status 429");
        } else if (response.status === 403) {
          console.warn("[ProductFetch] Flipkart returned 403 Forbidden");
        }

        const html = await response.text();
        parsed = parseFlipkartHtml(html);
      } catch (err) {
        console.warn("[ProductFetch] Flipkart direct fetch failed:", err);
      }

      if (!parsed.title) parsed.title = titleFromUrlSlug(cleanUrl);
      productData = parsed;
    }
  } catch (err) {
    console.warn("[ProductFetch] Error fetching product:", err);
    return {
      ok: false,
      status: 502,
      error: "Could not reach the product page. Please check the URL and enter details manually if it persists.",
    };
  }

  const derivedTitle = productData?.title || titleFromUrlSlug(cleanUrl);

  if (!derivedTitle) {
    return {
      ok: false,
      status: 400,
      error:
        "Could not read product details from that page (the marketplace may be blocking automated access right now). Please fill the fields manually.",
    };
  }

  const keywords = keywordFromTitle(derivedTitle);
  const titleCategory = inferCategory(derivedTitle);
  const category =
    titleCategory !== "General"
      ? titleCategory
      : inferCategory(productData?.description || "");

  if (!productData || productData.price <= 0) {
    // The marketplace blocked the page, but we could still recover the title
    // (from the slug or an archived copy) - return it as a partial autofill so
    // the admin only has to type the price.
    return {
      ok: true,
      partial: true,
      platform,
      productId,
      url: cleanUrl,
      title: derivedTitle,
      priceSale: 0,
      priceOriginal: 0,
      imageUrl: productData?.image || "",
      targetKeyword: keywords,
      description: productData?.description || "",
      category,
      note: `We filled in the ${productData?.image ? "title and image" : "title"} from the product link, but the price could not be read automatically (${platform} may be blocking automated access, or the listing may be unavailable). Please enter the sale price and MRP manually${productData?.image ? "" : ", then add a product image (upload a screenshot or paste an image URL)"}.`,
    };
  }

  return {
    ok: true,
    platform,
    productId,
    url: cleanUrl,
    title: derivedTitle,
    priceSale: productData.price,
    priceOriginal: productData.originalPrice || productData.price,
    imageUrl: productData.image,
    targetKeyword: keywords,
    description: productData.description || "",
    category,
  };
}
