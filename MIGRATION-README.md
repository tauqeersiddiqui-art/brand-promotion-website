# Database Migration Documentation

## Overview

This document describes the SQLite to PostgreSQL migration process for Brand Promotion Website.

## Prerequisites

### 1. Railway Setup
- PostgreSQL addon added to your Railway project
- R2 bucket created (or use Railway's storage buckets)
- Environment variables configured in Railway dashboard:
  - `DATABASE_URL` - PostgreSQL connection string
  - `R2_ACCESS_KEY_ID` - Cloudflare R2 access key
  - `R2_SECRET_ACCESS_KEY` - Cloudflare R2 secret key
  - `R2_BUCKET_NAME` - Bucket name
  - `R2_ENDPOINT` - e.g., `https://<account-id>.r2.cloudflarestorage.com`

### 2. Local Development
Set environment variables in `.env.local`:
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/brand_promotion
R2_ACCESS_KEY_ID=your-key-id
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=brand-promotion-uploads
R2_ENDPOINT=https://account-id.r2.cloudflarestorage.com
```

## Migration Process

### Step 1: Take a Backup
Before migrating, create a backup of your current SQLite database:

```bash
node scripts/backup-database.js --backup
```

### Step 2: Create PostgreSQL Schema
Manually create the tables in PostgreSQL first, or run the migration script which handles this:

```bash
# Test connection first
node -e "const pg = require('pg'); const client = new pg.Pool({connectionString: process.env.DATABASE_URL}); client.query('SELECT 1').then(() => console.log('Connected')).catch(e => console.error(e));"
```

### Step 3: Run Migration
Execute the migration script in dry-run mode first:

```bash
DATABASE_URL=postgresql://... node scripts/migrate-sqlite-to-postgres.ts --dry-run --verbose
```

If output looks correct, run the actual migration:

```bash
DATABASE_URL=postgresql://... node scripts/migrate-sqlite-to-postgres.ts
```

### Step 4: Verify Migration
Run the verification script to compare row counts:

```bash
DATABASE_URL=postgresql://... node scripts/verify-database-migration.ts
```

### Step 5: Migrate Uploads (Optional)
If using R2, migrate existing uploads with a one-time script (run this only once):

```bash
# Create a one-time migration script for existing uploads
node -e "
const { migrateAllUploadsToR2 } = require('./src/lib/storage.ts');
migrateAllUploadsToR2().then(result => console.log('Migration result:', result));
"
```

### Step 6: Update Dockerfile
The Dockerfile has been updated to:
- Remove build tools (python3, make, g++) - no longer needed for `pg` driver
- Keep `better-sqlite3` for local file storage migration period
- Add `@aws-sdk/client-s3` for R2 support
- Add `pg` for PostgreSQL

### Step 7: Redeploy
Push changes to Railway. The application will:
- Use PostgreSQL if `DATABASE_URL` is set
- Fall back to SQLite if `DATABASE_URL` is not set
- Use R2 for uploads if configured, otherwise local storage

## Rollback Strategy

If migration fails:
1. The original SQLite database is preserved at `data/app.db`
2. Backups are stored in `data/backups/`
3. Delete the PostgreSQL instance and re-deploy to roll back

## Post-Migration Tasks

1. **Update cron jobs**: Set up PostgreSQL backup cron
2. **Delete SQLite files**: After confirming everything works, delete `data/app.db`
3. **Update monitoring**: Point to new PostgreSQL/R2 endpoints
4. **Update docs**: Document new infrastructure

## Troubleshooting

### "DATABASE_URL not set"
Set the environment variable in Railway dashboard or `.env.local` for local dev.

### "relation does not exist"
Run the migration script again - it creates tables idempotently.

### "foreign key violation"
Check that tables are migrated in correct order (users → deals → orders → etc.)

### "S3 access denied"
Verify R2 credentials and endpoint in Railway environment variables.