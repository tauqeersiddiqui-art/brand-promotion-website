import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, bad } from "@/lib/api-helpers";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { getCsrfTokenFromCookies } from "@/lib/csrf";
import { headers } from "next/headers";
import { sanitizeText, sanitizeHtml } from "@/lib/sanitize";
import { fetchProductDetails } from "@/lib/product-fetch";
import { writeAutoBackupSafe } from "@/lib/auto-backup";

export const dynamic = "force-dynamic";

const MAX_LINKS = 20;
const FETCH_CONCURRENCY = 3;

type CreatedDeal = {
  id: number;
  product_code: string;
  title: string;
  platform: string;
  category: string;
  price_sale: number;
  partial: boolean;
};

type SkippedDeal = { url: string; reason: string };
type FailedDeal = { url: string; error: string };

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

/**
 * Import multiple Amazon/Flipkart product links as pending campaigns.
 * Details and category are auto-filled; the admin edits and approves them.
 */
export async function POST(req: Request) {
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = await getCsrfTokenFromCookies();
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const { user, error } = await requireAdmin();
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request body.");
  }

  const raw = (body as { urls?: unknown }).urls;
  const input = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\r?\n/) : [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const url = value.trim();
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
  }

  if (urls.length === 0) return bad("Paste at least one product link.");
  if (urls.length > MAX_LINKS) {
    return bad(`You can import up to ${MAX_LINKS} links at a time.`);
  }

  const findExisting = db.prepare("SELECT id, title FROM deals WHERE deal_url = ?");
  const insert = db.prepare(
    `INSERT INTO deals (
      product_code, title, description, category, platform, deal_type,
      image_url, deal_url, target_keyword, instructions, coupon_code,
      price_original, price_sale, refund_amount, review_amount, rating_amount,
      only_order_amount, order_form_url, refund_form_url, total_slots, claimed_slots,
      stock, featured, active, submitted_by, approval_status, mediator_commission_amount, less_amount,
      seller_name, seller_contact, seller_telegram
    ) VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, 0, 0, 0, '', '', 50, 0, 50, 0, 0, ?, 'pending', 0, 0,
      '', '', '')`
  );

  const created: CreatedDeal[] = [];
  const skipped: SkippedDeal[] = [];
  const failed: FailedDeal[] = [];
  const importedUrls = new Set<string>();

  const results = await mapLimit(urls, FETCH_CONCURRENCY, async (url) => {
    const existing = findExisting.get(url) as { id: number; title: string } | undefined;
    if (existing) {
      return { kind: "skipped" as const, url, reason: `Already imported: ${existing.title}` };
    }

    try {
      const result = await fetchProductDetails(url);
      if (!result.ok) {
        return { kind: "failed" as const, url, error: result.error };
      }
      return { kind: "fetched" as const, url, result };
    } catch (err) {
      return {
        kind: "failed" as const,
        url,
        error: err instanceof Error ? err.message : "Could not fetch this product.",
      };
    }
  });

  for (const item of results) {
    if (item.kind === "skipped") {
      skipped.push({ url: item.url, reason: item.reason });
      continue;
    }
    if (item.kind === "failed") {
      failed.push({ url: item.url, error: item.error });
      continue;
    }

    const product = item.result;
    const canonical = product.url.toLowerCase();
    if (importedUrls.has(canonical)) {
      skipped.push({ url: item.url, reason: "Duplicate link in this batch." });
      continue;
    }
    const existing = findExisting.get(product.url) as { id: number; title: string } | undefined;
    if (existing) {
      skipped.push({ url: item.url, reason: `Already imported: ${existing.title}` });
      continue;
    }

    const title = sanitizeText(product.title, 140);
    if (title.length < 3) {
      failed.push({ url: item.url, error: "Could not read a usable product title." });
      continue;
    }

    const priceSale = product.priceSale > 0 ? product.priceSale : 0;
    const priceOriginal = product.priceOriginal > 0 ? product.priceOriginal : priceSale;
    const description = sanitizeHtml(product.description || "").slice(0, 2000);
    const category = sanitizeText(product.category, 40) || "General";
    const platform = sanitizeText(product.platform, 40) || "Amazon";
    const imageUrl = sanitizeText(product.imageUrl || "", 500);
    const targetKeyword = sanitizeText(product.targetKeyword || "", 255);

    const info = insert.run(
      title,
      description,
      category,
      platform,
      "Flat Refund",
      imageUrl,
      product.url,
      targetKeyword,
      priceOriginal,
      priceSale,
      priceSale,
      user.id
    );

    const id = Number(info.lastInsertRowid);
    const productCode = `SF-P${id.toString().padStart(3, "0")}`;
    db.prepare("UPDATE deals SET product_code = ? WHERE id = ?").run(productCode, id);
    importedUrls.add(canonical);

    created.push({
      id,
      product_code: productCode,
      title,
      platform,
      category,
      price_sale: priceSale,
      partial: Boolean(product.partial),
    });
  }

  if (created.length > 0) writeAutoBackupSafe("bulk deals imported");

  return NextResponse.json({
    ok: true,
    created,
    skipped,
    failed,
    summary: {
      total: urls.length,
      created: created.length,
      skipped: skipped.length,
      failed: failed.length,
    },
  });
}
