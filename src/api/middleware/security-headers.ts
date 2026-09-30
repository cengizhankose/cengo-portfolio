// Security headers on every response (SEC-04, SEC-09, SEC-17, SEC-18, SEC-19):
// HTML, static files, /api JSON, 404s, 429s and redirects alike, on every host
// (www, apex, *.outplane.app: SEC-30). One hono/secure-headers middleware,
// registered globally before any route in createApp.
//
//   Content-Security-Policy(-Report-Only)  csp.ts (CSP_MODE)
//   Strict-Transport-Security              max-age=HSTS_MAX_AGE (default 1 day); includeSubDomains, no preload
//   X-Frame-Options                        DENY (hono's default is SAMEORIGIN)
//   X-Content-Type-Options                 nosniff (MIME types: src/server/mime.ts)
//   Referrer-Policy                        strict-origin-when-cross-origin (hono's default is no-referrer)
//   Permissions-Policy                     camera=(), microphone=(), geolocation=()
//
// hono also sends its other defaults (Cross-Origin-Opener-Policy: same-origin,
// Cross-Origin-Resource-Policy, Origin-Agent-Cluster, X-DNS-Prefetch-Control:
// off, X-Download-Options, X-Permitted-Cross-Domain-Policies,
// X-XSS-Protection: 0) and removes X-Powered-By.
import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { buildCsp, type CspMode } from "./csp";

/** SEC-09 first step: one day. The owner raises it with HSTS_MAX_AGE=31536000 after a quiet week. */
export const DEFAULT_HSTS_MAX_AGE = 86_400;
/** Two years: the most any browser keeps; larger values are a typo. */
const MAX_HSTS_MAX_AGE = 63_072_000;

export const REFERRER_POLICY = "strict-origin-when-cross-origin";

export interface SecurityHeadersOptions {
  cspMode: CspMode;
  /** `'sha256-…'` hashes of the built HTML's inline scripts (csp.ts). */
  scriptHashes?: readonly string[];
  /** HSTS max-age in seconds; 0 tells browsers to forget the policy (rollback). */
  hstsMaxAge?: number;
}

/**
 * HSTS_MAX_AGE as seconds: a non-negative integer up to two years, else the
 * one-day default. `0` is valid (rollback: browsers drop the entry).
 */
export function hstsMaxAgeFromEnv(value: string | undefined): number {
  const text = value?.trim() ?? "";
  if (!/^\d+$/.test(text)) return DEFAULT_HSTS_MAX_AGE;
  const seconds = Number(text);
  return seconds <= MAX_HSTS_MAX_AGE ? seconds : DEFAULT_HSTS_MAX_AGE;
}

/** Media a third-party page may legitimately embed (feed readers, previews). */
const EMBEDDABLE_TYPE = /^(image|video|audio)\//i;

export function securityHeaders({
  cspMode,
  scriptHashes = [],
  hstsMaxAge = DEFAULT_HSTS_MAX_AGE,
}: SecurityHeadersOptions): MiddlewareHandler {
  const csp = buildCsp({ mode: cspMode, scriptHashes });
  const headers = secureHeaders({
    ...(cspMode === "enforce"
      ? { contentSecurityPolicy: csp }
      : { contentSecurityPolicyReportOnly: csp }),
    // SEC-09: no `preload` until the apex redirect is stable (open question S4).
    strictTransportSecurity: `max-age=${hstsMaxAge}; includeSubDomains`,
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: REFERRER_POLICY,
    // Empty lists serialise as `camera=()`; `false` would produce the invalid `camera=none`.
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    crossOriginResourcePolicy: "same-origin",
  });
  return async (c, next) => {
    await headers(c, next);
    // Everything here is public, so CORP guards nothing on images and media;
    // `same-origin` there would only break embeds such as feed readers
    // showing a post image. Documents, scripts and JSON keep `same-origin`.
    if (EMBEDDABLE_TYPE.test(c.res.headers.get("Content-Type") ?? "")) {
      c.res.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    }
  };
}
