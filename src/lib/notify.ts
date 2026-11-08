/**
 * Admin notifications for new orders, refund claims, and reimbursement claims.
 *
 * Two channels (both optional, both fire-and-forget — failures never break the
 * user's submit):
 *   1. Email via Resend (fetch API, no SDK needed) — RESEND_API_KEY
 *   2. WhatsApp via Meta WhatsApp Business Cloud API — WHATSAPP_TOKEN +
 *      WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_TEMPLATE_NAME (pre-approved)
 *
 * Setup:
 *   Email:
 *     1. resend.com -> API Keys -> create key (sending access)
 *     2. Add a verified domain (or use onboarding@resend.dev for testing)
 *     3. RESEND_API_KEY=re_... , NOTIFY_FROM_EMAIL=alerts@yourdomain.com
 *        NOTIFY_TO_EMAIL=you@example.com (defaults to support_email setting)
 *   WhatsApp:
 *     1. developers.facebook.com -> create app -> WhatsApp -> Cloud API
 *     2. Add test/recipient number, create a template (e.g. `new_order_alert`)
 *     3. WHATSAPP_TOKEN=EAA..., WHATSAPP_PHONE_NUMBER_ID=123456...,
 *        WHATSAPP_TEMPLATE_NAME=new_order_alert,
 *        ADMIN_WHATSAPP_NUMBER=919876543210 (defaults to whatsapp setting)
 *
 * Notifications use `void notify...()` from routes — they run after the
 * response is sent and swallow errors so submits never fail because of this.
 */

import { getSettings } from "./settings";

export type NotifyOrderData = {
  orderCode: string;
  externalOrderId: string;
  name: string;
  email: string;
  phone: string;
  total: number;
  platform: string;
  dealTitle?: string;
  productCode?: string;
};

export type NotifyRefundData = {
  refundCode: string;
  orderId: number;
  reason: string;
  details?: string;
};

export type NotifyReimbursementData = {
  reimbursementCode: string;
  externalOrderId: string;
  reviewerName?: string;
  amount: number;
  upiId?: string;
  payoutMethod?: string;
  reviewLink?: string;
};

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

function esc(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

function notifyToEmail(): string {
  return (
    (process.env.NOTIFY_TO_EMAIL || "").trim() ||
    (process.env.ADMIN_EMAIL || "").trim() ||
    getSettings().support_email ||
    ""
  ).trim();
}

function notifyFromEmail(): string {
  return (process.env.NOTIFY_FROM_EMAIL || "alerts@brandpromotion.in").trim();
}

function adminWhatsApp(): string {
  const raw = (process.env.ADMIN_WHATSAPP_NUMBER || getSettings().whatsapp || "").replace(/[^0-9]/g, "");
  if (raw.length === 10) return `91${raw}`;
  if (raw.length === 11 && raw.startsWith("0")) return `91${raw.slice(1)}`;
  return raw;
}

export function emailConfigured(): boolean {
  return Boolean(((process.env.RESEND_API_KEY || "").trim() && notifyToEmail().trim()));
}

export function whatsappConfigured(): boolean {
  return Boolean(
    (process.env.WHATSAPP_TOKEN || "").trim() &&
      (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim() &&
      adminWhatsApp().trim()
  );
}

async function sendEmail(subject: string, html: string): Promise<void> {
  const key = (process.env.RESEND_API_KEY || "").trim();
  const to = notifyToEmail();
  if (!key || !to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: notifyFromEmail(), to, subject, html }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn("[notify] email failed:", res.status, t.slice(0, 300));
    }
  } catch (e) {
    console.warn("[notify] email error:", e instanceof Error ? e.message : String(e));
  }
}

async function sendWhatsApp(header: string, bodyLines: string[], templateName?: string): Promise<void> {
  const token = (process.env.WHATSAPP_TOKEN || "").trim();
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const to = adminWhatsApp();
  if (!token || !phoneId || !to) return;
  const template = templateName || (process.env.WHATSAPP_TEMPLATE_NAME || "new_order_alert").trim();
  try {
    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: "en" },
        components: [
          { type: "header", parameters: [{ type: "text", text: header.slice(0, 60) }] },
          { type: "body", parameters: [{ type: "text", text: bodyLines.join(" | ").slice(0, 1024) }] },
        ],
      },
    };
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn("[notify] whatsapp failed:", res.status, t.slice(0, 300));
    }
  } catch (e) {
    console.warn("[notify] whatsapp error:", e instanceof Error ? e.message : String(e));
  }
}

function siteBase(): string {
  const configured = (process.env.NEXT_PUBLIC_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const railway = (process.env.RAILWAY_PUBLIC_DOMAIN || "").trim();
  if (railway) return `https://${railway.replace(/\/+$/, "")}`;
  return "";
}

// --- Public helpers: call with `void` so routes never wait on them. ---

export function notifyNewOrder(d: NotifyOrderData): void {
  const lines = [
    `Order ${d.orderCode}`,
    d.externalOrderId ? `Platform ID ${d.externalOrderId}` : "",
    `${d.name} (${d.phone})`,
    d.platform ? `Platform ${d.platform}` : "",
    `Total ${inr(d.total)}`,
    d.dealTitle ? `Deal: ${d.dealTitle}` : "",
  ].filter(Boolean);
  const adminOrderUrl = d.orderCode ? `${siteBase()}/admin/orders` : "";
  void sendEmail(
    `🆕 New order ${d.orderCode} — ${inr(d.total)}`,
    `<p><strong>New order submitted</strong></p><ul>${
      lines.map((l) => `<li>${esc(l)}</li>`).join("")
    }</ul>${adminOrderUrl ? `<p><a href="${esc(adminOrderUrl)}">View in admin</a></p>` : ""}<p>Customer: ${esc(d.email)}</p>`
  );
  void sendWhatsApp("New order", lines);
}

export function notifyRefundRequest(d: NotifyRefundData): void {
  const lines = [`Refund ${d.refundCode}`, `Order #${d.orderId}`, `Reason: ${d.reason}`, d.details ? d.details.slice(0, 300) : ""].filter(Boolean);
  const url = siteBase() ? `${siteBase()}/admin/refunds` : "";
  void sendEmail(
    `↩️ Refund requested ${d.refundCode}`,
    `<p><strong>New refund request</strong></p><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${
      url ? `<p><a href="${esc(url)}">View in admin</a></p>` : ""
    }`
  );
  void sendWhatsApp("Refund requested", lines, process.env.WHATSAPP_TEMPLATE_NAME || "new_order_alert");
}

export function notifyReimbursementClaim(d: NotifyReimbursementData): void {
  const lines = [
    `Claim ${d.reimbursementCode}`,
    d.externalOrderId ? `Platform ID ${d.externalOrderId}` : "",
    d.reviewerName ? `Reviewer ${d.reviewerName}` : "",
    `Amount ${inr(d.amount)}`,
    d.payoutMethod ? `Payout ${d.payoutMethod.toUpperCase()} ${d.upiId || ""}` : "",
    d.reviewLink ? `Review ${d.reviewLink}` : "",
  ].filter(Boolean);
  const url = siteBase() ? `${siteBase()}/admin/reimbursements` : "";
  void sendEmail(
    `💸 Refund claim ${d.reimbursementCode} — ${inr(d.amount)}`,
    `<p><strong>New refund claim</strong></p><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${
      url ? `<p><a href="${esc(url)}">View in admin</a></p>` : ""
    }`
  );
  void sendWhatsApp("Refund claim", lines, process.env.WHATSAPP_TEMPLATE_NAME || "new_order_alert");
}
