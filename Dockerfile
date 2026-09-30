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
# BE-17 gate (T-02): typecheck + server tests (bun test) + component tests
# (vitest). A red gate fails the image build, so the live release keeps
# serving. Tests run as NODE_ENV=test: under production they would exercise
# other code paths (React production build, prod-only DB checks). The image has
# no Node.js; `bun run` gives vitest and tsc Bun's node shim.
RUN NODE_ENV=test bun run check
# Vite inlines VITE_* at build time and Docker only passes declared build args
# to RUN (ANL-01): Umami website id and tracker URL; unset = tracking off.
ARG VITE_UMAMI_WEBSITE_ID
ARG VITE_UMAMI_SRC
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
# whole src/: server.ts imports src/api, src/db and src/server (later also
# src/seo, src/i18n, src/content); src/db carries migrate.ts and migrations/
COPY src ./src
COPY server.ts ./server.ts
EXPOSE 3000
# BE-14: migrations first, then the server. A failed migration exits 1, so the
# server never starts on a schema it does not expect and the new release
# never becomes ready. `exec` replaces the shell: bun is PID 1 again and
# SIGTERM reaches server.ts's graceful shutdown (BE-21). During the short
# migration step sh is PID 1.
CMD ["sh", "-c", "bun run src/db/migrate.ts && exec bun run server.ts"]
