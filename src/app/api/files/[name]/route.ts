import { NextResponse } from "next/server";
import fs from "fs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { mimeForFile, uploadFilePath } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serve an uploaded image.
 *
 * Order proofs, review screenshots and claim evidence are private: the uploads
 * table records who uploaded them, so only that account (or an admin) may read
 * them. Deal/product images have no uploads row and stay public.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const urlNew = `/api/files/${name}`;
  const urlLegacy = `/uploads/${name}`;
  const upload = db
    .prepare("SELECT user_id FROM uploads WHERE url = ? OR url = ? LIMIT 1")
    .get(urlNew, urlLegacy) as { user_id: number | null } | undefined;

  if (upload) {
    // Approved reviews are shown publicly on the deal page, so their
    // screenshots stay readable without a session. Everything else is private.
    const isPublicReview = db
      .prepare(
        "SELECT 1 FROM reviews WHERE status = 'approved' AND screenshot_url IN (?, ?) LIMIT 1"
      )
      .get(urlNew, urlLegacy);

    if (!isPublicReview) {
      const session = await getSession();
      if (!session) {
        return NextResponse.json({ error: "Please log in." }, { status: 401 });
      }
      if (session.role !== "admin" && upload.user_id !== session.userId) {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }
    }
  }

  const filePath = uploadFilePath(urlNew);
  if (!filePath) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = new Uint8Array(fs.readFileSync(filePath));
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": mimeForFile(filePath),
      "Content-Length": String(body.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": upload ? "private, no-store" : "public, max-age=31536000, immutable",
    },
  });
}
