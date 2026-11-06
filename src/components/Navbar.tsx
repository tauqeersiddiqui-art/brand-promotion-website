"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function getCsrfHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const cookies = document.cookie.split("; ").reduce((acc, c) => {
    const [k, ...v] = c.split("=");
    acc[k] = v.join("=");
    return acc;
  }, {} as Record<string, string>);
  const token = cookies["bp_csrf_js"];
  return token ? { "x-csrf-token": token } : {};
}

type Me = { id: number; name: string; email: string; role: string } | null;

export default function Navbar({ siteName }: { siteName: string }) {
  const [me, setMe] = useState<Me>(null);
  const [loaded, setLoaded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.user) setMe(d.user);
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", headers: getCsrfHeader() }).catch(() => {});
    window.location.href = "/";
  }

  const links = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "/browse", label: "Live Deals" },
    { href: "/stores", label: "Stores" },
    { href: "/claim", label: "Claim Refund" },
    { href: "/track", label: "Track Status" },
    { href: "/cancel", label: "Cancel" },
    { href: "/help", label: "Need help?" },
    ...(me?.role === "mediator" ? [{ href: "/mediator", label: "Mediator" }] : []),
    ...(me?.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <>
      <a href="#content" className="skip-link">Skip to content</a>
      <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand">
          <span className="logo">BP</span>
          <span>{siteName}</span>
        </Link>

        <nav className="nav-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={pathname === l.href ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="nav-cta">
          {loaded && me ? (
            <>
              <Link href="/account" className="btn btn-outline btn-sm">
                {me.name.split(" ")[0]}
              </Link>
              <button onClick={logout} className="btn btn-sm btn-ghost">
                Logout
              </button>
            </>
          ) : loaded && !me ? (
            <>
              <Link href="/login" className="btn btn-outline btn-sm">
                Login
              </Link>
              <Link href="/signup" className="btn btn-sm">
                Join free
              </Link>
            </>
          ) : (
            <span className="nav-loading" aria-hidden="true" />
          )}

          <button
            type="button"
            className="mobile-toggle-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--ink)",
              padding: "7px 10px",
              borderRadius: "var(--radius)",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div
          className="mobile-drawer"
          style={{
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            padding: "16px 20px 24px",
            boxShadow: "var(--shadow)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  padding: "10px 14px",
                  borderRadius: "var(--radius)",
                  color: pathname === l.href ? "var(--brand)" : "var(--ink-soft)",
                  background: pathname === l.href ? "var(--brand-soft)" : "transparent",
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                {l.label}
              </Link>
            ))}

            <div style={{ borderTop: "1px solid var(--border)", margin: "10px 0", paddingTop: 12, display: "flex", gap: 8 }}>
              {loaded && me ? (
                <>
                  <Link
                    href="/account"
                    className="btn btn-outline btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    My account
                  </Link>
                  <button onClick={logout} className="btn btn-outline btn-sm" style={{ flex: 1 }}>
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => setMobileMenuOpen(false)}>
                    Login
                  </Link>
                  <Link href="/signup" className="btn btn-sm" style={{ flex: 1 }} onClick={() => setMobileMenuOpen(false)}>
                    Join free
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </header>
    </>
  );
}
