// The one Hono application (BE-09). server.ts (production: API + site) and
// src/api/index.ts (local dev API) both build it here, so middleware, routes
// and error handling cannot drift between environments.
//
// createApp never imports src/db: the query object is injected (T-06), so
// tests run it with fakes or PGlite and no port.
//
// Order (later waves fill the reserved slots, nothing else moves):
//   requestId -> request logger -> [security headers] -> [/api rate limit]
//   -> /health -> /ready -> /api/posts -> /api/* JSON 404 -> site (mountSite)
//   -> notFound / onError (T-01 envelope)
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import type { PostQueries } from "../db/queries/posts";
import { mountSite } from "../server/static";
import { EMPTY_BUILD_INFO, type BuildInfo } from "./build-info";
import { errorHandler, notFoundHandler } from "./errors";
import { requestLogger } from "./middleware/request-logger";
import { readyHandler } from "./ready";
import { createPostsRouter } from "./routes/posts";
import type { AppEnv } from "./types";

export const HEALTH_PATH = "/health";
export const READY_PATH = "/ready";

export interface CreateAppOptions {
  /** Shared post queries (createPostQueries(db), later its cached wrapper). */
  queries: PostQueries;
  /** Serve the built site (production). The dev API leaves it off; Vite serves the site. */
  serveSpa?: boolean;
  /** Vite build output; required when serveSpa is true. */
  distDir?: string;
  /** Commit and build time reported by /ready. */
  buildInfo?: BuildInfo;
  /** Graceful shutdown state (BE-21); /ready answers 503 while it is true. */
  isShuttingDown?: () => boolean;
}

export function createApp({
  queries,
  serveSpa = false,
  distDir,
  buildInfo = EMPTY_BUILD_INFO,
  isShuttingDown = () => false,
}: CreateAppOptions): Hono<AppEnv> {
  if (serveSpa && !distDir) {
    throw new Error("createApp: distDir is required when serveSpa is true");
  }

  const app = new Hono<AppEnv>();

  // 1. Request id: always generated here (limitLength 0 ignores a client-sent
  //    X-Request-Id), exposed as the X-Request-Id response header (BE-08).
  app.use("*", requestId({ limitLength: 0 }));

  // 2. One JSON log line per request; platform probes at debug level.
  app.use("*", requestLogger({ quietPaths: [HEALTH_PATH, READY_PATH] }));

  // 3. [slot, W3 SEC-04/09/17/18/19] security headers: app.use("*", ...)

  // 4. [slot, W3 SEC-10/BE-18] rate limit: app.use("/api/*", ...)

  // 5. Liveness: constant, no database.
  app.get(HEALTH_PATH, (c) =>
    c.json({ status: "ok" }, 200, { "Cache-Control": "no-store" }),
  );

  // 6. Readiness: database ping + build info (BE-20).
  app.get(READY_PATH, readyHandler({ queries, buildInfo, isShuttingDown }));

  // 7. Read-only blog API (K-01 = A).
  app.route("/api/posts", createPostsRouter(queries));

  // 8. Every other /api, /api/ and /api/* path, any method: JSON 404 (BE-11),
  //    registered before the site so an API miss never gets the SPA shell.
  app.all("/api/*", (c) => c.notFound());

  // 9. The built site: static files, HTML shell, file 404s (T-11, src/server/static.ts).
  if (serveSpa) mountSite(app, { distDir: distDir! });

  // 10. T-01 envelope for API misses and errors (BE-10).
  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}

/** PORT parsing shared by both entry points: an integer 0-65535 (0 = any free port), else `fallback`. */
export function portFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : fallback;
}
