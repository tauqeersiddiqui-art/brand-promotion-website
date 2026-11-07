import { NextResponse } from "next/server";
import { getSignedS3Url, isS3Configured } from "@/lib/storage";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serve a file from R2/S3 storage.
 *
 * R2 objects are private by default, so this route generates a signed URL
 * that redirects the client to the temporary R2 URL.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!isS3Configured()) {
    return NextResponse.json({ error: "S3 storage not configured." }, { status: 503 });
  }

  // Check if this is a public review screenshot
  const url = `/api/files/r2/${key}`;
  const isPublicReview = db
    .prepare(
      "SELECT 1 FROM reviews WHERE status = 'approved' AND screenshot_url = ? LIMIT 1"
    )
    .get(url);

  if (!isPublicReview) {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }

    // Verify ownership through uploads table
    const upload = db
      .prepare("SELECT user_id FROM uploads WHERE url = ? LIMIT 1")
      .get(url) as { user_id: number | null } | undefined;

    if (upload && session.role !== "admin" && upload.user_id !== session.userId) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
  }

  try {
    const signedUrl = await getSignedS3Url(key, 3600);
    if (!signedUrl) {
      return NextResponse.json({ error: "Failed to generate URL." }, { status: 500 });
    }

    // Redirect to the signed R2 URL
    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (err: unknown) {
    console.error("[files/r2] Error:", err);
    return NextResponse.json(
      { error: "Failed to serve file." },
      { status: 500 }
    );
  }
}