// Security headers (SEC-04, SEC-09, SEC-17, SEC-18, SEC-19, SEC-30): one
// global middleware, the same header set on HTML, static files, /api JSON,
// 404s, 429s and redirects, on www and on the default *.outplane.app host.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../../src/api/app";
import {
  buildCsp,
  cspModeFromEnv,
  inlineScriptHashes,
  inlineScriptHashesFromDist,
} from "../../../src/api/middleware/csp";
import {
  DEFAULT_HSTS_MAX_AGE,
  hstsMaxAgeFromEnv,
} from "../../../src/api/middleware/security-headers";
import { readBucketStore } from "../../../src/api/middleware/rate-limit";
import { fakeQueries } from "../api/fake-queries";

const WWW = "www.cengizhankose.com";
const OUTPLANE = "x-3000-y.outplane.app";

// A built site with the inline scripts later waves add: the theme init script
// (W3-DSG-theme-init) and a JSON-LD data block (SEO-06), next to Vite's module entry.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");document.documentElement.dataset.theme=t==="light"||t==="dark"?t:matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}catch(e){}})();`;
const JSON_LD = `{"@context":"https://schema.org","@type":"Person","name":"Cengizhan Köse"}`;
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <script>${THEME_SCRIPT}</script>
    <script type="application/ld+json">${JSON_LD}</script>
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
    <title>Fixture</title>
  </head>
  <body><div id="root"></div></body>
</html>
`;

const sha256 = (text: string) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

let dist: string;
let savedLogLevel: string | undefined;

beforeAll(() => {
  savedLogLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "error"; // keep the per-request log lines out of the test output
  dist = mkdtempSync(join(tmpdir(), "sec-headers-dist-"));
  writeFileSync(join(dist, "index.html"), INDEX_HTML);
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "assets/index-abc123.js"), "console.log(1);\n");
  writeFileSync(join(dist, "robots.txt"), "User-agent: *\nAllow: /\n");
  mkdirSync(join(dist, "og"));
  writeFileSync(
    join(dist, "og/default.jpg"),
    new Uint8Array([0xff, 0xd8, 0xff]),
  );
});

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
  if (savedLogLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = savedLogLevel;
});

function siteApp(env: Record<string, string | undefined> = {}) {
  return createApp({
    queries: fakeQueries(),
    serveSpa: true,
    distDir: dist,
    env,
  });
}

function get(
  app: ReturnType<typeof siteApp>,
  path: string,
  host = WWW,
  init: RequestInit = {},
) {
  return app.request(path, {
    ...init,
    headers: { host, "cf-connecting-ip": "203.0.113.10", ...init.headers },
  });
}

const reportOnly = (res: Response) =>
  res.headers.get("content-security-policy-report-only") ?? "";

function directive(csp: string, name: string): string[] {
  const found = csp
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name);
  return found ? found.slice(1) : [];
}

/** The six headers SEC-30 criterion 1 counts. */
const SIX_HEADERS =
  /^(content-security-policy(-report-only)?|strict-transport-security|x-frame-options|x-content-type-options|referrer-policy|permissions-policy)$/;

function countSix(res: Response): number {
  let n = 0;
  res.headers.forEach((_value, key) => {
    if (SIX_HEADERS.test(key)) n++;
  });
  return n;
}

function expectBaseHeaders(res: Response) {
  expect(res.headers.get("strict-transport-security")).toBe(
    "max-age=86400; includeSubDomains",
  );
  expect(res.headers.get("x-frame-options")).toBe("DENY");
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(res.headers.get("referrer-policy")).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(res.headers.get("permissions-policy")).toBe(
    "camera=(), microphone=(), geolocation=()",
  );
  expect(res.headers.get("x-powered-by")).toBeNull();
  // Browser default kept for DNS prefetch (no external font host any more, PERF-08).
  expect(res.headers.get("x-dns-prefetch-control")).toBeNull();
  expect(countSix(res)).toBe(6);
}

describe("CSP (SEC-04)", () => {
  test("Report-Only by default, with default-src 'self' and script-src 'self'", async () => {
    const res = await get(siteApp(), "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBeNull();
    const csp = reportOnly(res);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
  });

  test("CSP_MODE=enforce sends Content-Security-Policy instead (any case)", async () => {
    for (const mode of ["enforce", " ENFORCE "]) {
      const res = await get(siteApp({ CSP_MODE: mode }), "/");
      expect(res.headers.get("content-security-policy-report-only")).toBeNull();
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp).toContain("default-src 'self'");
      expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
      expect(csp).toContain("upgrade-insecure-requests");
    }
  });

  test("anything but enforce stays report-only; upgrade-insecure-requests only when enforced", async () => {
    expect(cspModeFromEnv(undefined)).toBe("report-only");
    expect(cspModeFromEnv("report-only")).toBe("report-only");
    expect(cspModeFromEnv("enforced")).toBe("report-only");
    expect(cspModeFromEnv("")).toBe("report-only");
    const res = await get(siteApp({ CSP_MODE: "off" }), "/");
    expect(reportOnly(res)).not.toContain("upgrade-insecure-requests");
  });

  test("script-src: 'self', the inline theme script hash, Umami, the CF beacon; no unsafe-*", async () => {
    const csp = reportOnly(await get(siteApp(), "/"));
    const scriptSrc = directive(csp, "script-src");
    expect(scriptSrc).toEqual([
      "'self'",
      sha256(THEME_SCRIPT),
      sha256(JSON_LD), // hashing a data block is harmless (it never executes)
      "https://stats.cengizhankose.com",
      "https://static.cloudflareinsights.com",
    ]);
    expect(scriptSrc.join(" ")).not.toMatch(/unsafe-(inline|eval)/);
  });

  test("connect-src, style/font, img-src and the locked-down directives", async () => {
    const csp = reportOnly(await get(siteApp(), "/"));
    expect(directive(csp, "connect-src")).toEqual([
      "'self'",
      "https://stats.cengizhankose.com",
      "https://cloudflareinsights.com",
      "https://api.emailjs.com",
    ]);
    expect(directive(csp, "style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directive(csp, "font-src")).toEqual(["'self'"]);
    expect(directive(csp, "img-src")).toEqual(["'self'", "data:", "https:"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "frame-src")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
  });

  test("the external host set is exactly the T-09/T-13 list (criterion: exact host set)", async () => {
    for (const path of ["/", "/tr/"]) {
      const csp = reportOnly(await get(siteApp(), path));
      const hosts = [...new Set(csp.match(/https:\/\/[a-z0-9.-]+/g))].sort();
      expect(hosts).toEqual([
        "https://api.emailjs.com",
        "https://cloudflareinsights.com",
        "https://static.cloudflareinsights.com",
        "https://stats.cengizhankose.com",
      ]);
      expect(directive(csp, "script-src").join(" ")).toContain(
        "stats.cengizhankose.com",
      );
      expect(directive(csp, "connect-src").join(" ")).toContain(
        "stats.cengizhankose.com",
      );
    }
  });

  test("/tr/ carries the same CSP as / (T-12 adds no host)", async () => {
    const app = siteApp();
    const home = reportOnly(await get(app, "/"));
    const tr = reportOnly(await get(app, "/tr/"));
    expect(tr).toBe(home);
  });

  test("the dev API (no site) sends the same policy without script hashes", async () => {
    const res = await createApp({ queries: fakeQueries(), env: {} }).request(
      "/api/posts",
    );
    const scriptSrc = directive(reportOnly(res), "script-src");
    expect(scriptSrc).toEqual([
      "'self'",
      "https://stats.cengizhankose.com",
      "https://static.cloudflareinsights.com",
    ]);
  });

  test("buildCsp is the single directive source used by the middleware", async () => {
    const csp = buildCsp({ mode: "report-only", scriptHashes: ["'sha256-x'"] });
    expect(csp.scriptSrc).toContain("'sha256-x'");
    expect(csp.upgradeInsecureRequests).toBeUndefined();
    expect(buildCsp({ mode: "enforce" }).upgradeInsecureRequests).toEqual([]);
  });
});

describe("inline script hashes", () => {
  test("matches the CSP spec / MDN example hash", () => {
    expect(
      inlineScriptHashes("<script>alert('Hello, world.');</script>"),
    ).toEqual(["'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='"]);
  });

  test("skips external scripts but not data-src look-alikes", () => {
    const html = `
      <script src="/a.js"></script>
      <script type="module" crossorigin src='/b.js'></script>
      <script
        src="/c.js"></script>
      <script data-src="/lazy.js">run()</script>`;
    expect(inlineScriptHashes(html)).toEqual([sha256("run()")]);
  });

  test("hashes the exact text, with CRLF/CR normalised to LF like the HTML parser", () => {
    const lf = "\n  var a = 1;\n";
    expect(inlineScriptHashes(`<script>\r\n  var a = 1;\r\n</script>`)).toEqual(
      [sha256(lf)],
    );
    expect(inlineScriptHashes(`<script>\r  var a = 1;\r</script>`)).toEqual([
      sha256(lf),
    ]);
    expect(inlineScriptHashes(`<script> x </script>`)).not.toEqual([
      sha256("x"),
    ]);
  });

  test("case-insensitive tags, duplicates once, empty inline scripts hashed too", () => {
    const html = `<SCRIPT>a()</SCRIPT><script>a()</script ><script></script>`;
    expect(inlineScriptHashes(html)).toEqual([sha256("a()"), sha256("")]);
  });

  test("reads every HTML document of the build, and nothing when dist/ is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "sec-headers-hashes-"));
    try {
      writeFileSync(join(dir, "index.html"), "<script>one()</script>");
      mkdirSync(join(dir, "about"));
      writeFileSync(
        join(dir, "about/index.html"),
        "<script>one()</script><script>two()</script>",
      );
      writeFileSync(join(dir, "notes.txt"), "<script>never()</script>");
      // files in sorted path order (about/index.html, index.html), each hash once
      expect(inlineScriptHashesFromDist(dir)).toEqual([
        sha256("one()"),
        sha256("two()"),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(
      inlineScriptHashesFromDist(join(tmpdir(), "no-such-dist-xyz")),
    ).toEqual([]);
  });
});

describe("HSTS (SEC-09)", () => {
  test("defaults to one day with includeSubDomains and no preload", async () => {
    const value = (await get(siteApp(), "/")).headers.get(
      "strict-transport-security",
    );
    expect(value).toBe(`max-age=${DEFAULT_HSTS_MAX_AGE}; includeSubDomains`);
    expect(value).not.toContain("preload");
  });

  test("HSTS_MAX_AGE raises it to a year on every route", async () => {
    const app = siteApp({ HSTS_MAX_AGE: "31536000" });
    for (const path of ["/", "/api/posts", "/assets/yok.js"]) {
      expect(
        (await get(app, path)).headers.get("strict-transport-security"),
      ).toBe("max-age=31536000; includeSubDomains");
    }
  });

  test("0 is a valid rollback value; junk falls back to the default", () => {
    expect(hstsMaxAgeFromEnv("0")).toBe(0);
    expect(hstsMaxAgeFromEnv(" 31536000 ")).toBe(31536000);
    for (const bad of [
      undefined,
      "",
      "-1",
      "1e9",
      "12.5",
      "abc",
      "999999999",
    ]) {
      expect(hstsMaxAgeFromEnv(bad)).toBe(DEFAULT_HSTS_MAX_AGE);
    }
  });
});

describe("the same header set everywhere (SEC-04/09/17/18/19, SEC-30)", () => {
  test("HTML, /api JSON, missing asset, existing asset, /health, /ready, API 404", async () => {
    const app = siteApp();
    const cases: Array<[string, number]> = [
      ["/", 200],
      ["/tr/", 301], // the trailing slash redirects to /tr (TR open since W11)
      ["/api/posts", 200],
      ["/assets/yok.js", 404],
      ["/assets/index-abc123.js", 200],
      ["/robots.txt", 200],
      ["/health", 200],
      ["/ready", 200],
      ["/api/bu-yol-yok", 404],
    ];
    for (const [path, status] of cases) {
      const res = await get(app, path);
      expect(res.status).toBe(status);
      expectBaseHeaders(res);
      expect(reportOnly(res)).toContain("default-src 'self'");
    }
  });

  test("HEAD requests and 304 revalidations carry them too", async () => {
    const app = siteApp();
    const head = await get(app, "/", WWW, { method: "HEAD" });
    expectBaseHeaders(head);
    const etag = head.headers.get("etag") ?? "";
    const revalidated = await get(app, "/", WWW, {
      headers: { "if-none-match": etag },
    });
    expect(revalidated.status).toBe(304);
    expectBaseHeaders(revalidated);
  });

  test("a 429 from the rate limiter carries them (errors go through onError)", async () => {
    const app = createApp({
      queries: fakeQueries(),
      serveSpa: true,
      distDir: dist,
      env: {},
      rateLimitStore: readBucketStore(1, () => 0),
    });
    expect((await get(app, "/api/posts")).status).toBe(200);
    const limited = await get(app, "/api/posts");
    expect(limited.status).toBe(429);
    expectBaseHeaders(limited);
  });

  test("the default *.outplane.app host gets the same six headers (SEC-30)", async () => {
    const app = siteApp();
    const www = await get(app, "/");
    const home = await get(app, "/", OUTPLANE);
    expect(home.status).toBe(301); // fallback redirect to www, headers included
    expectBaseHeaders(home);
    expect(reportOnly(home)).toBe(reportOnly(www));
    const health = await get(app, "/health", OUTPLANE);
    expect(health.status).toBe(200);
    expectBaseHeaders(health);
    const api = await get(app, "/api/posts", OUTPLANE);
    expectBaseHeaders(api);
    const secret = await get(app, "/.env", OUTPLANE);
    expectBaseHeaders(secret);
  });

  test("SEC-18: nosniff with correct types for the entry script and robots.txt", async () => {
    const app = siteApp();
    const js = await get(app, "/assets/index-abc123.js");
    expect(js.headers.get("content-type")).toContain("javascript");
    expect(js.headers.get("x-content-type-options")).toBe("nosniff");
    const robots = await get(app, "/robots.txt");
    expect(robots.headers.get("content-type")).toStartWith("text/plain");
    expect(robots.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("CORP: same-origin for documents and JSON, cross-origin for embeddable images", async () => {
    const app = siteApp();
    expect(
      (await get(app, "/")).headers.get("cross-origin-resource-policy"),
    ).toBe("same-origin");
    expect(
      (await get(app, "/api/posts")).headers.get(
        "cross-origin-resource-policy",
      ),
    ).toBe("same-origin");
    const og = await get(app, "/og/default.jpg");
    expect(og.headers.get("content-type")).toBe("image/jpeg");
    expect(og.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  });
});

describe("registration (SEC-30 step 1)", () => {
  test("app.ts registers the security middleware for every host, not per host", async () => {
    const source = await Bun.file(
      join(import.meta.dir, "../../../src/api/app.ts"),
    ).text();
    expect(source).toMatch(/app\.use\(\s*"\*",\s*securityHeaders\(/);
    expect(source).toMatch(/app\.use\("\/api\/\*", rateLimit\(/);
    // headers -> rate limit -> canonical host -> routes
    const order = [
      source.indexOf("securityHeaders({"),
      source.indexOf("rateLimit({ store })"),
      source.indexOf("canonicalHost({"),
      source.indexOf("app.get(HEALTH_PATH"),
    ];
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
