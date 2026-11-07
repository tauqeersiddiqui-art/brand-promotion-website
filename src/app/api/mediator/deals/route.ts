import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireMediator, bad } from "@/lib/api-helpers";
import { str, isUrl, num, int } from "@/lib/validation";
import { saveUploadedImage } from "@/lib/upload";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { sanitizeText, sanitizeHtml } from "@/lib/sanitize";
import { getCsrfTokenFromCookies } from "@/lib/csrf";
import { headers } from "next/headers";
import { writeAutoBackupSafe } from "@/lib/auto-backup";
import { resolveRefundAmount } from "@/lib/refund";

export const dynamic = "force-dynamic";

const MAX_PENDING = 20;

export async function GET() {
  const { user, error } = await requireMediator();
  if (error) return error;

  const deals = db
    .prepare(
      `SELECT d.id, d.product_code, d.title, d.category, d.platform, d.deal_type,
              d.image_url, d.price_sale, d.refund_amount, d.total_slots,
              d.stock, d.active, d.approval_status, d.rejection_reason,
              d.mediator_commission_amount, d.created_at, d.approved_at,
              e.name AS approved_by_name
         FROM deals d
         LEFT JOIN users e ON e.id = d.approved_by
        WHERE d.submitted_by = ?
        ORDER BY datetime(d.created_at) DESC`
    )
    .all(user.id);

  const stats = {
    pending: (deals as { approval_status: string }[]).filter((d) => d.approval_status === "pending").length,
    approved: (deals as { approval_status: string }[]).filter((d) => d.approval_status === "approved").length,
    rejected: (deals as { approval_status: string }[]).filter((d) => d.approval_status === "rejected").length,
    approved_commission: (deals as { approval_status: string; mediator_commission_amount: number }[])
      .filter((d) => d.approval_status === "approved")
      .reduce((sum, d) => sum + (d.mediator_commission_amount || 0), 0),
  };

  return NextResponse.json({ deals, stats }, { headers: { "Cache-Control": "no-store" } });
}

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

  const { user, error } = await requireMediator();
  if (error) return error;

  const status = db
    .prepare("SELECT mediator_status FROM users WHERE id = ?")
    .get(user.id) as { mediator_status: string } | undefined;
  if (status?.mediator_status !== "active") {
    return bad("Your mediator account is suspended. Contact the admin.", 403);
  }

  const ip = clientIpFromHeaders(reqHeaders);
  const rlUser = await applyRateLimit("mediatorAction", String(user.id));
  const rlIp = await applyRateLimit("mediatorAction", `ip:${ip}`);
  if (!rlUser.ok || !rlIp.ok) {
    return NextResponse.json(
      { error: `Too many submissions. Try again in ${Math.max(rlUser.retryAfter, rlIp.retryAfter)}s.` },
      { status: 429 }
    );
  }

  const pending = (
    db
      .prepare("SELECT COUNT(*) AS c FROM deals WHERE submitted_by = ? AND approval_status = 'pending'")
      .get(user.id) as { c: number }
  ).c;
  if (pending >= MAX_PENDING) {
    return bad("You have too many campaigns waiting for approval. Please wait for the admin.", 429);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Invalid form data.");
  }

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
  const stock = int(form.get("stock"), 0, 1_000_000, totalSlots);
  const commission = num(form.get("mediator_commission_amount"), 0, 10_000_000, 0);

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
        stock, featured, active, submitted_by, approval_status,
        mediator_commission_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 0, ?, 'pending', ?)`
    )
    .run(
      "",
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
      stock,
      user.id,
      commission
    );

  const newId = Number(info.lastInsertRowid);
  const productCode = `SF-P${newId.toString().padStart(3, "0")}`;
  db.prepare("UPDATE deals SET product_code = ? WHERE id = ?").run(productCode, newId);
  writeAutoBackupSafe("mediator deal submitted");

  return NextResponse.json({
    ok: true,
    id: newId,
    product_code: productCode,
    approval_status: "pending",
    mediator_commission_amount: commission,
  });
}
