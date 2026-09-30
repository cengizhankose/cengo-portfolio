// Canonical host (K-03, SEO-03 / ANL-08 / SEC-30): www.cengizhankose.com is
// the only host that answers with content. The primary redirect is the
// owner's Cloudflare Redirect Rule (apex -> www); this middleware is the
// fallback for requests that still reach the app on another public host of
// ours: the apex (Cloudflare proxy off or rule disabled) and the default
// *.outplane.app address (which never passes through Cloudflare).
//
// - Redirect target is fixed (`https://www.cengizhankose.com` + the original
//   path and query), so no request value can choose where it points.
// - GET/HEAD get 301 (permanent, SEO-03); other methods 308 (method kept).
// - /health and /ready are never redirected: platform probes hit them on
//   whatever host they use (SEC-30 step 3).
// - localhost, IP literals and any unknown host pass through untouched, so
//   local runs, container probes and the dev API are never redirected.
// - The decision reads `Host` only, never `X-Forwarded-Host` (requestHost):
//   a request whose Host is www is always served, so no header can make the
//   canonical host redirect to itself.
// - Registered after the security headers and the rate limit (SEC-30), so a
//   redirect response carries the same headers and an /api flood on a
//   non-canonical host is still limited.
import type { Context, MiddlewareHandler } from "hono";

/**
 * K-03 canonical host. The same value as the host of SITE_URL in
 * src/seo/site.js (T-03); it is repeated here so the server TypeScript does
 * not import an untyped JS module, and tests/server/security/host.test.ts
 * fails if the two ever differ.
 */
export const CANONICAL_HOST = "www.cengizhankose.com";

/** `cengizhankose.com`: the bare domain, redirected to www. */
export const APEX_HOST = CANONICAL_HOST.replace(/^www\./, "");

/**
 * Hosts whose traffic reaches the app through the owner's Cloudflare zone
 * (proxied DNS records). Only on these is `CF-Connecting-IP` meaningful (T-08).
 */
export const CLOUDFLARE_HOSTS: ReadonlySet<string> = new Set([
  CANONICAL_HOST,
  APEX_HOST,
]);

/** Out Plane's default app address (SEC-30): `<app>-<port>-<id>.outplane.app`. */
const PLATFORM_HOST_SUFFIX = ".outplane.app";

/**
 * The host the request was sent to: the `Host` header only, normalised
 * (lower-case, no port, no trailing dot, IPv6 brackets kept: `[::1]`).
 * Empty string when it is missing.
 *
 * `X-Forwarded-Host` is never read. Cloudflare passes a client-sent value
 * through to the origin and does not put it in its cache key, so letting it
 * choose between "serve" and "redirect" would let one request store a
 * redirect under a real www URL for every visitor (cache poisoning), and let a
 * client on *.outplane.app claim a Cloudflare host to have its
 * `CF-Connecting-IP` trusted. `Host` cannot be forged that way: Cloudflare
 * routes and caches by it, and a request that skips Cloudflare is never
 * cached there. If the Out Plane ingress is ever shown to rewrite `Host`, that
 * needs its own explicit, documented handling here; until then the live check
 * is `curl -sI "$OP_URL/about"` answering 301 (Host reached the app as sent).
 */
export function requestHost(c: Context): string {
  return normalizeHost(c.req.header("host") ?? "");
}

export function normalizeHost(raw: string): string {
  let host = raw.trim().toLowerCase();
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? "" : host.slice(0, end + 1); // `[::1]:3000` -> `[::1]`
  }
  const colon = host.indexOf(":");
  if (colon !== -1) host = host.slice(0, colon);
  return host.replace(/\.+$/, "");
}

/** True for the non-canonical public hosts this app redirects to www. */
export function isRedirectHost(host: string): boolean {
  if (host === APEX_HOST) return true;
  return (
    host.endsWith(PLATFORM_HOST_SUFFIX) &&
    host.length > PLATFORM_HOST_SUFFIX.length
  );
}

export interface CanonicalHostOptions {
  /** Paths answered on every host (platform probes). */
  exemptPaths?: readonly string[];
}

export function canonicalHost({
  exemptPaths = [],
}: CanonicalHostOptions = {}): MiddlewareHandler {
  const exempt = new Set(exemptPaths);
  return async (c, next) => {
    if (exempt.has(c.req.path) || !isRedirectHost(requestHost(c))) {
      return next();
    }
    const { pathname, search } = new URL(c.req.url);
    const status =
      c.req.method === "GET" || c.req.method === "HEAD" ? 301 : 308;
    return c.redirect(`https://${CANONICAL_HOST}${pathname}${search}`, status);
  };
}
