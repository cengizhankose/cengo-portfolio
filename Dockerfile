# Multi-stage Dockerfile for Vite + Bun React app + Hono API (single container)
#
# One Bun version, pinned by tag and digest (BE-27 / SEC-26). Every stage starts
# from ${BUN_IMAGE}. Keep the version equal to package.json "packageManager" and
# to the exact "@types/bun" devDependency: the builder's test gate runs on this
# Bun, and @types/bun makes `tsc` flag APIs this Bun lacks. Bump all three
# together; Dependabot proposes the image digest (.github/dependabot.yml).
# tests/server/docker and tests/server/ops/build-gate.test.ts enforce the match.
# Digest = the multi-arch index of the tag (linux/amd64 and linux/arm64).
ARG BUN_IMAGE=oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0

# All dependencies (dev included): the development target and the builder
FROM ${BUN_IMAGE} AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Development target (optional)
FROM deps AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["bun", "run", "dev"]

# Build target
FROM deps AS builder
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
# PERF-25 / T-09: CF_WEB_ANALYTICS=off (the same Out Plane env value the server
# reads at runtime) also removes the Cloudflare Web Analytics entry from the
# prerendered privacy notice. Empty or unset = the entry stays (default on).
ARG CF_WEB_ANALYTICS
ENV VITE_CF_WEB_ANALYTICS=${CF_WEB_ANALYTICS}
RUN bun run build
# BE-20: build metadata for /ready, next to server.ts and outside dist/ so it
# is never served as a static file. GIT_COMMIT is optional
# (`--build-arg GIT_COMMIT=<sha>`); the runtime env GIT_COMMIT / SOURCE_COMMIT /
# COMMIT_SHA overrides it. Declared here so it does not invalidate the build cache.
ARG GIT_COMMIT=""
RUN printf '{"buildTime":"%s","commit":"%s"}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$GIT_COMMIT" > build-info.json

# Runtime dependencies only (PERF-24 / SEC-13 / BE-15): package.json
# "dependencies" is hono, drizzle-orm, postgres and zod; React, Vite, mermaid
# and the rest are bundled into dist/ (client and dist/server) at build time.
# --omit=peer: bun otherwise installs drizzle-orm's optional peers that are
# also devDependencies here (@electric-sql/pglite 26 MB, bun-types, @types/node).
FROM ${BUN_IMAGE} AS deps-prod
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production --omit=peer

# Production stage (must stay the LAST stage: Out Plane builds the last stage):
# one Bun process serves static dist/ + /api/posts, as the unprivileged user.
FROM ${BUN_IMAGE} AS production
WORKDIR /app
ENV NODE_ENV=production
# SEC-22 / BE-13: the database TLS mode is stated in the image. verify-full
# (certificate chain + host name, system CA) also overrides a weaker sslmode
# left in the platform's connection URL, so a production start never skips
# certificate verification. A PG_SSL_MODE in the Out Plane env (e.g. the
# documented, temporary `require` fallback) still wins over this line.
ENV PG_SSL_MODE=verify-full
COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build-info.json ./build-info.json
COPY package.json ./package.json
# whole src/: server.ts imports src/api, src/db, src/server, src/seo, src/lib,
# src/content and src/pages/home; src/db carries migrate.ts and migrations/.
# (tests/server/docker checks that the runtime import graph stays inside it.)
COPY src ./src
COPY server.ts ./server.ts
# Root-owned and read-only for the app: the process only reads these files.
USER bun
EXPOSE 3000
# BE-15: local docker / compose liveness, from inside the container. /health
# answers for every Host header and does no database work (SEC-30); the
# readiness check against the database is /ready (BE-20, the platform probe).
# start-period covers the migration step of CMD. Out Plane (Kubernetes) most
# likely ignores HEALTHCHECK.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/health" || exit 1
# BE-14: migrations first, then the server. A failed migration exits 1, so the
# server never starts on a schema it does not expect and the new release
# never becomes ready. `exec` replaces the shell: bun is PID 1 again and
# SIGTERM reaches server.ts's graceful shutdown (BE-21). During the short
# migration step sh is PID 1.
CMD ["sh", "-c", "bun run src/db/migrate.ts && exec bun run server.ts"]
