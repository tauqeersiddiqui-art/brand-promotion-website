/**
 * Canonical public origin, without a trailing slash.
 *
 * NEXT_PUBLIC_BASE_URL is the intended value; RAILWAY_PUBLIC_DOMAIN is the
 * fallback Railway provides automatically (e.g. brand-promotion-website-production.up.railway.app
 * -> https://brand-promotion-website-production.up.railway.app), so a missing env var
 * no longer produces http://localhost:3000 canonicals, sitemap entries and og:image URLs
 * in production. Works for both old Render and new Railway deployments.
 */
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}
