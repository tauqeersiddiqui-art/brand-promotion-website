/**
 * Environment validation - fails fast on startup if required variables are missing.
 * This prevents runtime errors and ensures all secrets are configured.
 */

const REQUIRED_ENV = [
  "AUTH_SECRET",
] as const;

// NEXT_PUBLIC_BASE_URL is required UNLESS running on Railway, where
// RAILWAY_PUBLIC_DOMAIN (e.g. brand-promotion-website-production.up.railway.app)
// provides the public origin automatically. This lets a Render -> Railway
// migration work without keeping a stale Render URL in env vars.
function hasBaseUrl(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_BASE_URL || "").trim() ||
      (process.env.RAILWAY_PUBLIC_DOMAIN || "").trim()
  );
}

const OPTIONAL_ENV = [
  "NEXT_PUBLIC_BASE_URL",
  "RAILWAY_PUBLIC_DOMAIN",
  "OCR_SPACE_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "NODE_ENV",
  "TUTORIAL_MODE",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
] as const;

type RequiredEnv = typeof REQUIRED_ENV[number];
type OptionalEnv =
  | (typeof OPTIONAL_ENV)[number]
  | "NEXT_PUBLIC_BASE_URL";

// Skip strict validation during build - these vars are needed at runtime, not build time
const isBuildTime = process.env.__NEXT_BUILD__ === "true";

function checkEnv():
  | { ok: true; config: Record<RequiredEnv | OptionalEnv, string> }
  | { ok: false; missing: string[]; config: Record<RequiredEnv | OptionalEnv, string> } {
  const missing: string[] = [];
  const config = {} as Record<string, string>;

  for (const key of REQUIRED_ENV) {
    const value = process.env[key];
    if (!value || value.trim() === "") {
      missing.push(key);
    } else {
      config[key] = value;
    }
  }

  for (const key of OPTIONAL_ENV) {
    config[key] = process.env[key] || "";
  }

  if (!hasBaseUrl()) {
    missing.push("NEXT_PUBLIC_BASE_URL (or RAILWAY_PUBLIC_DOMAIN on Railway)");
  } else {
    // Allow NEXT_PUBLIC_BASE_URL to be read via config even when it comes
    // from Railway's automatic domain.
    config["NEXT_PUBLIC_BASE_URL"] = (process.env.NEXT_PUBLIC_BASE_URL || "").trim();
  }

  if (missing.length > 0) {
    // `config` is still returned (minus the missing keys) so development can
    // fall back to empty values instead of throwing on every request.
    return { ok: false, missing, config: config as Record<RequiredEnv | OptionalEnv, string> };
  }

  return { ok: true, config: config as Record<RequiredEnv | OptionalEnv, string> };
}

const result = checkEnv();

if (!result.ok) {
  // Don't fail during build - warn only
  if (isBuildTime) {
    console.warn(`⚠️  [build] Missing optional env vars: ${result.missing.join(", ")}. These will be required at runtime.`);
  } else {
    const msg = `
╔═══════════════════════════════════════════════════════════════════╗
║  🛑 MISSING REQUIRED ENVIRONMENT VARIABLES                        ║
╠═══════════════════════════════════════════════════════════════════╣
║  ${result.missing.join("\n  ")}
║                                                                   ║
║  Create a .env.local file with:                                   ║
║  ${result.missing.map((k) => `${k}=your-secret-value`).join("\n  ")}
║                                                                   ║
║  See .env.example for reference.                                  ║
╚═══════════════════════════════════════════════════════════════════╝
  `;
    console.error(msg);
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required environment variables: ${result.missing.join(", ")}`);
    }
  }
}

/**
 * Get validated config - use this instead of process.env directly.
 * Guarantees all required vars are present.
 */
export function getConfig(): Record<RequiredEnv | OptionalEnv, string> {
  if (!result.ok) {
    // In development a missing optional var is common and must not take the
    // whole app down with an opaque 500 on every request, so fall back to an
    // empty string. Production already threw at module load (see above).
    // Skip throw during Next.js build - env vars are needed at runtime, not build time.
    if (process.env.NODE_ENV === "production" && !isBuildTime) {
      throw new Error("Environment validation failed - check startup logs");
    }
    return result.config as Record<RequiredEnv | OptionalEnv, string>;
  }
  return result.config;
}

/**
 * Validate AUTH_SECRET strength in production
 */
export function validateAuthSecret(secret: string): { ok: boolean; issues: string[] } {
  const issues: string[] = [];

  if (secret.length < 32) {
    issues.push("AUTH_SECRET must be at least 32 characters (256-bit) for HS256");
  }
  if (secret === "insecure-dev-secret-change-me") {
    issues.push("AUTH_SECRET is using the default insecure value");
  }
  if (/^[a-zA-Z0-9]+$/.test(secret)) {
    issues.push("AUTH_SECRET should contain special characters for better entropy");
  }
  // Check for common weak patterns
  if (/(.)\1{5,}/.test(secret)) {
    issues.push("AUTH_SECRET contains repeating characters (weak entropy)");
  }

  return { ok: issues.length === 0, issues };
}

// Validate on import in production
if (process.env.NODE_ENV === "production") {
  const secretCheck = validateAuthSecret(process.env.AUTH_SECRET || "");
  if (!secretCheck.ok) {
    console.warn("⚠️  AUTH_SECRET issues:", secretCheck.issues.join(", "));
  }
}

export const ENV = getConfig();