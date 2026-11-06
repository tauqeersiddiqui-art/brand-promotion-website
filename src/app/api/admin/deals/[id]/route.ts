import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, bad } from "@/lib/api-helpers";
import { str, isUrl, num, int, parseId } from "@/lib/validation";
import { saveUploadedImage } from "@/lib/upload";
import { applyRateLimit } from "@/lib/rate-limit";
import { sanitizeText, sanitizeHtml } from "@/lib/sanitize";
import { getCsrfTokenFromCookies, validateCsrfToken } from "@/lib/csrf";
import { headers } from "next/headers";
import { writeAutoBackupSafe } from "@/lib/auto-backup";
import { resolveCashbackAmount } from "@/lib/cashback";

export const dynamic = "force-dynamic";

type Deal = {
  id: number;
  product_code: string;
  title: string;
  description: string;
  category: string;
  platform: string;
  deal_type: string;
  image_url: string;
  deal_url: string;
  target_keyword: string;
  instructions: string;
  coupon_code: string;
  price_original: number;
  price_sale: number;
  cashback_amount: number;
  review_amount: number;
  rating_amount: number;
  only_order_amount: number;
  order_form_url: string;
  refund_form_url: string;
  total_slots: number;
  claimed_slots: number;
  stock: number;
  featured: number;
  active: number;
  submitted_by: number | null;
  approval_status: string;
  rejection_reason: string;
  approved_by: number | null;
  approved_at: string;
  mediator_commission_amount: number;
};

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
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  return null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validationError = await validateRequest(req);
  if (validationError) return validationError;

  const { error } = await requireAdmin();
  if (error) return error;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return bad("Invalid deal id.");

  const existing = db.prepare("SELECT * FROM deals WHERE id = ?").get(id) as Deal | undefined;
  if (!existing) return bad("Deal not found.", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Invalid form data.");
  }

  const has = (k: string) => form.has(k);
  const asStr = (k: string) => str(form.get(k), 1000);

  const productCode = has("product_code") ? sanitizeText(str(form.get("product_code"), 40), 40).toUpperCase() : existing.product_code;
  const title = has("title") ? sanitizeText(str(form.get("title"), 140), 140) : existing.title;
  const description = has("description") ? sanitizeHtml(str(form.get("description"), 2000)) : existing.description;
  const category = has("category") ? sanitizeText(asStr("category") || "General", 40) : existing.category;
  const platform = has("platform") ? sanitizeText(asStr("platform") || "Amazon", 40) : existing.platform;
  const dealType = has("deal_type") ? sanitizeText(asStr("deal_type") || "100% Cashback", 60) : existing.deal_type;
  let dealUrl = has("deal_url") ? sanitizeText(asStr("deal_url"), 500) : existing.deal_url;
  if (dealUrl && !/^[a-z][a-z0-9+.-]*:\/\//i.test(dealUrl)) dealUrl = `https://${dealUrl}`;
  const targetKeyword = has("target_keyword") ? sanitizeText(asStr("target_keyword"), 255) : existing.target_keyword;
  const instructions = has("instructions") ? sanitizeHtml(asStr("instructions")) : existing.instructions;
  const coupon = has("coupon_code") ? sanitizeText(asStr("coupon_code"), 40) : existing.coupon_code;
  const priceOriginal = has("price_original")
    ? num(form.get("price_original"), 0, 10_000_000, existing.price_original)
    : existing.price_original;
  const priceSale = has("price_sale")
    ? num(form.get("price_sale"), 0, 10_000_000, existing.price_sale)
    : existing.price_sale;
  const cashbackInput = has("cashback_amount")
    ? num(form.get("cashback_amount"), 0, 10_000_000, existing.cashback_amount)
    : existing.cashback_amount;
  const cashbackAmount =
    has("deal_type") || has("price_sale")
      ? resolveCashbackAmount(dealType, priceSale, cashbackInput)
      : cashbackInput;
  const reviewAmount = has("review_amount")
    ? num(form.get("review_amount"), 0, 10_000_000, existing.review_amount)
    : existing.review_amount;
  const ratingAmount = has("rating_amount")
    ? num(form.get("rating_amount"), 0, 10_000_000, existing.rating_amount)
    : existing.rating_amount;
  const onlyOrderAmount = has("only_order_amount")
    ? num(form.get("only_order_amount"), 0, 10_000_000, existing.only_order_amount)
    : existing.only_order_amount;
  let orderFormUrl = has("order_form_url")
    ? sanitizeText(asStr("order_form_url"), 500)
    : existing.order_form_url;
  let refundFormUrl = has("refund_form_url")
    ? sanitizeText(asStr("refund_form_url"), 500)
    : existing.refund_form_url;
  if (orderFormUrl && !/^[a-z][a-z0-9+.-]*:\/\//i.test(orderFormUrl)) orderFormUrl = `https://${orderFormUrl}`;
  if (refundFormUrl && !/^[a-z][a-z0-9+.-]*:\/\//i.test(refundFormUrl)) refundFormUrl = `https://${refundFormUrl}`;
  const totalSlots = has("total_slots")
    ? int(form.get("total_slots"), 0, 1_000_000, existing.total_slots)
    : existing.total_slots;
  const claimedSlots = has("claimed_slots")
    ? int(form.get("claimed_slots"), 0, 1_000_000, existing.claimed_slots)
    : existing.claimed_slots;
  const stock = has("stock")
    ? int(form.get("stock"), 0, 1_000_000, existing.stock)
    : existing.stock;
  const mediatorCommission = has("mediator_commission_amount")
    ? num(form.get("mediator_commission_amount"), 0, 10_000_000, existing.mediator_commission_amount)
    : existing.mediator_commission_amount;
  const featured = has("featured")
    ? form.get("featured") === "true" || form.get("featured") === "on"
    : existing.featured === 1;
  const active = has("active")
    ? form.get("active") !== "false"
    : existing.active === 1;

  if (title.length < 3) return bad("Title must be at least 3 characters.");
  if (priceSale <= 0) return bad("Sale price must be greater than 0.");
  if (dealUrl && !isUrl(dealUrl)) return bad("Deal URL must start with http:// or https://");
  if (orderFormUrl && !isUrl(orderFormUrl)) return bad("Order form URL must start with http:// or https://");
  if (refundFormUrl && !isUrl(refundFormUrl)) return bad("Refund form URL must start with http:// or https://");

  let imageUrl = existing.image_url;
  if (has("image_url")) {
    const newUrl = sanitizeText(asStr("image_url"), 500);
    if (newUrl) imageUrl = newUrl;
  }
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    const saved = await saveUploadedImage(file);
    if (!saved.ok) return bad(saved.error);
    imageUrl = saved.url;
  }

  db.prepare(
    `UPDATE deals SET
      product_code = ?, title = ?, description = ?, category = ?, platform = ?, deal_type = ?,
      image_url = ?, deal_url = ?, target_keyword = ?, instructions = ?, coupon_code = ?,
      price_original = ?, price_sale = ?, cashback_amount = ?, review_amount = ?,
      rating_amount = ?, only_order_amount = ?, order_form_url = ?, refund_form_url = ?,
      total_slots = ?, claimed_slots = ?,
      stock = ?, featured = ?, active = ?, mediator_commission_amount = ?,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
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
    cashbackAmount,
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
    mediatorCommission,
    id
  );
  writeAutoBackupSafe("deal updated");

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const validationError = await validateRequest(req);
  if (validationError) return validationError;

  const { error } = await requireAdmin();
  if (error) return error;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return bad("Invalid deal id.");

  // Cascades to the deal's orders and from there to their reimbursements,
  // refunds and reviews, so the caller should be deliberate here.
  const res = db.prepare("DELETE FROM deals WHERE id = ?").run(id);
  if (res.changes === 0) return bad("Deal not found.", 404);
  writeAutoBackupSafe("deal deleted");
  return NextResponse.json({ ok: true });
}