import { NextResponse } from "next/server";
import { getCsrfTokenForClient } from "@/lib/csrf";

/** Get/set CSRF token for client-side forms. */
export async function GET() {
  const token = await getCsrfTokenForClient();
  return NextResponse.json({ csrfToken: token });
}