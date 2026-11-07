# Infrastructure Audit — Brand Promotion Website

**Date:** 2026-11-07  
**Repository:** D:\Brand Promotion Website  
**Branch:** master → main (Railway)

---

## 1. Application Architecture

### Stack
| Layer | Technology |
|-------|------------|
| Framework | Next.js 15.5.29 (App Router) |
| Runtime | Node.js 22.x |
| Database | SQLite (better-sqlite3 ^12.11.1) |
| Storage | Local filesystem (`data/uploads/`) |
| Deployment | Railway (Dockerfile builder) |
| Auth | JWT via `jose` HS256 |
| OCR | OCR.space API |
| Cache | ioredis (optional, for distributed rate limiting) |

### Source Layout
```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # REST API routes (~45 endpoints)
│   ├── admin/             # Admin dashboard
│   ├── mediator/          # Mediator panel
│   ├── components/        # Shared React components
│   └── lib/               # Business logic
│       ├── db.ts          # SQLite setup + schema migrations
│       ├── auth.ts        # JWT session management
│       ├── storage.ts     # Local file path helpers
│       ├── upload.ts      # Image upload handler
│       ├── ocr.ts         # OCR.space integration
│       ├── backup.ts      # JSON export/import
│       ├── auto-backup.ts # Periodic backup scheduler
│       ├── telegram.ts    # Telegram bot posting
│       ├── settings.ts    # Site settings manager
│       ├── rate-limit.ts  # Redis/memory rate limiter
│       ├── csrf.ts        # CSRF token generation/validation
│       └── ...
```

---

## 2. Frontend & Backend Components

### Pages (Static SSR)
- **Public:** `/`, `/browse`, `/stores`, `/about`, `/help`, `/contact`, `/terms`, `/privacy`, `/claim`
- **Deal Detail:** `/deal/[id]` — product page with claim form
- **Auth:** `/login`, `/signup`, `/account`
- **Admin:** `/admin` (dashboard), `/admin/deals`, `/admin/orders`, `/admin/refunds`, `/admin/reimbursements`, `/admin/reviews`, `/admin/users`, `/admin/settings`, `/admin/backup`
- **Mediator:** `/mediator` (campaign creation + stats)
- **Track:** `/track` — order status lookup

### API Routes (45+ endpoints)
| Category | Endpoints |
|----------|-----------|
| Auth | `/api/auth/login`, `/api/auth/signup`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/google/*` |
| Deals | `/api/deals`, `/api/deals/[id]`, `/api/admin/deals/*`, `/api/mediator/deals/*`, `/api/admin/products/fetch` |
| Orders | `/api/orders`, `/api/orders/me`, `/api/admin/orders/*`, `/api/orders-search` |
| Refunds | `/api/refunds`, `/api/admin/refunds/*` |
| Reimbursements | `/api/reimbursements`, `/api/admin/reimbursements/*` |
| Reviews | `/api/reviews`, `/api/reviews/eligible`, `/api/admin/reviews/*` |
| Users | `/api/admin/users/*`, `/api/admin/stats`, `/api/admin/reset-password` |
| Files | `/api/files/[name]`, `/api/upload` |
| Infra | `/api/csrf`, `/api/track` |

### Key Services
- **OCR Engine:** External API call to `https://api.ocr.space/parse/image`
- **Telegram Bot:** Posts deal announcements to channel `@brandreviewer`
- **Backup Scheduler:** In-process `setInterval`, runs every 5 min (configurable)
- **Rate Limiter:** Redis-backed with in-memory fallback

---

## 3. Package Dependencies

### Production
- `next@^15.5.29` — Framework
- `react@^19.0.0`, `react-dom@^19.0.0` — UI
- `better-sqlite3@^12.11.1` — Native SQLite driver (requires build tools)
- `jose@^5.9.6` — JWT library
- `bcryptjs@^2.4.3` — Password hashing
- `ioredis@^6.0.0` — Redis client (optional, used when REDIS_URL is set)

### Development
- `typescript@5.8.2`
- Type packages for bcryptjs, better-sqlite3, node, react, react-dom

### Not Used
- No ORM, no database migration framework, no logging framework

---

## 4. Existing Database Implementation

### Database File
- **Path:** `data/app.db`
- **Size:** ~221 KB
- **Journals:** WAL mode enabled
- **Foreign Keys:** ON by default

### Schema (10 tables, from `src/lib/db.ts:SCHEMA_DDL`)

| Table | Records | Purpose |
|-------|---------|---------|
| `users` | 1 | Accounts (admin, user, mediator) |
| `deals` | 8 | Campaigns/deals |
| `orders` | 0 | Customer orders |
| `reimbursements` | 0 | Refund claims |
| `refunds` | 0 | General refund requests |
| `reviews` | 0 | Review submissions |
| `settings` | 9 | Site configuration (key-value) |
| `click_tracking` | 0 | Click attribution |
| `uploads` | 0 | Uploaded screenshot metadata |
| `device_fingerprints` | 0 | Fraud prevention |

### Indexes (22 total)
- Unique indexes on: `users.mediator_code`, `orders.order_code`, `orders.external_order_id`, `deals.product_code`, `click_tracking.click_id`, `uploads.url`, `device_fingerprints.fingerprint`
- Performance indexes on: orders(user_id, deal_id, phone, external_order_id), reimbursements(order_id, user_id), reviews(deal_id, user_id), click_tracking(deal_id, ip)

### Schema Migrations
- Handled inline in `db.ts` via `ALTER TABLE ADD COLUMN IF NOT EXISTS` checks
- CHECK constraint rebuilds done by `reconcileCheckConstraints()` (table rename swap)
- Auto-seeds settings and admin account on empty DB via `autoSeed()`

---

## 5. SQLite Database Location

| Environment | Path | Persistence |
|-------------|------|-------------|
| Docker (Railway) | `/data/app.db` | ⚠️ Only with Railway volume mounted at `/data` |
| Dev (local) | `data/app.db` | ✅ Persistent on disk |
| Backup dir | `data/backups/` | Auto-generated JSON backups |
| Uploads | `data/uploads/` | 9 test screenshots |

---

## 6. Authentication & Session Management

- **Mechanism:** HMAC-SHA256 JWT signed with `AUTH_SECRET`
- **Cookie:** `bp_session` — httpOnly, secure (prod only), sameSite=lax, 7-day maxAge
- **Password Hash:** bcrypt cost factor 12
- **Roles:** `user`, `admin`, `mediator`
- **Google OAuth:** Via `google-auth.ts` (uses Google Client ID/Secret)
- **Admin Owner:** Created from `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars
- **CSRF:** 64-char hex tokens in double cookies (`bp_csrf` httpOnly + `bp_csrf_js` non-httpOnly); validated server-side on mutating requests

---

## 7. Upload Mechanism

- **Handler:** `src/app/api/upload/route.ts`
- **Storage:** Local filesystem at `$DATA_DIR/uploads/`
- **Naming:** `${timestamp}-${randomHex}.${ext}` (random hex prevents guessing)
- **Validation:**
  - Max 5 MB
  - Magic-byte signature sniffing (PNG/JPG/WebP/GIF)
  - Content-Type rejected if not image
- **Serving:** `/api/files/[name]` route reads from disk
- **Legacy:** Old `/uploads/[name]` paths rewritten through middleware to `/api/files/[name]`
- **Total uploads:** 9 files (~3 KB each)

---

## 8. Environment Variables

### Required
| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | JWT signing key (≥32 chars, random) |
| `NEXT_PUBLIC_BASE_URL` | Public site URL |
| `NODE_ENV` | `production` or `development` |

### Optional
| Variable | Purpose |
|----------|---------|
| `OCR_SPACE_API_KEY` | OCR.space API key |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth |
| `ADMIN_EMAIL/PASSWORD` | Initial admin account |
| `TELEGRAM_BOT_TOKEN/CHAT_ID` | Telegram campaign posts |
| `NEXT_PUBLIC_ADSENSE_*` | AdSense ad slots |
| `DATA_DIR` | Override SQLite + uploads directory |
| `DATABASE_PATH` | Direct path to SQLite file |
| `UPLOAD_DIR` | Override uploads directory |
| `BACKUP_DIR` | Override backup directory |
| `AUTO_BACKUP_MINUTES` | Backup interval (default 5) |
| `REDIS_URL` / `UPSTASH_REDIS_REST_URL` | Distributed rate limiting |

### AdSense (disabled in current `.env`)
- Slot keys: home, stores, deal, default
- Currently all blank → ads hidden

---

## 9. Railway Configuration

### Current (`railway.toml`)
```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "npm start"
healthcheckPath = "/"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[[volume]]
mount = "/data"
diskSize = 1024
```

### Dockerfile
- Base: `node:22-slim`
- Installs build tools: `python3 make g++ git sqlite3`
- Runs `npm rebuild better-sqlite3` after install (native module compilation)
- Sets `ENV DATA_DIR=/data` (must match volume mount)
- Builds Next.js production bundle at build time
- Entry: `npm start` (Next.js production server)

### Known Issues
1. Volume was recently added; need to confirm it's attached in Railway UI
2. Custom Start Command needs verification shows `npm start` (not a stale value)
3. No health check endpoint dedicated — relies on `/` returning 200

---

## 10. GitHub Deployment

- **Repo:** `tauqeersiddiqui-art/brand-promotion-website`
- **Branch watched by Railway:** `main`
- **Auto-deploy:** Triggered on push to `main`
- **No CI/CD pipeline** — Railway builds directly from source
- **Git hooks:** None configured

---

## 11. API Endpoints Summary

See section 2 above. Total: ~45 API routes across auth, deals, orders, refunds, reimbursements, reviews, users, and infrastructure.

---

## 12. Background Processes

| Process | Implementation | Frequency |
|---------|---------------|-----------|
| Auto-backup | `initAutoBackup()` in `auto-backup.ts` | Every 5 minutes (configurable) |
| Rate limit sweep | `maybeSweep()` called in request handlers | Every 10 minutes |
| Startup seed | `autoSeed()` in `db.ts` | On every process start |
| No cron jobs | None currently | — |

---

## 13. Existing Backup System

### Full Backup (`src/lib/backup.ts`)
- Exports all 10 tables to single JSON file
- Includes foreign-key-aware restore (`restoreBackupTables()`)
- Accepts full backup JSON OR just deals array
- Admin panel exposes download (`/api/admin/backup GET`) and restore (`POST`)

### Auto-Backup (`src/lib/auto-backup.ts`)
- Runs every 5 minutes (env: `AUTO_BACKUP_MINUTES`)
- Stores JSON in `data/backups/auto-YYYY-MM-DDTHH-MM-SS.json`
- Keeps last 20 backups
- Copy of uploaded screenshots to `data/backups/uploads/`
- Auto-restores on boot if DB appears freshly seeded and backup has useful data
- Triggered immediately after important mutations via `writeAutoBackupSafe()`

### Manual Backup Endpoint
- `GET /api/admin/backup` — returns JSON attachment with `Content-Disposition` header
- `POST /api/admin/backup` — accepts JSON body, validates, restores
- Protected by `/admin/backup` page requiring admin auth

### Backup Coverage
- Tables: users, deals, orders, reimbursements, refunds, reviews, settings, click_tracking, uploads, device_fingerprints
- Files: `data/uploads/*.png` copied alongside

---

## Database Record Snapshot

| Table | Count | Notes |
|-------|-------|-------|
| `users` | 1 | Admin owner only |
| `deals` | 8 | All active, 6x "100% Cashback", 2x percentage cashback |
| `orders` | 0 | None yet |
| `reimbursements` | 0 | — |
| `refunds` | 0 | — |
| `reviews` | 0 | — |
| `settings` | 9 | Default + modified |
| `click_tracking` | 0 | — |
| `uploads` | 0 | Images stored on disk, 9 files exist |
| `device_fingerprints` | 0 | — |

---

*Audit complete. Original database preserved at `data/backup-pre-migration-*.db`.*
