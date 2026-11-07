"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DealCard from "@/components/DealCard";
import type { DealsQueryResult } from "@/lib/deals-query";

type Filters = {
  search: string;
  category: string;
  platform: string;
  sort: string;
  page: number;
};

export default function BrowseClient({
  initial,
  initialFilters,
}: {
  initial: DealsQueryResult;
  initialFilters: Filters;
}) {
  const [data, setData] = useState<DealsQueryResult>(initial);
  const [search, setSearch] = useState(initialFilters.search);
  const [category, setCategory] = useState(initialFilters.category);
  const [platform, setPlatform] = useState(initialFilters.platform);
  const [sort, setSort] = useState(initialFilters.sort);
  const [page, setPage] = useState(initialFilters.page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const signature = `${search}|${category}|${platform}|${sort}|${page}`;
  const initialSignature = useMemo(
    () =>
      `${initialFilters.search}|${initialFilters.category}|${initialFilters.platform}|${initialFilters.sort}|${initialFilters.page}`,
    [initialFilters]
  );

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      search,
      category,
      platform,
      sort,
      page: String(page),
    });
    try {
      const r = await fetch(`/api/deals?${qs.toString()}`);
      const d = await r.json().catch(() => ({}));
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

  // The first page is rendered on the server, so only fetch when the visitor
  // actually changes a filter. Returning to the initial filters reuses the
  // server-rendered result instead of refetching.
  useEffect(() => {
    if (signature === initialSignature) {
      setData(initial);
      setLoading(false);
      return;
    }
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Keep the URL in sync so filtered views can be shared and crawled.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (category !== "All") qs.set("category", category);
    if (platform !== "All") qs.set("platform", platform);
    if (sort !== "newest") qs.set("sort", sort);
    if (page > 1) qs.set("page", String(page));
    const next = qs.toString() ? `/browse?${qs.toString()}` : "/browse";
    window.history.replaceState(null, "", next);
  }, [search, category, platform, sort, page]);

  const platforms = useMemo(() => ["All", "Amazon", "Flipkart", "Myntra", "Brand Store"], []);
  const categories = useMemo(() => ["All", ...(data.categories ?? [])], [data.categories]);

  return (
    <>
      {/* Filter toolbar */}
      <div className="toolbar" style={{ gap: 12 }} role="search">
        <input
          className="input"
          style={{ flex: "1 1 220px", maxWidth: "none" }}
          placeholder="Search by title, keyword, or #product_code…"
          aria-label="Search deals"
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />

        <select
          className="input"
          value={platform}
          aria-label="Filter by platform"
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
          aria-label="Filter by category"
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
          aria-label="Sort deals"
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
        <div className="alert alert-error" role="alert">
          {error}{" "}
          <button type="button" className="btn btn-sm btn-secondary" onClick={load}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <p className="muted" aria-live="polite">Loading live brand deals…</p>
      ) : !data || data.deals.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40 }} aria-hidden="true">🔎</div>
          <h2>No campaigns found</h2>
          <p className="muted">Try adjusting your search terms or filters.</p>
          <button
            type="button"
            className="btn btn-secondary mt"
            onClick={() => {
              setSearch("");
              setCategory("All");
              setPlatform("All");
              setPage(1);
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
    </>
  );
}
