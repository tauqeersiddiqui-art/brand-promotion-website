# Production Hardening Checklist

> **IMPORTANT**: Do not modify production until all items are reviewed and approved.

## ✓ COMPLETED ITEMS

- [x] **Infrastructure Audit** - All components verified
- [x] **Automated Backups** - Existing system at `/data/backups/`
- [x] **Persistent Volume** - `/data` mounted on Railway (1GB)
- [x] **Security Headers** - CSP, HSTS, X-Frame-Options configured in `next.config.ts`
- [x] **Rate Limiting** - In-memory + Redis fallback
- [x] **CSRF Protection** - Synchronizer tokens
- [x] **Authentication** - JWT sessions with bcrypt
- [x] **Database Safety** - WAL mode, foreign_keys enabled
- [x] **Data Integrity** - SQLite PRAGMA checks

## ⏳ PENDING ACTIONS (Requires Approval)

### Phase 1: Immediate Safety (Can proceed without approval)

- [ ] **Test backup decryption** - Run: `node scripts/restore-test.ts data/backups/backup-*.db`
- [ ] **Verify backup checksums** - Cross-check JSON manifest with file
- [ ] **Test restore procedure** - Restore to temp directory and validate
- [ ] **Download latest backup** - Manual export from admin panel for offline safety

### Phase 2: External Backup (NEEDS APPROVAL)

Before configuring R2/S3:
- [ ] Review Cloudflare R2 or AWS S3 setup
- [ ] Generate encryption key (64 hex characters):
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] Get R2 credentials or AWS keys
- [ ] Create backup bucket with no public access
- [ ] Store keys in Railway environment variables (REDIS_URL style)
- [ ] Test upload of single file
- [ ] Verify no data in backups exposes PII

**NEED YOUR APPROVAL to:**
- Set `ENCRYPTION_KEY` environment variable
- Configure `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, etc.
- Enable encrypted backup uploads

### Phase 3: Monitoring (NEEDS APPROVAL)

- [ ] Set up UptimeRobot account
- [ ] Add HTTP monitor for `/health` endpoint
- [ ] Configure alert contacts (email, SMS, or Telegram)
- [ ] Test alert delivery

### Phase 4: Security Enhancements (NEEDS APPROVAL)

- [ ] **HSTS Improvement**: Add `preload` directive for browser-level HTTPS enforcement
  ```http
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  ```
  ⚠️ Requires:
  - HTTPS working perfectly (no HTTP fallback needed)
  - HSTS preload submission to hstspreload.org

- [ ] **Content Security Policy**: Consider nonce-based CSP to remove `unsafe-inline`
  - Would require iframe sandboxing for AdSense
  - Requires testing to ensure no functionality breaks

- [ ] **Environment Variable Security**: 
  - Move `.env` values to Railway Secrets
  - Verify `.env` is in `.gitignore` (it should be)

### Phase 5: Documentation (No approval needed)

- [ ] Create backup rotation schedule
- [ ] Document incident response procedure
- [ ] Create disaster recovery runbook

## Risk Assessment Table

| Action | Risk Level | Requires Approval | Rollback |
|--------|------------|-------------------|----------|
| Test restore | Low | No | Delete temp dir |
| Configure R2 | Low-Med | Yes | Remove env vars |
| Enable encrypted backup | Low | Yes | Change env var |
| Add HSTS preload | Medium | Yes | Remove directive |
| Update CSP to nonce | Medium | Yes | Revert next.config.ts |

## Monthly Maintenance Schedule

| Task | Frequency | Owner |
|------|-----------|-------|
| Verify backups exist on disk | Weekly | Admin |
| Test decrypt latest backup | Monthly | Admin |
| Check R2 bucket usage | Monthly | Admin |
| Review uptime history | Monthly | Admin |
| Update AUTH_SECRET | Every 6 months | Admin |

## Emergency Procedures

### If database corruption suspected:
1. Download latest backup from admin panel
2. Stop the app temporarily via Railway
3. Restore backup to temp location
4. Run `node scripts/restore-test.ts <backup>`
5. If clean, replace `/data/app.db` with verified backup
6. Restart app

### If backup upload fails:
1. Check R2/AWS credentials in Railway variables
2. Verify bucket exists with correct permissions
3. Run manual backup: `node scripts/create-encrypted-backup.ts`
4. Check file in backup directory

### If monitoring alerts fire:
1. Check `/health` endpoint in browser
2. Run `railway logs --tail` for errors
3. Check for deployment in progress
4. If database error, follow emergency procedure

---

**Version**: 1.0  
**Last Updated**: 2026-11-08  
**Next Review**: 2026-12-08