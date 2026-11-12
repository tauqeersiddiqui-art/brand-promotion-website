import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, bad } from "@/lib/api-helpers";
import { str, isUrl, num, int } from "@/lib/validation";
import { saveUploadedImage } from "@/lib/upload";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { sanitizeText, sanitizeHtml } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";
import { postDealToTelegram } from "@/lib/telegram";
import { writeAutoBackupSafe } from "@/lib/auto-backup";
import { resolveRefundAmount } from "@/lib/refund";

export const dynamic = "force-dynamic";

async function validateRequest(req: Request): Promise<NextResponse | null> {
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = (await getCsrfTokenFromCookies());
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  // Rate limiting
  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  return null;
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const deals = db
    .prepare(
      `SELECT d.*, COUNT(o.id) AS order_count, su.name AS submitted_by_name
       FROM deals d
       LEFT JOIN orders o ON o.deal_id = d.id
       LEFT JOIN users su ON su.id = d.submitted_by
       GROUP BY d.id ORDER BY datetime(d.created_at) DESC`
    )
    .all();

  return NextResponse.json({ deals });
}

export async function POST(req: Request) {
  const validationError = await validateRequest(req);
  if (validationError) return validationError;

  const { user, error } = await requireAdmin();
  if (error) return error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Invalid form data.");
  }

  let productCode = sanitizeText(str(form.get("product_code"), 40), 40).toUpperCase();
  const title = sanitizeText(str(form.get("title"), 140), 140);
  const description = sanitizeHtml(str(form.get("description"), 2000));
  const category = sanitizeText(str(form.get("category"), 40), 40) || "General";
  const platform = sanitizeText(str(form.get("platform"), 40), 40) || "Amazon";
  const dealType = sanitizeText(str(form.get("deal_type"), 60), 60) || "Flat Refund";
  let dealUrl = sanitizeText(str(form.get("deal_url"), 500), 500);
  if (dealUrl && !/^[a-z][a-z0-9+.-]*:\/\//i.test(dealUrl)) dealUrl = `https://${dealUrl}`;
  const targetKeyword = sanitizeText(str(form.get("target_keyword"), 255), 255);
  const instructions = sanitizeHtml(str(form.get("instructions"), 2000));
  const coupon = sanitizeText(str(form.get("coupon_code"), 40), 40);
  const priceOriginal = num(form.get("price_original"), 0, 10_000_000, 0);
  const priceSale = num(form.get("price_sale"), 0, 10_000_000, 0);
  const refundInput = num(form.get("refund_amount"), 0, 10_000_000, priceSale);
  const refundAmount = resolveRefundAmount(dealType, priceSale, refundInput);
  const reviewAmount = num(form.get("review_amount"), 0, 10_000_000, 0);
  const ratingAmount = num(form.get("rating_amount"), 0, 10_000_000, 0);
  const onlyOrderAmount = num(form.get("only_order_amount"), 0, 10_000_000, 0);
  let orderFormUrl = sanitizeText(str(form.get("order_form_url"), 500), 500);
  let refundFormUrl = sanitizeText(str(form.get("refund_form_url"), 500), 500);
  if (orderFormUrl && !/^[a-z][a-z0-9+.-]*:\/\//i.test(orderFormUrl)) orderFormUrl = `https://${orderFormUrl}`;
  if (refundFormUrl && !/^[a-z][a-z0-9+.-]*:\/\//i.test(refundFormUrl)) refundFormUrl = `https://${refundFormUrl}`;
  const totalSlots = int(form.get("total_slots"), 0, 1_000_000, 50);
  const claimedSlots = int(form.get("claimed_slots"), 0, 1_000_000, 0);
  const stock = int(form.get("stock"), 0, 1_000_000, Math.max(0, totalSlots - claimedSlots));
  const mediatorCommission = num(
    form.get("mediator_commission_amount"),
    0,
    10_000_000,
    0
  );
  const lessAmount = num(form.get("less_amount"), 0, 10_000_000, 0);
  const featured = form.get("featured") === "true" || form.get("featured") === "on";
  const active = form.get("active") !== "false";
  const sellerName = sanitizeText(str(form.get("seller_name"), 140), 140);
  const sellerContact = sanitizeText(str(form.get("seller_contact"), 200), 200);
  const sellerTelegram = sanitizeText(str(form.get("seller_telegram"), 100), 100).replace(/^@/, "");

  if (title.length < 3) return bad("Title must be at least 3 characters.");
  if (priceSale <= 0) return bad("Sale price must be greater than 0.");
  if (dealUrl && !isUrl(dealUrl)) return bad("Deal URL must start with http:// or https://");
  if (orderFormUrl && !isUrl(orderFormUrl)) return bad("Order form URL must start with http:// or https://");
  if (refundFormUrl && !isUrl(refundFormUrl)) return bad("Refund form URL must start with http:// or https://");

  let imageUrl = sanitizeText(str(form.get("image_url"), 500), 500);
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    const saved = await saveUploadedImage(file);
    if (!saved.ok) return bad(saved.error);
    imageUrl = saved.url;
  }

  const info = db
    .prepare(
      `INSERT INTO deals (
        product_code, title, description, category, platform, deal_type,
        image_url, deal_url, target_keyword, instructions, coupon_code,
        price_original, price_sale, refund_amount, review_amount, rating_amount,
        only_order_amount, order_form_url, refund_form_url, total_slots, claimed_slots,
        stock, featured, active, submitted_by, approval_status, approved_by, approved_at,
        mediator_commission_amount, less_amount, seller_name, seller_contact, seller_telegram
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      productCode,
      title,
      description,
      category,
      platform,
      dealType,
      imageUrl,
      dealUrl,
      targetKeyword,
      instructions,
      coupon,
      priceOriginal,
      priceSale,
      refundAmount,
      reviewAmount,
      ratingAmount,
      onlyOrderAmount,
      orderFormUrl,
      refundFormUrl,
      totalSlots,
      claimedSlots,
      stock,
      featured ? 1 : 0,
      active ? 1 : 0,
      user.id,
      "approved",
      user.id,
      new Date().toISOString(),
      mediatorCommission,
      lessAmount,
      sellerName,
      sellerContact,
      sellerTelegram
    );

  const newId = Number(info.lastInsertRowid);
  if (!productCode) {
    productCode = `SF-P${newId.toString().padStart(3, "0")}`;
    db.prepare("UPDATE deals SET product_code = ? WHERE id = ?").run(productCode, newId);
  }
  writeAutoBackupSafe("deal created");

  // Announce the new campaign on the Telegram channel (skipped silently when
  // no bot token is configured; failures never block deal creation).
  const telegram = await postDealToTelegram({
    id: newId,
    title,
    platform,
    deal_type: dealType,
    price_sale: priceSale,
    refund_amount: refundAmount,
    image_url: imageUrl,
    target_keyword: targetKeyword,
    total_slots: totalSlots,
  });

  return NextResponse.json({
    ok: true,
    id: newId,
    product_code: productCode,
    telegram: telegram.skipped ? "skipped" : telegram.ok ? "sent" : `failed: ${telegram.error}`,
  });
}