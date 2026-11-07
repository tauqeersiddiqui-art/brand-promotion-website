# syntax=docker/dockerfile:1
FROM node:22-slim

WORKDIR /app

# Install runtime dependencies (PostgreSQL client libs, sqlite3 for backup tool)
# Note: better-sqlite3 is compiled at build time; pg client needs no build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install all dependencies
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && \
    npm rebuild better-sqlite3

# Copy source and build
COPY . .
ENV NODE_ENV=production
ENV __NEXT_BUILD__=true
RUN npm run build

# Production environment
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000

# Seed the database schema (idempotent: CREATE TABLE IF NOT EXISTS) and
# sync the owner account before starting the app. Without this, a fresh
# Railway volume boots with an empty database -> "no such table: deals".
CMD ["sh", "-c", "node scripts/seed.js && npm start"]