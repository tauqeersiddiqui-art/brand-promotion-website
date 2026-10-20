import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * AdSense requires /ads.txt to list the publisher so buyers know the inventory
 * is authorised. Serving it from the env var means a client ID change does not
 * need a code edit.
 */
export function GET() {
  const client = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "").trim();
  const pubId = client.replace(/^ca-/, "");

  const body = /^pub-\d{10,}$/.test(pubId)
    ? `google.com, ${pubId}, DIRECT, f08c47fec0942fa0\n`
    : "# AdSense publisher ID is not configured (set NEXT_PUBLIC_ADSENSE_CLIENT).\n";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
