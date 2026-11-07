#!/usr/bin/env node
/**
 * Health Check Script for Production
 *
 * Returns JSON with health status of database, storage, and key services.
 * Used by Railway healthcheck or external monitoring.
 *
 * Usage: node scripts/health-check.js
 */

const http = require('http');

const HEALTHY = 200;
const UNHEALTHY = 503;

function writeStatus(status, data) {
  const response = JSON.stringify({ status, ...data });
  console.log(response);
  process.exit(status === HEALTHY ? 0 : 1);
}

async function checkDatabase() {
  try {
    const Database = require('better-sqlite3');
    const dbPath = process.env.DATABASE_PATH || require('path').join(process.cwd(), 'data', 'app.db');
    const db = new Database(dbPath, { readonly: true });

    const count = db.prepare('SELECT COUNT(*) as c FROM settings').get().c;
    db.close();

    return { ok: true, tables_accessible: true, settings_count: count };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkStorage() {
  const fs = require('fs');
  const path = require('path');
  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');

  try {
    if (!fs.existsSync(uploadDir)) {
      return { ok: true, local_uploads: 'empty' };
    }
    const files = fs.readdirSync(uploadDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
    return { ok: true, local_uploads: files.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkR2() {
  if (!process.env.R2_ACCESS_KEY_ID) {
    return { ok: true, r2: 'not_configured' };
  }

  try {
    // Lazy load S3 client to avoid requiring AWS SDK in non-R2 environments
    const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3') || {};
    if (!S3Client) {
      return { ok: true, r2: 'sdk_not_available' };
    }

    const client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    await client.send(new ListBucketsCommand({}));
    return { ok: true, r2: 'connected' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkRedis() {
  if (!process.env.REDIS_URL && !process.env.UPSTASH_REDIS_REST_URL) {
    return { ok: true, redis: 'not_configured' };
  }

  try {
    const Redis = require('ioredis').default;
    const client = new Redis(process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });

    await client.ping();
    client.disconnect();
    return { ok: true, redis: 'connected' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  const results = await Promise.all([
    checkDatabase().then(r => ({ db: r })),
    checkStorage().then(r => ({ storage: r })),
    checkR2().then(r => ({ r2: r })),
    checkRedis().then(r => ({ redis: r })),
  ]);

  const flattened = Object.assign({}, ...results);
  const allOk = Object.values(flattened).every(r => r.ok !== false);

  writeStatus(allOk ? HEALTHY : UNHEALTHY, {
    timestamp: new Date().toISOString(),
    ...flattened,
  });
}

main().catch(e => {
  writeStatus(UNHEALTHY, { error: e.message });
});