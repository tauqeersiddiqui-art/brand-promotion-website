/**
 * Health check endpoint for Railway and other platforms
 *
 * This module provides a health check function that can be used
 * both as a script and as part of the Next.js server.
 */

const http = require('http');
const https = require('https');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads');
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'app.db');

/**
 * Check database connectivity
 */
function checkDatabase() {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const count = db.prepare('SELECT COUNT(*) as c FROM settings').get().c;
    db.close();
    return { db: { status: 'healthy', settings_count: count } };
  } catch (e) {
    return { db: { status: 'unhealthy', error: e.message } };
  }
}

/**
 * Check local storage availability
 */
function checkStorage() {
  try {
    if (!fs.existsSync(UPLOAD_DIR)) {
      return { storage: { status: 'healthy', uploads: 0 } };
    }
    const files = fs.readdirSync(UPLOAD_DIR).filter(f => /\.(png|jpg|webp|gif)$/i.test(f));
    return { storage: { status: 'healthy', uploads: files.length } };
  } catch (e) {
    return { storage: { status: 'unhealthy', error: e.message } };
  }
}

/**
 * Check R2/S3 connectivity
 */
async function checkR2() {
  if (!process.env.R2_ACCESS_KEY_ID) {
    return { r2: { status: 'not_configured' } };
  }

  try {
    // Use the existing S3 client from the application
    const { getS3Client } = await import('./src/lib/storage/s3.js');
    const client = getS3Client();

    if (!client) {
      return { r2: { status: 'unhealthy', error: 'S3 client not initialized' } };
    }

    // Try to list bucket (will fail if empty, but connection works)
    const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
    await client.send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      MaxKeys: 1,
    }));

    return { r2: { status: 'healthy' } };
  } catch (e) {
    return { r2: { status: 'unhealthy', error: e.message } };
  }
}

/**
 * Main health check function
 */
async function healthCheck() {
  const results = {
    timestamp: new Date().toISOString(),
    node_version: process.version,
    environment: process.env.NODE_ENV || 'development',
  };

  // Synchronous checks first
  Object.assign(results, checkDatabase());
  Object.assign(results, checkStorage());

  // Async checks
  if (process.env.R2_ACCESS_KEY_ID) {
    Object.assign(results, await checkR2());
  }

  // Determine overall status
  const overall = Object.values(results).every(v =>
    typeof v === 'object' && (v.status === 'healthy' || !v.status)
  );

  return {
    status: overall ? 'healthy' : 'unhealthy',
    checks: results,
  };
}

// Export for use in middleware or server
module.exports = { healthCheck, checkDatabase, checkStorage, checkR2 };