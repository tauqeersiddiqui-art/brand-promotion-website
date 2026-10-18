import { getConfig } from "./env";

type Bucket = { count: number; resetAt: number };

/**
 * Production-ready rate limiter with in-memory fallback and optional Redis support.
 * For single-instance deployments, in-memory is sufficient.
 * For multi-instance (Vercel, K8s, etc.), Redis backend is required.
 */

// In-memory buckets (per-process)
const memoryBuckets = new Map<string, Bucket>();

// Redis client (lazy-initialized)
let redis: InstanceType<typeof import("ioredis").default> | null = null;
let redisEnabled = false;

async function getRedis() {
  if (!redisEnabled) return null;
  if (redis) return redis;

  try {
    const { default: Redis } = await import("ioredis");
    const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
    if (!redisUrl) return null;

    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 2000)),
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redis.on("error", (err) => {
      console.warn("[RateLimit] Redis connection error:", err.message);
      redisEnabled = false;
    });

    await redis.connect();
    return redis;
  } catch {
    // ioredis not installed or connection failed - fall back to memory
    redisEnabled = false;
    return null;
  }
}

async function rateLimitRedis(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; retryAfter: number }> {
  const client = await getRedis();
  if (!client) return rateLimitMemory(key, limit, windowMs);

  const now = Date.now();
  const windowSec = Math.ceil(windowMs / 1000);
  const redisKey = `ratelimit:${key}`;

  try {
    // Use Redis sorted set for sliding window
    const pipeline = client.pipeline();
    pipeline.zremrangebyscore(redisKey, 0, now - windowMs);
    pipeline.zcard(redisKey);
    pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
    pipeline.expire(redisKey, windowSec + 1);
    const results = await pipeline.exec();

    const count = (results?.[1]?.[1] as number) || 0;

    if (count >= limit) {
      // Get oldest entry to calculate retry-after
      // @ts-expect-error - ioredis types don't match but runtime works
      const oldest = await client.zrange(redisKey, 0, 0, "WITHSCORES") as (string | number)[];
      const oldestTime = oldest.length > 1 ? Number(oldest[1]) : now;
      const retryAfter = Math.ceil((oldestTime + windowMs - now) / 1000);
      return { ok: false, retryAfter: Math.max(1, retryAfter) };
    }

    return { ok: true, retryAfter: 0 };
  } catch (err) {
    console.warn("[RateLimit] Redis error, falling back to memory:", err);
    redisEnabled = false;
    return rateLimitMemory(key, limit, windowMs);
  }
}

function rateLimitMemory(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Main rate limiter - uses Redis if available, otherwise in-memory.
 * Key format: "action:identifier" e.g., "login-ip:1.2.3.4", "order:user:123"
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; retryAfter: number }> {
  const config = getConfig();
  redisEnabled = !!process.env.REDIS_URL || !!process.env.UPSTASH_REDIS_REST_URL;

  if (redisEnabled) {
    return rateLimitRedis(key, limit, windowMs);
  }
  return rateLimitMemory(key, limit, windowMs);
}

// Periodic memory cleanup
const SWEEP_INTERVAL = 10 * 60 * 1000;
let lastSweep = Date.now();
export function maybeSweep() {
  const now = Date.now();
  if (now - lastSweep > SWEEP_INTERVAL) {
    lastSweep = now;
    for (const [key, bucket] of memoryBuckets) {
      if (bucket.resetAt <= now) memoryBuckets.delete(key);
    }
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "unknown";
}

/**
 * Predefined rate limit configs for common endpoints
 */
export const RATE_LIMITS = {
  // Auth
  login: { limit: 6, windowMs: 10 * 60 * 1000, keyPrefix: "login-email" },
  loginIp: { limit: 15, windowMs: 10 * 60 * 1000, keyPrefix: "login-ip" },
  signup: { limit: 4, windowMs: 60 * 60 * 1000, keyPrefix: "signup-ip" },
  passwordReset: { limit: 3, windowMs: 60 * 60 * 1000, keyPrefix: "pwd-reset" },

  // Orders & Claims
  orderSubmit: { limit: 10, windowMs: 60 * 60 * 1000, keyPrefix: "order" },
  reimbursementClaim: { limit: 10, windowMs: 60 * 60 * 1000, keyPrefix: "reimb" },

  // API general
  apiGeneral: { limit: 120, windowMs: 60 * 1000, keyPrefix: "api" },
  apiSearch: { limit: 30, windowMs: 60 * 1000, keyPrefix: "search" },

  // File upload
  upload: { limit: 20, windowMs: 60 * 60 * 1000, keyPrefix: "upload" },

  // Admin actions
  adminAction: { limit: 60, windowMs: 60 * 1000, keyPrefix: "admin" },
} as const;

/**
 * Apply a predefined rate limit with automatic key construction
 */
export async function applyRateLimit(
  type: keyof typeof RATE_LIMITS,
  identifier: string
): Promise<{ ok: boolean; retryAfter: number }> {
  const config = RATE_LIMITS[type];
  const key = `${config.keyPrefix}:${identifier}`;
  return rateLimit(key, config.limit, config.windowMs);
}