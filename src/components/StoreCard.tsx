"use client";

import type { ReactNode } from "react";

export type Store = {
  name: string;
  url: string;
  searchUrl: string;
  category: string;
  blurb: string;
  logoDomain: string;
};

export default function StoreCard({ store, count }: { store: Store; count: number }) {
  const logoUrl = `https://logo.clearbit.com/${store.logoDomain}`;
  return (
    <article className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img
          src={logoUrl}
          alt={`${store.name} logo`}
          loading="lazy"
          style={{
            width: 44,
            height: 44,
            objectFit: "contain",
            flexShrink: 0,
            borderRadius: 6,
          }}
          onError={(e) => {
            ((e.target as HTMLImageElement).style.display = "none");
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1, gap: 8, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{store.name}</h3>
          {count > 0 && (
            <span className="badge badge-outline" style={{ whiteSpace: "nowrap" }}>
              {count} featured deal{count === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
      <span className="muted" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {store.category}
      </span>
      <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
        {store.blurb}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto", paddingTop: 6 }}>
        <a
          className="btn btn-sm"
          href={store.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Visit store
        </a>
        <a
          className="btn btn-outline btn-sm"
          href={store.searchUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Search on store
        </a>
      </div>
    </article>
  );
}