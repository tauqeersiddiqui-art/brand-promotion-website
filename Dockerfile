# syntax=docker/dockerfile:1
FROM node:22-slim

WORKDIR /app

# Install build tools needed for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Install production dependencies only (skip dev deps to speed up builds)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --omit=dev && \
    npm rebuild better-sqlite3

# Copy source and build
COPY . .
ENV __NEXT_BUILD__=true
RUN npm run build

# Production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000

CMD ["npm", "start"]