import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { bad } from "@/lib/api-helpers";
import { applyRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: number;
  order_code: string;
  external_order_id: string;
  product_code: string;
  deal_id: number | null;
  reviewer_name: string;
  full_name: string;
  email: string;
  phone: string;
  platform: string;
  deal_type: string;
  mediator_name: string;
  order_date: string;
  quantity: number;
  unit_price: number;
  total: number;
  status: string;
  created_at: string;
  deal_title: string;
  deal_image: string;
};

/**
 * Public order lookup for the Cancel page.
 *
 * The Cancel page needs to find an order by its order code and optionally an
 * email so the user can request a cancellation. Unlike the track endpoint this
 * is intentionally permissive: anyone who knows an order code can view the
 * public summary needed to cancel. Payout destinations (UPI, bank) are never
 * returned — only the fields the cancel flow needs.
 */
export async function GET(req: NextRequest) {
  const reqHeaders = await headers();
  const ip = clientIpFromHeaders(reqHeaders);
  const rl = await applyRateLimit("apiSearch", ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const orderCode = sanitizeText((sp.get("order_code") || sp.get("q") || "").trim(), 40);
  const email = sanitizeText((sp.get("email") || "").trim(), 254).toLowerCase();

  if (!orderCode) {
    return bad("Please enter an order code.", 400);
  }

  const order = db
    .prepare(
      `SELECT o.id, o.order_code, o.external_order_id, o.product_code, o.deal_id,
              o.reviewer_name, o.full_name, o.email, o.phone, o.platform,
              o.deal_type, o.mediator_name, o.order_date, o.quantity,
              o.unit_price, o.total, o.status, o.created_at,
              COALESCE(d.title, 'Campaign: ' || o.product_code) AS deal_title,
              COALESCE(d.image_url, '') AS deal_image
       FROM orders o
       LEFT JOIN deals d ON d.id = o.deal_id
       WHERE o.order_code = ?
       LIMIT 1`
    )
    .get(orderCode) as OrderRow | undefined;

  if (!order) {
    return NextResponse.json(
      { error: "Order not found. Please check the order code and try again." },
      { status: 404 }
    );
  }

  // If an email was supplied, it must match the order's email (case-insensitive).
  if (email && order.email && email !== order.email.toLowerCase()) {
    return NextResponse.json(
      { error: "The email address does not match this order." },
      { status: 403 }
    );
  }

  // Only allow cancellation for orders that are still confirmed.
  const cancellable = order.status === "confirmed";

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      order_code: order.order_code,
      external_order_id: order.external_order_id,
      product_code: order.product_code,
      deal_title: order.deal_title,
      deal_image: order.deal_image,
      platform: order.platform,
      deal_type: order.deal_type,
      reviewer_name: order.reviewer_name,
      full_name: order.full_name,
      quantity: order.quantity,
      unit_price: order.unit_price,
      total: order.total,
      status: order.status,
      created_at: order.created_at,
      cancellable,
    },
  });
}