import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-helpers";

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;
  return NextResponse.json({ user });
}
