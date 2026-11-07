import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container" style={{ paddingTop: 64, paddingBottom: 80, textAlign: "center" }}>
      <div style={{ fontSize: 44 }} aria-hidden="true">🔍</div>
      <h1 style={{ fontSize: 26, margin: "12px 0 8px" }}>Page not found</h1>
      <p className="muted" style={{ maxWidth: 460, margin: "0 auto 20px" }}>
        This campaign may have ended or the link is out of date. Live campaigns are always
        on the browse page.
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href="/browse" className="btn">
          Browse live deals
        </Link>
        <Link href="/" className="btn btn-secondary">
          Go home
        </Link>
      </div>
    </div>
  );
}
