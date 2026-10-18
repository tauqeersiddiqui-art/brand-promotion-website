import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { sanitizeText } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { requireAdmin } from "@/lib/api-helpers";

/** Fetch product details from Amazon/Flipkart product URL. */
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  // CSRF protection
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = (await getCsrfTokenFromCookies());
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

  const cleanUrl = sanitizeText(url.trim(), 500);

  // Detect platform and extract product ID
  let platform = "Amazon";
  let productId = "";
  let fetchUrl = "";

  // Amazon URL patterns - fixed regex (was using character class instead of group)
  const amazonPatterns = [
    /amazon\.(?:in|com|co\.uk|de|fr|ca|es|it|co\.jp|com\.au|ae|sa|sg|nl|se|pl)\/.*(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/i,
    /amazon\.(?:in|com|co\.uk|de|fr|ca|es|it|co\.jp|com\.au|ae|sa|sg|nl|se|pl)\/.*\/([A-Z0-9]{10})(?:\/|\?|$)/i,
  ];

  // Flipkart URL patterns
  const flipkartPatterns = [
    /flipkart\.com\/.*\/p\/([A-Z0-9]+)/i,
    /flipkart\.com\/.*pid=([A-Z0-9]+)/i,
  ];

  if (cleanUrl.includes("amazon")) {
    // Reject category/deals/search pages early
    if (/\/deals|\/gp\/best-sellers|\/gp\/most-wished-for|\/gp\/new-releases|\/s\?/i.test(cleanUrl)) {
      return NextResponse.json(
        {
          error: "This is a category/deals listing page, not a product page.",
          hint: "Use a product detail URL like: https://www.amazon.in/dp/B0XXXXXXXX"
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
    // Reject category pages
    if (/\/search|\/category|\/brand|\/offers/i.test(cleanUrl)) {
      return NextResponse.json(
        {
          error: "This is a category/search page, not a product page.",
          hint: "Use a product detail URL like: https://www.flipkart.com/product-name/p/ITMXXXXXXXX"
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
        hint: "Use format: https://www.amazon.in/dp/B0XXXXXXXX or https://www.flipkart.com/product-name/p/ITMXXXXXXXX"
      },
      { status: 400 }
    );
  }

  // Fetch product details from platform
  let productData: { title: string; price: number; originalPrice?: number; image?: string; description?: string } | null = null;

  try {
    if (platform === "Amazon") {
      // Use a simple fetch to get basic info (no API key needed for basic scraping)
      // In production, use Amazon PA-API or Rainforest API
      const response = await fetch(`https://www.amazon.in/dp/${productId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        signal: AbortSignal.timeout(10000),
      });

      const html = await response.text();

      // Extract title
      const titleMatch = html.match(/<span id="productTitle"[^>]*>([^<]+)<\/span>/);
      const title = titleMatch ? titleMatch[1].trim() : "";

      // Extract price
      const priceMatch = html.match(/<span class="a-price-whole"[^>]*>([^<]+)<\/span>/);
      const price = priceMatch ? parseFloat(priceMatch[1].replace(/[,\s]/g, "")) : 0;

      // Extract original price (MRP)
      const mrpMatch = html.match(/<span class="a-text-price"[^>]*><span class="a-offscreen">₹([^<]+)<\/span><\/span>/);
      const originalPrice = mrpMatch ? parseFloat(mrpMatch[1].replace(/[,\s]/g, "")) : price;

      // Extract image
      const imageMatch = html.match(/id="landingImage"[^>]*src="([^"]+)"/) ||
                         html.match(/data-old-hires="([^"]+)"/) ||
                         html.match(/"hiRes":"([^"]+)"/);
      const image = imageMatch ? imageMatch[1] : "";

      // Extract description
      const descMatch = html.match(/<div id="feature-bullets"[^>]*>([\s\S]*?)<\/div>/);
      let description = "";
      if (descMatch) {
        description = descMatch[1]
          .replace(/<[^>]+>/g, "\n")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500);
      }

      productData = { title, price, originalPrice, image, description };
    } else if (platform === "Flipkart") {
      // Flipkart scraping (limited without API)
      const response = await fetch(`https://www.flipkart.com/p/${productId}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(10000),
      });

      const html = await response.text();

      // Extract title
      const titleMatch = html.match(/<span class="VU-ZEz"[^>]*>([^<]+)<\/span>/) ||
                         html.match(/<h1 class="[^"]*">([^<]+)<\/h1>/);
      const title = titleMatch ? titleMatch[1].trim() : "";

      // Extract price
      const priceMatch = html.match(/<div class="Nx9bqj[^"]*"[^>]*>₹([^<]+)<\/div>/) ||
                         html.match(/₹([\d,]+)/);
      const price = priceMatch ? parseFloat(priceMatch[1].replace(/[,\s]/g, "")) : 0;

      // Extract image
      const imageMatch = html.match(/<img class="[^"]*DByuf4[^"]*"[^>]*src="([^"]+)"/) ||
                         html.match(/"image":"([^"]+)"/);
      const image = imageMatch ? imageMatch[1] : "";

      productData = { title, price, originalPrice: price, image, description: "" };
    }
  } catch (err) {
    console.warn("[ProductFetch] Error fetching product:", err);
    return NextResponse.json(
      { error: "Failed to fetch product details. Please enter manually." },
      { status: 500 }
    );
  }

  if (!productData || !productData.title) {
    return NextResponse.json(
      { error: "Could not fetch product details. Please enter manually." },
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