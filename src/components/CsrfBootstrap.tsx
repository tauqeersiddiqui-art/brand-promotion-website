"use client";

import { useEffect } from "react";

/**
 * Ensures the CSRF cookie pair is present on every page.
 *
 * Mutating API routes require the double-submit token (`bp_csrf` cookie plus
 * the `x-csrf-token` header). Without this bootstrap a visitor landing directly
 * on a form page has no token, and every POST/PATCH/DELETE returns 403.
 * Mounting once in the root layout covers all routes, including after OAuth
 * callbacks and logout, which do not set the cookie themselves.
 */
export default function CsrfBootstrap() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const hasToken = document.cookie
      .split("; ")
      .some((c) => c.startsWith("bp_csrf_js=") && c.length > "bp_csrf_js=".length);
    if (hasToken) return;
    fetch("/api/csrf").catch(() => {});
  }, []);

  return null;
}