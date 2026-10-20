import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/browse`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/stores`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/track`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  let dealPages: MetadataRoute.Sitemap = [];
  try {
    const rows = db
      .prepare("SELECT id, created_at FROM deals WHERE active = 1 AND approval_status = 'approved' ORDER BY datetime(created_at) DESC LIMIT 500")
      .all() as { id: number; created_at: string }[];
    dealPages = rows.map((r) => ({
      url: `${base}/deal/${r.id}`,
      lastModified: r.created_at ? new Date(r.created_at.replace(" ", "T") + "Z") : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    /* database unavailable during build: still return static pages */
  }

  return [...staticPages, ...dealPages];
}
