export default function Loading() {
  return (
    <div className="container" style={{ paddingTop: 36, paddingBottom: 60 }} aria-busy="true" aria-live="polite">
      <div
        style={{
          height: 26,
          width: 320,
          maxWidth: "100%",
          borderRadius: 8,
          background: "var(--bg-soft)",
          marginBottom: 18,
        }}
      />
      <div className="deal-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ aspectRatio: "1 / 1", background: "var(--bg-soft)" }} />
            <div style={{ padding: 16 }}>
              <div style={{ height: 14, width: "70%", borderRadius: 6, background: "var(--bg-soft)" }} />
              <div style={{ height: 14, width: "45%", borderRadius: 6, background: "var(--bg-soft)", marginTop: 10 }} />
            </div>
          </div>
        ))}
      </div>
      <span className="muted" style={{ display: "block", marginTop: 16, fontSize: 13 }}>
        Loading…
      </span>
    </div>
  );
}
