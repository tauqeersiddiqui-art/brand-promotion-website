"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
};

// Shared across components so several forms on one page only cause one request.
// Keyed by pathname: login/logout navigate client-side (router.push) without a
// page reload, so a cached answer must not outlive the route it was fetched on.
let cached: Promise<SessionUser | null> | null = null;
let cachedFor: string | null = null;

function loadSessionUser(pathname: string): Promise<SessionUser | null> {
  if (!cached || cachedFor !== pathname) {
    cachedFor = pathname;
    cached = fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.user ? (d.user as SessionUser) : null))
      .catch(() => null);
  }
  return cached;
}

export function useSessionUser(): { user: SessionUser | null; loading: boolean } {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadSessionUser(pathname || "").then((u) => {
      if (!alive) return;
      setUser(u);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [pathname]);

  return { user, loading };
}
