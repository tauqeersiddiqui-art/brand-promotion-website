import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { UPLOAD_DIR } from "@/lib/storage";
import fs from "fs";

export const runtime = "nodejs";

type HealthStatus = "healthy" | "unhealthy";

export async function GET() {
  const checks: {
    timestamp: string;
    database: { status: HealthStatus; error?: string };
    storage: { status: HealthStatus; error?: string; uploads_dir?: string };
  } = {
    timestamp: new Date().toISOString(),
    database: { status: "healthy" as const },
    storage: { status: "healthy" as const },
  };

  // Check database
  try {
    const result = db.prepare("SELECT 1 as test").get() as { test: number } | undefined;
    if (!result || result.test !== 1) {
      checks.database = { status: "unhealthy" as const, error: "Database query failed" };
    }
  } catch (e: any) {
    checks.database = { status: "unhealthy" as const, error: e.message };
  }

  // Check storage
  try {
    const exists = fs.existsSync(UPLOAD_DIR);
    if (exists) {
      checks.storage = { status: "healthy" as const, uploads_dir: UPLOAD_DIR };
    } else {
      checks.storage = { status: "unhealthy" as const, error: "Uploads directory missing" };
    }
  } catch (e: any) {
    checks.storage = { status: "unhealthy" as const, error: e.message };
  }

  const isHealthy = checks.database.status === "healthy" && checks.storage.status === "healthy";

  return NextResponse.json(
    {
      status: isHealthy ? "healthy" as const : "unhealthy" as const,
      checks,
    },
    { status: isHealthy ? 200 : 503 }
  );
}