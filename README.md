# Brand Promotion — Deals Platform

A fully operational deals website (like shopfluencer.in/browse-deals) with an admin panel, user accounts, in-site order & refund forms, WhatsApp/Telegram integration, and production-grade security.

## Features

**Public site**
- Landing page with hero, featured deals, stats, how-it-works
- `/browse` — live deal grid with search, category filter, sort, pagination
- `/stores` — direct links to Amazon, Flipkart, Myntra, Ajio, Meesho, Nykaa, Croma and leading D2C brands, with live campaign counts
- `/ads.txt` — served from `NEXT_PUBLIC_ADSENSE_CLIENT` for AdSense verification
- Deal detail page with discount badge and safe "Go to deal" redirect
- Google-Form-style order form (name, email, phone, address, size/color/qty, notes, coupon)
- Refund request form attached to each order
- Floating WhatsApp + Telegram buttons on every page
- Announcement banner, editable footer contact links

**Accounts**
- Signup/login with JWT (jose) in httpOnly, SameSite=Lax cookies
- **"Continue with Google" OAuth login** (auto-creates or links accounts by verified email)
- Passwords hashed with bcrypt (12 rounds)
- "My Orders" page with status tracking and refund requests

**Reviews with OCR** ⭐
- Verified buyers (confirmed/shipped/delivered orders only) can review a deal
- Star rating + written review + **screenshot upload**
- Screenshot text is **auto-extracted via OCR** (OCR.space free API) and stored
- Admin panel shows screenshot side-by-side with extracted OCR text, one-click **re-run OCR**
- Reviews go live on deal pages only after **admin approval** (average rating shown)
- One review per order; anonymous/guest reviews blocked

**Mediator portal** (`/mediator`, admin-approved mediator accounts)
- Submit campaigns for admin approval with a proposed **fixed commission amount**
- Scoped dashboard: only the mediator's own campaigns, approval status and rejection reasons
- Approved campaigns go live automatically; mediators can withdraw pending/rejected campaigns

**Admin panel** (`/admin`, owner-only)
- Dashboard stats (deals, users, orders, revenue, pending refunds)
- Deals manager: create/edit/delete with **image upload** (or image URL), stock, original vs sale price (auto discount %), categories, featured toggle
- Campaign approval queue: approve/reject mediator submissions and set the final fixed commission
- Users manager: promote/demote accounts and suspend mediators
- Orders manager: view, search, change status, CSV export
- Refunds manager: approve/reject with admin notes, CSV export
- Settings: site name, WhatsApp/Telegram links, announcement banner, hero text, support email
- Users list

**Security**
- bcrypt password hashing + constant-time compare
- JWT session in httpOnly cookie, 7-day expiry
- Middleware route protection (`/admin`, `/account`, `/api/admin/*`)
- Zod-style input validation & sanitization on every API route
- SQL injection safe (prepared statements via better-sqlite3)
- XSS safe (React escaping; no dangerouslySetInnerHTML on user data)
- Rate limiting on auth + write endpoints (in-memory sliding window)
- Security headers (HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy)
- Image upload restricted to PNG/JPG/WebP, max 5 MB, random filename, MIME sniffing
- Owner-only admin panel (first registered user or ADMIN_EMAIL match)
- CSRF-mitigating SameSite cookies + JSON-only APIs

## Quick start (local)

```bash
npm install
cp .env.example .env   # then set AUTH_SECRET and OCR_SPACE_API_KEY
npm run dev
```

Open http://localhost:3000

**Default owner login (created by seed):**
- URL: `/admin/login`
- Email: `admin@brandpromotion.in`
- Password: `ChangeMe@123`

> ⚠️ Change this password immediately after first login (Admin → Settings is not for passwords; use the DB reset script or re-seed with your own ADMIN_EMAIL). Better: set `ADMIN_EMAIL` in `.env` before first start, then sign up at `/signup` with that email to claim the owner account, then delete the seeded admin.

## Deploying to production (Vercel note)

SQLite file storage works on a single Node server (VPS/Railway/Render). For **Vercel**, swap `better-sqlite3` for Turso (libSQL) or Postgres; the data layer is isolated in `src/lib/db.ts` to make that swap easy.

Google Sheets is intentionally **not** used as the primary database. It has no
transactions or foreign keys, strict API rate limits, slow reads at this scale,
and cannot safely provide an auditable ledger for commissions and payments.
Use it only as an optional reporting/export mirror. For a managed database,
use Postgres (Neon/Supabase/Render) and keep proof images in object storage
(Cloudflare R2/S3).

On a VPS:
```bash
npm run build && npm start   # or pm2 start npm -- start
```
Set env vars: `AUTH_SECRET` (strong random), `NEXT_PUBLIC_SITE_NAME`, `OCR_SPACE_API_KEY`, and put behind HTTPS (Nginx/Caddy).

### Persistent storage (important on Render)

The SQLite database and uploaded screenshots live on local disk. Render's
ephemeral filesystem erases them on every deploy, so mount a persistent disk
(e.g. at `/var/data`) and set:

```
DATA_DIR=/var/data
```

This stores the database at `/var/data/app.db`, screenshots at
`/var/data/uploads`, and automatic backups at `/var/data/backups`.
`DATABASE_PATH` and `UPLOAD_DIR` can override those paths individually.
Without `DATA_DIR`, uploads are still served through `/api/files/:name` but
will not survive a deploy.

Proof screenshots (order, review and refund evidence) are private: they are
only served to their owner or an admin. Approved review screenshots are public
because they appear on deal pages.

### Google login setup (optional, 5 minutes)
1. Open https://console.cloud.google.com/apis/credentials → **Create credentials → OAuth client ID → Web application**
2. Add **Authorized redirect URI**: `http://localhost:3000/api/auth/google/callback` (add your production URL too)
3. Copy the Client ID and Client Secret into `.env`:
   ```
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```
4. Restart the server — "Continue with Google" appears automatically on login/signup
5. No keys set? The buttons hide themselves and the site falls back to email/password only

### OCR setup (review screenshots)
1. Get a **free API key** at https://ocr.space/ocrapi/freekey (the `helloworld` test key works for dev but is rate-limited)
2. Put it in `.env` as `OCR_SPACE_API_KEY=your_key`
3. Done — review screenshots are OCR'd automatically on submit; admins can re-run OCR from Admin → Reviews
4. If OCR fails (e.g. missing key), the review is still saved — nothing is lost

### Automatic backups

The server writes a full JSON backup (users, deals, orders, reviews, claims, refunds, settings, uploads rows) plus copies of uploaded screenshots:

- **On every start** and then every `AUTO_BACKUP_MINUTES` (default 5) when data changed.
- **On start**, if the database looks freshly seeded/wiped (new file, no orders), the newest automatic backup is restored, including images.
- Backups live in `BACKUP_DIR` (default `data/backups`) and keep the last 20 snapshots.

⚠️ Render's free tier erases the local disk on every deploy. To survive deploys, attach a **persistent disk** to the service and set `BACKUP_DIR=/var/data/backups` (or wherever the disk is mounted), then deploy once to create the first backup. Without a persistent disk, automation only protects restarts, not deploys.

Disable with `AUTO_RESTORE=0`; take a manual snapshot anytime from Admin → 💾 Backup.

## Project structure

```
src/
  app/                  # pages + API routes (App Router)
  components/           # shared UI (nav, footer, floating chat, deal card...)
  lib/                  # db, auth, session, validation, rate-limit, settings
  middleware.ts         # route protection
scripts/reset-db.js     # wipe & reseed database
data/app.db             # SQLite database (auto-created)
public/uploads/         # uploaded deal images
```
