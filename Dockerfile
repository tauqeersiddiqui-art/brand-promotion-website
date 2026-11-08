# syntax=docker/dockerfile:1

# Build stage: needs the compiler toolchain for better-sqlite3 and the dev
# dependencies for `next build`.
FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ sqlite3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && npm rebuild better-sqlite3

# .dockerignore keeps .env, client_secret_*.json, data/ and node_modules out.
COPY . .
ENV NODE_ENV=production
ENV __NEXT_BUILD__=true
# Ship production dependencies only: dev deps (TypeScript, ESLint, tsx) were
# previously baked into the runtime image.
RUN npm run build && npm prune --omit=dev

# Runtime stage: no compilers, no dev dependencies, no source tree.
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/scripts/seed.js ./scripts/seed.js

# The Railway volume is mounted at /data and owned by root, so the process stays
# root to keep uploads, the SQLite WAL and backups writable.
EXPOSE 3000

# Seed/migrate the schema (idempotent) before starting; a fresh volume would
# otherwise boot with "no such table: deals".
CMD ["sh", "-c", "node scripts/seed.js && npm start"]
