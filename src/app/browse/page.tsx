import type { Metadata } from "next";
import { queryDeals } from "@/lib/deals-query";
import BrowseClient from "./BrowseClient";

export const metadata: Metadata = {
  title: "Live brand campaigns & deals",
  description:
    "Explore live 100% refund brand campaigns across Amazon, Flipkart, Myntra and direct brand stores. Buy with a keyword, post a review, get reimbursed.",
  alternates: { canonical: "/browse" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const filters = {
    search: one(sp.search),
    category: one(sp.category) || "All",
    platform: one(sp.platform) || "All",
    sort: one(sp.sort) || "newest",
    page: Math.max(1, parseInt(one(sp.page) || "1", 10) || 1),
  };

  // Rendered on the server: this used to be a "use client" page that fetched
  // after hydration, so search engines only ever saw an empty shell.
  const initial = queryDeals({ ...filters, limit: 12 });

  return (
    <div className="container" style={{ paddingTop: 36, paddingBottom: 60 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h1 style={{ fontSize: "1.55rem", margin: 0 }}>
            Live brand campaigns &amp; deals
          </h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Explore 100% refund deals across Amazon, Flipkart, Myntra and direct brand stores.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 14 }}>
            {initial.total} deals found
          </span>
          <a className="btn btn-sm btn-outline" href="/#how-it-works">
            How deals work
          </a>
        </div>
      </div>

      <BrowseClient initial={initial} initialFilters={filters} />
    </div>
  );
}
