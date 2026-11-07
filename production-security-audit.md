# Production Security Audit — Brand Promotion Website

**Date:** 2026-11-07

---

## Authentication & Session Security

| Control | Current State | Rating |
|---------|--------------|--------|
| Password hashing | bcrypt cost 12 | ✅ Good |
| JWT signing | HS256 with AUTH_SECRET (≥32 chars validated) | ✅ Adequate |
| Session cookie flags | httpOnly ✓, secure(prod) ✓, sameSite=lax ✓ | ✅ Good |
| Session expiry | 7 days fixed maxAge | ⚠️ No server-side session revocation |
| Token refresh | ❌ None — static JWT, no rotation | 🔴 Needs improvement |
| MFA / 2FA | ❌ Not implemented | 🔴 Gap (admin only critical) |
| Login rate limiting | 6 attempts per email, 15 per IP per 10 min | ✅ Good |
| Password reset rate limit | 3 per hour | ✅ Good |
| Google OAuth flow | Standard PKCE-ish redirect flow | ⚠️ Verify state param is used |
| Cookie domain scope | `/` path — covers all subpaths | ✅ OK |

**Recommendation:** Add a short-lived access token + long-lived refresh token pattern for server-side session invalidation support.

---

## CSRF Protection

| Control | Current State | Rating |
|---------|--------------|--------|
| Token generation | Crypto-random 64-char hex | ✅ Good |
| Double-submit cookie + header | Cookie (httpOnly) + Header matched server-side | ✅ Standard pattern |
| Timing-safe comparison | Custom loop comparator implemented | ✅ Correct |
| Coverage | Applied to POST/PATCH/PUT/DELETE on most API routes | ⚠️ Some routes may skip validation |
| Excluded paths | Google callback, logout, upload, track, reviews/eligible | ✅ Reasonable |

**Gap found:** The middleware applies auth checks but CSRF is handled per-route. Some admin endpoints define their own `validateRequest()` — confirm all do.

---

## Authorization & Access Control

| Endpoint Pattern | Auth Check | Role Check | Status |
|-----------------|-----------|------------|--------|
| `/api/auth/*` | N/A (open) | N/A | ✅ |
| `/api/admin/*` | Session verified in handler | `requireAdmin()` checks role===admin | ✅ |
| `/api/mediator/*` | Session verified in handler | `requireMediator()` checks role===mediator | ✅ |
| `/api/orders/*` (public) | None | None | ✅ (intentional) |
| `/api/refunds`, `/api/reviews` | Handled inside route | Checks `session.userId` against resource owner | ✅ |
| `/api/upload` | Session required via middleware | No explicit ownership check on upload | ⚠️ Any logged-in user can upload |

**Gap:** File uploads accept any authenticated session — no per-user quota or ownership tracking at upload time (ownership tracked only after DB insert).

---

## Input Validation & Sanitization

| Vector | Current Control | Rating |
|--------|----------------|--------|
| SQL Injection | parameterized queries throughout (better-sqlite3 prepared statements) | ✅ Immune |
| XSS (server) | `sanitizeHtml()` for rich text fields | ✅ Good |
| XSS (client-rendered React) | JSX auto-escapes; sanitizeHtml feeds into dangerouslySetInnerHTML — **check usage** | ⚠️ Verify only sanitized data reaches innerHTML |
| File uploads | Magic-byte signature check, MIME validation, extension whitelist, 5 MB cap | ✅ Strong |
| Path traversal in file reads | `path.dirname(target) !== UPLOAD_DIR` guard | ✅ Hardened |
| Rate limiting | Predefined buckets per action type; Redis-capable | ✅ Good |
| Numeric overflow | Bounds checked with `num()` helper (min/max/clamp) | ✅ Good |

---

## Data Exposure Risks

| Risk | Detail |
|------|--------|
| Screenshot URLs | `/api/files/[name]` serves local files — currently no ownership check in route |
| Order data leak | `external_order_id` stored in DB but also shown in order page — not a sensitive issue since it's customer-provided |
| Device fingerprint | Stored per order for fraud detection — consider privacy disclosure in TOS |
| OCR text exposure | OCR results stored in DB; ensure not returned in unauthenticated APIs |

---

## Infrastructure Security Headers

Headers applied via `next.config.ts`:
- `Content-Security-Policy` — default-src self; AdSense exceptions present
- `X-Content-Type-Options: nosniff` ✅
- `X-Frame-Options: DENY` ✅
- `Referrer-Policy: strict-origin-when-cross-origin` ✅
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` ✅
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` ✅
- `Cross-Origin-Opener-Policy: same-origin` ✅
- `Cross-Origin-Resource-Policy: same-origin` ✅

---

## Secrets Management

| Secret | Storage | Risk |
|--------|---------|------|
| `AUTH_SECRET` | Railway env var | ✅ Properly isolated |
| `OCR_SPACE_API_KEY` | Railway env var | ✅ Properly isolated |
| `GOOGLE_CLIENT_ID/SECRET` | Railway env var | ✅ Properly isolated |
| `ADMIN_PASSWORD` | Railway env var | ✅ But set during first boot — consider rotating post-initial-setup |
| `TELEGRAM_BOT_TOKEN` | Railway env var | ✅ |
| SQLite DB path | Mounted volume `/data/app.db` | ✅ |
| Uploaded screenshots | Volume `/data/uploads/` | ✅ |

**Risk:** `.env.example` in repo is safe (all values commented/blanks). No `.env` committed (gitignored by Dockerfile convention).

---

## Known Gaps & Remediation Priorities

| Priority | Issue | Fix |
|----------|-------|-----|
| 🔴 High | No session revocation (JWT is static) | Add refresh tokens or JWKS-based rotation |
| 🔴 High | File upload endpoint has no ownership check | Validate uploading user owns the associated order/review |
| 🟡 Medium | No HTTP-only flag on `bp_csrf_js` (by design for JS read) | Accept trade-off — verify non-HttpOnly cookie is never sent to CDN |
| 🟡 Medium | No audit log table | Add events table for all admin actions (login, approve, delete) |
| 🟢 Low | Rate limits are per-process memory only | Acceptable for single Railway instance; add Redis when scaling |

---

*Audit complete. Original database preserved at `data/backup-pre-migration-*.db`.*
