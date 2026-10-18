import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-helpers";
import { applyRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  let s = String(v ?? "");
  // Neutralise spreadsheet formula injection. User-controlled fields (order
  // notes, names, refund reasons/details) reach this function, and a cell
  // starting with =, +, - or @ is executed as a formula — including DDE
  // exfiltration — when an admin opens the export.
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const head = columns.join(",");
  const body = rows
    .map((r) => columns.map((c) => csvEscape(r[c])).join(","))
    .join("\n");
  // BOM so Excel opens UTF-8 correctly
  return "﻿" + head + "\n" + body;
}

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  // Rate limiting
  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const type = req.nextUrl.searchParams.get("type") || "orders";
  const stamp = new Date().toISOString().slice(0, 10);

  if (type === "reimbursements") {
    const rows = db
      .prepare(
        `SELECT r.reimbursement_code, r.external_order_id, o.order_code, r.reviewer_name,
                o.full_name AS customer_name, o.email, o.phone, o.platform,
                COALESCE(d.title, 'Campaign: ' || o.product_code) AS deal_title,
                r.payout_method, r.upi_id, r.amount, r.status, r.utr_number,
                r.review_link, r.admin_note, r.created_at
         FROM reimbursements r
         JOIN orders o ON o.id = r.order_id
         LEFT JOIN deals d ON d.id = r.deal_id
         ORDER BY datetime(r.created_at) DESC`
      )
      .all() as unknown as Record<string, unknown>[];

    const csv = toCsv(rows, [
      "reimbursement_code", "external_order_id", "order_code", "reviewer_name",
      "customer_name", "email", "phone", "platform", "deal_title",
      "payout_method", "upi_id", "amount", "status", "utr_number",
      "review_link", "admin_note", "created_at",
    ]);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reimbursements-${stamp}.csv"`,
      },
    });
  }

  if (type === "refunds") {
    const rows = db
      .prepare(
        `SELECT r.refund_code, o.order_code, o.external_order_id, o.full_name, o.email, o.phone,
                d.title AS deal_title, o.total, r.reason, r.details, r.status,
                r.admin_note, r.created_at
         FROM refunds r
         JOIN orders o ON o.id = r.order_id
         LEFT JOIN deals d ON d.id = o.deal_id
         ORDER BY datetime(r.created_at) DESC`
      )
      .all() as unknown as Record<string, unknown>[];

    const csv = toCsv(rows, [
      "refund_code", "order_code", "external_order_id", "full_name", "email", "phone",
      "deal_title", "total", "reason", "details", "status", "admin_note", "created_at",
    ]);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="refunds-${stamp}.csv"`,
      },
    });
  }

  const rows = db
    .prepare(
      `SELECT o.order_code, o.external_order_id, o.product_code, o.platform,
              o.reviewer_name, o.mediator_name, o.full_name, o.email, o.phone,
              COALESCE(d.title, 'Campaign: ' || o.product_code) AS deal_title,
              o.order_date, o.quantity, o.unit_price, o.total, o.status,
              o.ocr_order_match, o.notes, o.admin_note, o.created_at
       FROM orders o
       LEFT JOIN deals d ON d.id = o.deal_id
       ORDER BY datetime(o.created_at) DESC`
    )
    .all() as unknown as Record<string, unknown>[];

  const csv = toCsv(rows, [
    "order_code", "external_order_id", "product_code", "platform",
    "reviewer_name", "mediator_name", "full_name", "email", "phone",
    "deal_title", "order_date", "quantity", "unit_price", "total",
    "status", "ocr_order_match", "notes", "admin_note", "created_at",
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${stamp}.csv"`,
    },
  });
}