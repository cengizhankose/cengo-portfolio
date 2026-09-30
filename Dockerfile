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
# BE-20: build metadata for /ready, next to server.ts and outside dist/ so it
# is never served as a static file. GIT_COMMIT is optional
# (`--build-arg GIT_COMMIT=<sha>`); the runtime env GIT_COMMIT / SOURCE_COMMIT /
# COMMIT_SHA overrides it. Declared here so it does not invalidate the build cache.
ARG GIT_COMMIT=""
RUN printf '{"buildTime":"%s","commit":"%s"}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$GIT_COMMIT" > build-info.json

# Production stage: one Bun process serves static dist/ + /api/posts
FROM base AS production
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build-info.json ./build-info.json
# whole src/: server.ts imports src/api, src/db and src/server (later also src/seo, src/i18n, src/content)
COPY src ./src
COPY drizzle.config.ts ./drizzle.config.ts
COPY server.ts ./server.ts
EXPOSE 3000
# BE-21: exec form keeps bun as PID 1, so SIGTERM reaches server.ts's handler
# (graceful shutdown). If a shell wrapper is added (e.g. migrations first),
# it must end with `exec bun run server.ts`.
CMD ["bun", "run", "server.ts"]
