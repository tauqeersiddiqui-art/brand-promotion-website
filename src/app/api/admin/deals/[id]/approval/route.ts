import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, bad } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/rate-limit";
import { num, parseId } from "@/lib/validation";
import { sanitizeText, sanitizeHtml } from "@/lib/sanitize";
import { getCsrfTokenFromCookies } from "@/lib/csrf";
import { headers } from "next/headers";
import { postDealToTelegram } from "@/lib/telegram";
import { writeAutoBackupSafe } from "@/lib/auto-backup";

export const dynamic = "force-dynamic";

type DealRow = {
  id: number;
  title: string;
  platform: string;
  deal_type: string;
  price_sale: number;
  refund_amount: number;
  image_url: string;
  target_keyword: string;
  total_slots: number;
  mediator_commission_amount: number;
};

/** Approve or reject a mediator-submitted campaign. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const reqHeaders = await headers();
  const csrfToken = reqHeaders.get("x-csrf-token");
  const cookieToken = await getCsrfTokenFromCookies();
  if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
    return NextResponse.json(
      { error: "Invalid CSRF token. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const { user, error } = await requireAdmin();
  if (error) return error;

  const { id: idRaw } = await params;
  const id = parseId(idRaw);
  if (id === null) return bad("Invalid deal id.");

  const deal = db
    .prepare(
      `SELECT id, title, platform, deal_type, price_sale, refund_amount,
              image_url, target_keyword, total_slots, mediator_commission_amount
       FROM deals WHERE id = ?`
    )
    .get(id) as DealRow | undefined;
  if (!deal) return bad("Campaign not found.", 404);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Invalid form data.");
  }

  const action = sanitizeText(String(form.get("action") || ""), 20);
  if (action === "reject") {
    const reason = sanitizeHtml(String(form.get("reason") || "")).slice(0, 500);
    if (reason.length < 3) return bad("Please give a rejection reason.");

    db.prepare(
      `UPDATE deals
          SET approval_status = 'rejected', rejection_reason = ?,
              approved_by = NULL, approved_at = '', active = 0,
              updated_at = datetime('now')
        WHERE id = ?`
    ).run(reason, id);

    return NextResponse.json({ ok: true, approval_status: "rejected" });
  }

  if (action !== "approve") return bad("Unknown approval action.");

  const commission = num(
    form.get("mediator_commission_amount"),
    0,
    10_000_000,
    deal.mediator_commission_amount || 0
  );

  db.prepare(
    `UPDATE deals
        SET approval_status = 'approved', rejection_reason = '',
            approved_by = ?, approved_at = ?, active = 1,
            mediator_commission_amount = ?, updated_at = datetime('now')
      WHERE id = ?`
  ).run(user.id, new Date().toISOString(), commission, id);
  writeAutoBackupSafe("deal approved");

  const telegram = await postDealToTelegram({
    id: deal.id,
    title: deal.title,
    platform: deal.platform,
    deal_type: deal.deal_type,
    price_sale: deal.price_sale,
    refund_amount: deal.refund_amount,
    image_url: deal.image_url,
    target_keyword: deal.target_keyword,
    total_slots: deal.total_slots,
  });

  return NextResponse.json({
    ok: true,
    approval_status: "approved",
    mediator_commission_amount: commission,
    telegram: telegram.skipped ? "skipped" : telegram.ok ? "sent" : `failed: ${telegram.error}`,
  });
}
