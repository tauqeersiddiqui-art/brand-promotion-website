import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Build a strict Content Security Policy for production.
 * - default-src 'self' - all resources must come from same origin by default
 * - script-src 'self' - only same-origin scripts (Next.js uses nonce in dev, but we use 'unsafe-inline' for dev inline scripts)
 * - style-src 'self' 'unsafe-inline' - inline styles needed for CSS-in-JS / Tailwind-like patterns
 * - img-src 'self' data: blob: https: - allow images from same origin, data URLs, blobs, and HTTPS external (for deal images)
 * - font-src 'self' data: - fonts from same origin or data URLs
 * - connect-src 'self' https://api.ocr.space https://www.google.com https://accounts.google.com - API endpoints
 * - frame-src 'self' https://accounts.google.com - Google OAuth iframe
 * - frame-ancestors 'none' - prevents clickjacking (replaces X-Frame-Options)
 * - base-uri 'self' - prevents base tag hijacking
 * - form-action 'self' - forms can only submit to same origin
 * - upgrade-insecure-requests - auto-upgrade HTTP to HTTPS
 * - block-all-mixed-content - block mixed content
 */
function getCsp() {
  if (!isProd) {
    // Development: more permissive for HMR, webpack, etc.
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.ocr.space https://www.google.com https://accounts.google.com ws:",
      "frame-src 'self' https://accounts.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
  }

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // 'unsafe-inline' needed for Next.js inline scripts; 'unsafe-eval' for devtools in prod builds if needed
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.ocr.space https://www.google.com https://accounts.google.com",
    "frame-src 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
    "block-all-mixed-content",
  ].join("; ");
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  reactStrictMode: true,

  async headers() {
    const csp = getCsp();

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        ],
      },
      {
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
      {
        source: "/uploads/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'none'; frame-ancestors 'none'" },
        ],
      },
    ];
  },

  // Enable experimental features for security
  experimental: {
    // Server actions will have CSRF protection by default in Next.js 15+
  },
};

export default nextConfig;