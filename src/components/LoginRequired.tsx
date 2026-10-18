"use client";

import Link from "next/link";

export default function LoginRequired({
  title,
  description,
  next,
}: {
  title: string;
  description: string;
  next: string;
}) {
  const query = `?next=${encodeURIComponent(next)}`;
  return (
    <div className="card" style={{ textAlign: "center", padding: "34px 20px" }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 20 }}>{title}</h3>
      <p className="muted" style={{ maxWidth: 460, margin: "0 auto 18px", fontSize: 13.5 }}>
        {description}
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href={`/login${query}`} className="btn">
          Log in
        </Link>
        <Link href={`/signup${query}`} className="btn btn-secondary">
          Create free account
        </Link>
      </div>
    </div>
  );
}
