import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api-helpers";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  let s = String(v ?? "");
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
  return "﻿" + head + "\n" + body;
}

export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  // Rate limiting
  const reqHeaders = await headers();
  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("adminAction", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: { reimbursementIds?: number[]; dealIds?: number[]; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { reimbursementIds = [], dealIds = [], status = "approved" } = body;

  if (reimbursementIds.length === 0 && dealIds.length === 0) {
    return NextResponse.json(
      { error: "Provide either reimbursementIds or dealIds to export." },
      { status: 400 }
    );
  }

  // Build WHERE clause for reimbursements
  const whereParts: string[] = ["r.status = ?"];
  const params: (string | number)[] = [status];

  if (reimbursementIds.length > 0) {
    const placeholders = reimbursementIds.map(() => "?").join(",");
    whereParts.push(`r.id IN (${placeholders})`);
    params.push(...reimbursementIds);
  }

  if (dealIds.length > 0) {
    const placeholders = dealIds.map(() => "?").join(",");
    whereParts.push(`r.deal_id IN (${placeholders})`);
    params.push(...dealIds);
  }

  const whereSql = whereParts.join(" AND ");

  const rows = db
    .prepare(
      `SELECT
         r.reimbursement_code,
         r.external_order_id,
         o.order_code,
         r.reviewer_name,
         o.full_name AS customer_name,
         o.email,
         o.phone,
         o.platform,
         COALESCE(d.title, 'Campaign: ' || o.product_code) AS deal_title,
         r.payout_method,
         r.upi_id,
         r.bank_name,
         r.account_number,
         r.ifsc_code,
         r.account_holder,
         r.amount,
         r.status,
         r.utr_number,
         r.review_link,
         r.admin_note,
         r.created_at,
         d.seller_name,
         d.seller_contact,
         d.seller_telegram
       FROM reimbursements r
       JOIN orders o ON o.id = r.order_id
       LEFT JOIN deals d ON d.id = r.deal_id
       WHERE ${whereSql}
       ORDER BY datetime(r.created_at) DESC`
    )
    .all(...params) as unknown as Record<string, unknown>[];

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No matching reimbursements found for the given criteria." },
      { status: 404 }
    );
  }

  // Group by seller for easier distribution
  const bySeller = new Map<string, typeof rows>();
  for (const row of rows) {
    const sellerKey = (row.seller_name as string) || (row.seller_contact as string) || (row.seller_telegram as string) || "Unknown Seller";
    const arr = bySeller.get(sellerKey) || [];
    arr.push(row);
    bySeller.set(sellerKey, arr);
  }

  // Build a single CSV with seller info on each row
  const csv = toCsv(rows, [
    "reimbursement_code",
    "external_order_id",
    "order_code",
    "reviewer_name",
    "customer_name",
    "email",
    "phone",
    "platform",
    "deal_title",
    "payout_method",
    "upi_id",
    "bank_name",
    "account_number",
    "ifsc_code",
    "account_holder",
    "amount",
    "status",
    "utr_number",
    "review_link",
    "admin_note",
    "created_at",
    "seller_name",
    "seller_contact",
    "seller_telegram",
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = dealIds.length === 1
    ? `seller-export-${stamp}-deal-${dealIds[0]}.csv`
    : `seller-export-${stamp}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

export async function GET(req: Request) {
  // Allow GET for quick testing / direct link download
  const url = new URL(req.url);
  const dealIds = url.searchParams.get("dealIds")?.split(",").map(Number).filter(Boolean) || [];
  const status = url.searchParams.get("status") || "approved";
  const reimbursementIds = url.searchParams.get("ids")?.split(",").map(Number).filter(Boolean) || [];

  return POST(new Request(req.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reimbursementIds, dealIds, status }),
  }));
}