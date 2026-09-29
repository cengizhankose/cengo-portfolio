# Multi-stage Dockerfile for Vite + Bun React app + Hono API (single container)
FROM oven/bun:1.3.3-alpine AS base
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies once and reuse
RUN bun install --frozen-lockfile

# Development target (optional)
FROM base AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["bun", "run", "dev"]

# Build target
FROM base AS builder
ENV NODE_ENV=production
COPY . .
RUN bun run build

# Production stage: one Bun process serves static dist/ + /api/posts
FROM base AS production
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY src/api ./src/api
COPY src/db ./src/db
COPY drizzle.config.ts ./drizzle.config.ts
COPY server.ts ./server.ts
EXPOSE 3000
CMD ["bun", "run", "server.ts"]
