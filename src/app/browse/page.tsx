"use client";

import { useCallback, useEffect, useState } from "react";
import DealCard, { type Deal } from "@/components/DealCard";

type Resp = {
  deals: Deal[];
  categories: string[];
  total: number;
  page: number;
  pages: number;
};

function urlParam(key: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) || "";
}

export default function BrowsePage() {
  const [data, setData] = useState<Resp | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(() => urlParam("category") || "All");
  const [platform, setPlatform] = useState(() => urlParam("platform") || "All");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      search,
      category,
      sort,
      page: String(page),
    });
    // The platform filter is applied server-side. Filtering in the browser left
    // `total`/`pages` describing the unfiltered set, so counts and pagination
    // disagreed with what was actually rendered.
    if (platform !== "All") qs.set("platform", platform);
    try {
      const r = await fetch(`/api/deals?${qs.toString()}`);
      const d = await r.json().catch(() => ({}));
      // A 429/500 body has no `deals` array. Storing it as `data` used to make
      // the render below throw on `data.deals.length` and blank the page.
      if (!r.ok) {
        setError(d?.error || `Failed to load deals (${r.status}).`);
        return;
      }
      setData({ ...d, deals: d.deals ?? [] });
      setError("");
    } catch {
      setError("Network error while loading deals. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [search, category, platform, sort, page]);

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const categories = ["All", ...(data?.categories ?? [])];
  const platforms = ["All", "Amazon", "Flipkart", "Myntra", "Brand Store"];

  return (
    <div className="container" style={{ paddingTop: 36, paddingBottom: 60 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2>Live brand campaigns &amp; deals</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Explore 100% cashback deals across Amazon, Flipkart, Myntra and direct brand stores.
          </p>
        </div>
        <span className="muted" style={{ fontSize: 14 }}>
          {data ? `${data.total} deals found` : "…"}
        </span>
      </div>

      {/* Filter toolbar */}
      <div className="toolbar" style={{ gap: 12 }}>
        <input
          className="input"
          style={{ flex: "1 1 220px", maxWidth: "none" }}
          placeholder="Search by title, keyword, or #product_code…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />

        <select
          className="input"
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value);
            setPage(1);
          }}
          style={{ width: "auto" }}
        >
          {platforms.map((p) => (
            <option key={p} value={p}>
              {p === "All" ? "All Platforms" : p}
            </option>
          ))}
        </select>

        <select
          className="input"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          style={{ width: "auto" }}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === "All" ? "All Categories" : c}
            </option>
          ))}
        </select>

        <select
          className="input"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
          style={{ width: "auto" }}
        >
          <option value="newest">Newest first</option>
          <option value="slots">Available slots</option>
          <option value="discount">Biggest discount</option>
          <option value="price-low">Price: Low to High</option>
          <option value="price-high">Price: High to Low</option>
        </select>
      </div>

      {error ? (
        <div className="alert alert-error">
          {error}{" "}
          <button type="button" className="btn btn-sm btn-secondary" onClick={load}>
            Retry
          </button>
        </div>
      ) : loading && !data ? (
        <p className="muted">Loading live brand deals…</p>
      ) : !data || data.deals.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40 }}>🔎</div>
          <h3>No campaigns found</h3>
          <p className="muted">Try adjusting your search terms or filters.</p>
          <button
            type="button"
            className="btn btn-secondary mt"
            onClick={() => {
              setSearch("");
              setCategory("All");
              setPlatform("All");
            }}
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <>
          <div className="deal-grid">
            {data.deals.map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>

          {data.pages > 1 && (
            <div className="toolbar" style={{ justifyContent: "center", marginTop: 32 }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Prev
              </button>
              <span className="muted" style={{ padding: "0 10px", fontSize: 13.5 }}>
                Page {data.page} of {data.pages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
