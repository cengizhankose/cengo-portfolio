// The one Hono application (BE-09). server.ts (production: API + site) and
// src/api/index.ts (local dev API) both build it here, so middleware, routes
// and error handling cannot drift between environments.
//
// createApp never imports src/db: the query object is injected (T-06), so
// tests run it with fakes or PGlite and no port.
//
// Order:
//   requestId -> request logger -> security headers -> /api rate limit
//   -> canonical host -> /health -> /ready -> /api/posts -> /api/* JSON 404
//   -> site (mountSite) -> notFound / onError (T-01 envelope)
//
// Everything before /health is registered for every host (SEC-30): the
// default *.outplane.app address gets the same headers, limit and 404 policy
// as www, because none of it depends on Cloudflare.
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import type { PostQueries } from "../db/queries/posts";
import { mountSite } from "../server/static";
import { EMPTY_BUILD_INFO, type BuildInfo } from "./build-info";
import { errorHandler, notFoundHandler } from "./errors";
import { canonicalHost } from "./middleware/canonical-host";
import { cspModeFromEnv, inlineScriptHashesFromDist } from "./middleware/csp";
import {
  rateLimit,
  rateLimitSettingsFromEnv,
  readBucketStore,
  type TokenBucketStore,
} from "./middleware/rate-limit";
import { requestLogger } from "./middleware/request-logger";
import {
  hstsMaxAgeFromEnv,
  securityHeaders,
} from "./middleware/security-headers";
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
  /**
   * Runtime settings: CSP_MODE, HSTS_MAX_AGE, RL_READ_PER_MIN,
   * RATE_LIMIT_DISABLED (.env.example). Defaults to process.env.
   */
  env?: Record<string, string | undefined>;
  /** The /api token buckets (T-08); tests inject one with a fake clock. */
  rateLimitStore?: TokenBucketStore;
}

export function createApp({
  queries,
  serveSpa = false,
  distDir,
  buildInfo = EMPTY_BUILD_INFO,
  isShuttingDown = () => false,
  env = process.env,
  rateLimitStore,
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

  // 3. Security headers on every response (SEC-04/09/17/18/19). The CSP
  //    allows the inline scripts of the built HTML by hash, read once here.
  app.use(
    "*",
    securityHeaders({
      cspMode: cspModeFromEnv(env.CSP_MODE),
      scriptHashes: serveSpa ? inlineScriptHashesFromDist(distDir!) : [],
      hstsMaxAge: hstsMaxAgeFromEnv(env.HSTS_MAX_AGE),
    }),
  );

  // 4. Read rate limit per client on /api/* (SEC-10/BE-18, T-08): /api, /api/
  //    and unknown /api paths count too; /health and /ready are outside it.
  const limits = rateLimitSettingsFromEnv(env);
  if (limits.enabled) {
    // No timer: the store sweeps idle buckets itself on every request.
    const store = rateLimitStore ?? readBucketStore(limits.perMinute);
    app.use("/api/*", rateLimit({ store }));
  }

  // 4b. Fallback apex / *.outplane.app -> www redirect (SEO-03, ANL-08,
  //     SEC-30); the Cloudflare Redirect Rule is the primary one.
  app.use("*", canonicalHost({ exemptPaths: [HEALTH_PATH, READY_PATH] }));

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
  if (serveSpa) mountSite(app, { distDir: distDir!, queries });

  // 10. T-01 envelope for API misses and errors (BE-10).
  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}

/** PORT parsing shared by both entry points: an integer 0-65535 (0 = any free port), else `fallback`. */
export function portFromEnv(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : fallback;
}
