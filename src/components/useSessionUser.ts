"use client";

import { useEffect, useState } from "react";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
};

let cached: Promise<SessionUser | null> | null = null;

function loadSessionUser(): Promise<SessionUser | null> {
  if (!cached) {
    cached = fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => (d?.user ? (d.user as SessionUser) : null))
      .catch(() => null);
  }
  return cached;
}

export function useSessionUser(): { user: SessionUser | null; loading: boolean } {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadSessionUser().then((u) => {
      if (!alive) return;
      setUser(u);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { user, loading };
}
