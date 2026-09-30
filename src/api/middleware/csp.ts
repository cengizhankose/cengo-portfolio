// The one Content-Security-Policy source (SEC-04). Every external host the
// site may load from or talk to is listed here, and nowhere else:
//
//   script-src   'self', a sha256 hash per inline <script> of the built HTML
//                (read once at startup, e.g. the theme init script), the
//                self-hosted Umami tracker (T-13) and the Cloudflare Web
//                Analytics beacon (T-09: remove both beacon hosts in the PR
//                that turns the beacon off, PERF-25).
//   connect-src  'self', Umami events (T-13), the Cloudflare beacon (T-09) and
//                EmailJS (contact form).
//   style-src    'unsafe-inline' is a style relaxation, not a script one:
//                mermaid SVGs carry <style> elements and React sets style
//                attributes. No external stylesheet host.
//   font-src     'self' only: the fonts are self-hosted (PERF-08 / ANL-17,
//                public/fonts/v1, src/styles/fonts.css); no Google Fonts host.
//   img-src      'self' data: https: (blog images may live on any HTTPS host).
//   frame-ancestors 'none' (SEC-17; X-Frame-Options: DENY covers Report-Only).
//
// The bilingual site (T-12) adds no host: /tr is served from the same origin.
// Server-rendered data blocks (JSON-LD, SWR fallback, T-03/T-04/T-06) are
// non-executable `<script type="application/…json">` and need no hash;
// any new *executable* inline script must be in the built HTML so it is
// hashed here, or be moved to a file.
//
// CSP_MODE=enforce sends Content-Security-Policy; anything else (default)
// sends Content-Security-Policy-Report-Only (SEC-04 steps 3 and 5). Going
// back to report-only is `outplane env set CSP_MODE=report-only` + deploy.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { secureHeaders } from "hono/secure-headers";
import { log } from "../log";

/** hono/secure-headers' directive map (the type itself is not exported). */
export type CspDirectives = NonNullable<
  NonNullable<Parameters<typeof secureHeaders>[0]>["contentSecurityPolicy"]
>;

export type CspMode = "enforce" | "report-only";

/** T-13: self-hosted Umami (tracker script and /api/send events). */
export const UMAMI_ORIGIN = "https://stats.cengizhankose.com";
/** T-09: Cloudflare Web Analytics beacon script, until PERF-25 turns it off. */
export const CF_BEACON_SCRIPT_ORIGIN = "https://static.cloudflareinsights.com";
/** T-09: where the Cloudflare beacon reports, until PERF-25 turns it off. */
export const CF_BEACON_REPORT_ORIGIN = "https://cloudflareinsights.com";
/** Contact form (SEC-24). */
export const EMAILJS_ORIGIN = "https://api.emailjs.com";

export interface CspInput {
  mode: CspMode;
  /** `'sha256-…'` sources for the inline scripts of the built HTML. */
  scriptHashes?: readonly string[];
}

/** Directive map in the shape hono/secure-headers expects. */
export function buildCsp({ mode, scriptHashes = [] }: CspInput): CspDirectives {
  const csp: CspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      ...scriptHashes,
      UMAMI_ORIGIN,
      CF_BEACON_SCRIPT_ORIGIN,
    ],
    styleSrc: ["'self'", "'unsafe-inline'"],
    fontSrc: ["'self'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: [
      "'self'",
      UMAMI_ORIGIN,
      CF_BEACON_REPORT_ORIGIN,
      EMAILJS_ORIGIN,
    ],
    manifestSrc: ["'self'"],
    workerSrc: ["'self'"],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  };
  // Browsers ignore upgrade-insecure-requests in a report-only policy and
  // print a console warning for it, which would pollute the SEC-04
  // observation week; it only takes effect once the policy is enforced.
  if (mode === "enforce") csp.upgradeInsecureRequests = [];
  return csp;
}

/** CSP_MODE=enforce (any case, trimmed) enforces; everything else is report-only. */
export function cspModeFromEnv(value: string | undefined): CspMode {
  return value?.trim().toLowerCase() === "enforce" ? "enforce" : "report-only";
}

const SCRIPT_ELEMENT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const SRC_ATTRIBUTE = /(?:^|\s)src\s*=/i;

/**
 * `'sha256-…'` source expressions for every inline `<script>` (no `src`) in
 * an HTML document, in document order, without duplicates. The hash covers
 * the exact element text after the HTML parser's newline normalisation
 * (CRLF and CR become LF), which is what browsers hash.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>();
  for (const [, attributes, body] of html.matchAll(SCRIPT_ELEMENT)) {
    if (SRC_ATTRIBUTE.test(attributes)) continue;
    const text = body.replace(/\r\n?/g, "\n");
    const digest = createHash("sha256").update(text, "utf8").digest("base64");
    hashes.add(`'sha256-${digest}'`);
  }
  return [...hashes];
}

/**
 * Hashes of the inline scripts in every HTML document of the build (the SPA
 * shell `index.html` and any prerendered page), read once at startup: the
 * header is the same on every response, and dist/ does not change while the
 * process runs. A missing or unreadable dist/ yields no hashes.
 */
export function inlineScriptHashesFromDist(distDir: string): string[] {
  let files: string[];
  try {
    files = Array.from(
      new Bun.Glob("**/*.html").scanSync({ cwd: distDir, onlyFiles: true }),
    ).sort();
  } catch {
    return [];
  }
  const hashes = new Set<string>();
  for (const file of files) {
    try {
      const html = readFileSync(join(distDir, file), "utf8");
      for (const hash of inlineScriptHashes(html)) hashes.add(hash);
    } catch {
      log("warn", "csp: unreadable html file skipped", { file });
    }
  }
  return [...hashes];
}
