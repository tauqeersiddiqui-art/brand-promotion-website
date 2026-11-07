# Migration Plan — Brand Promotion Website: SQLite → PostgreSQL

**Date:** 2026-11-07  
**Current state:** Single Railway instance, SQLite (`better-sqlite3`), local file storage  
**Target state:** Railway + PostgreSQL managed service, S3-compatible object storage, persistent volumes

---

## Phase Overview

| Phase | Scope | Effort | Risk |
|-------|-------|--------|------|
| 1. Backup & Audit | ✅ Complete | Done | Low |
| 2. Railway Infrastructure | Deploy PG, R2 bucket, configure env vars | Medium | Low |
| 3. SQLite → PostgreSQL Migration | Script + validate + cut over | Medium | Medium |
| 4. Cloud File Storage (R2) | Upload existing files, update DB references | Medium | Medium |
| 5. Backup & DR Strategy | Automated pg_dump + off-site copy | Low | Low |
| 6. Security Hardening | Fix identified gaps | Low | Low |
| 7. Custom Domain & DNS | Configure Railway domain + SSL | Low | Low |
| 8. Performance & Reliability | Indexes, health endpoint, connection pooling | Low | Low |
| 9. GitHub + Auto Deploy | Branch protection, deploy hooks | Low | Low |
| 10. Business Testing | Full workflow regression test | Medium | Low |
| 11. Final Validation | End-to-end sign-off | Low | Low |

---

## Phase 2: Railway Infrastructure Setup

### Services to Create in Railway Project
1. **PostgreSQL** — Railway built-in Postgres service
2. **Storage Bucket (S3-compatible)** — Cloudflare R2 or Railway built-in bucket

### Environment Variables Needed on Railway
```
DATABASE_URL        # From Railway Postgres service
R2_ACCESS_KEY_ID    # From R2 token
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_ENDPOINT         # e.g., https://<account-id>.r2.cloudflarestorage.com
NEXT_PUBLIC_BASE_URL
AUTH_SECRET
OCR_SPACE_API_KEY   # If not already set
```

### Dockerfile Changes
- Remove `python3 make g++` build tools (not needed for PG driver)
- Replace `better-sqlite3` with `pg` (Node.js PostgreSQL client)
- Keep node:22-slim base

---

## Phase 3: SQLite → PostgreSQL Migration

### Approach
Use a dedicated migration script (`scripts/migrate-sqlite-to-postgres.ts`) that:
1. Connects to SQLite (readonly) and exports all rows as JSON
2. Connects to PostgreSQL and creates tables matching the schema
3. Inserts data with proper type coercion
4. Compares record counts between source and target
5. Verifies foreign key integrity in target

### Type Mapping
| SQLite | PostgreSQL | Conversion |
|--------|------------|-----------|
| INTEGER (autoincrement) | SERIAL (or BIGSERIAL) | Skip id on insert, let PG sequence handle |
| INTEGER (flags) | BOOLEAN | `CASE WHEN x = 1 THEN true ELSE false END` |
| REAL | NUMERIC(10,2) or DOUBLE PRECISION | Direct cast |
| TEXT (timestamps) | TIMESTAMPTZ | `TO_TIMESTAMP(text_col, 'YYYY-MM-DD HH24:MI:SS')` |
| TEXT | TEXT | Direct |

### Script Features
- Dry-run mode (`--dry-run`): shows what would happen without writing
- Idempotent: safe to rerun (truncates PG table first if exists)
- Logging: every step written to stdout
- Rollback: keep SQLite original untouched until verification passes

---

## Phase 4: Cloud File Storage

### Provider: Cloudflare R2 (recommended)
- Free tier: 10 GB storage, 10M reads/month, 1M writes/month
- No egress fees — cheaper than AWS S3 for high-read workloads
- S3-compatible API

### Implementation
- New module: `src/lib/storage/r2.ts` wrapping `@aws-sdk/client-s3`
- Upload function returns signed URL (private bucket, presigned 7-day URLs)
- Existing `data/uploads/` files uploaded to R2 during migration
- DB `url` columns updated to point to R2 URLs

---

## Phase 5: Backup & DR

| Level | Method | Frequency | Retention |
|-------|--------|-----------|-----------|
| PostgreSQL-native | Railway automatic backups | Daily | 7 days |
| Manual dump | `pg_dump` scheduled task | Daily | 30 days |
| Application-layer | Export to JSON (existing system) | Every 5 min | Keep last 20 |
| Off-site copy | Upload pg_dump to R2 | Daily | 90 days |

---

## Phase 6: Security Hardening

See `production-security-audit.md` for detailed findings.

Key fixes:
1. Add refresh-token based session rotation
2. Enforce upload ownership validation
3. Add admin audit log table
4. Harden CSP (remove unsafe-inline if possible)
5. Add request logging middleware

---

## Phase 7: Custom Domain

### Requirements from User
- Domain name (e.g., `brandpromotion.in` or `getcashback.in`)
- DNS provider preference (Cloudflare recommended)

### Steps
1. Purchase/register domain
2. Point NS records to Cloudflare
3. Add A/CNAME records for Railway
4. Enable SSL in Railway dashboard
5. Set `NEXT_PUBLIC_BASE_URL` to new domain

---

## Rollback Strategy

At every phase gate:
1. Keep `data/backup-pre-migration-*.db` intact
2. Take a fresh SQLite backup before switching traffic
3. Run smoke tests on new stack while old remains live
4. Cutover: update `DATA_DIR` env to PG URL, redeploy, verify

---

*Plan created as baseline. Proceeding to Phase 2 implementation upon approval.*
