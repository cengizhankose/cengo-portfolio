// Canonical host (K-03; SEO-03, ANL-08, SEC-30): the app-level fallback of the
// Cloudflare apex -> www rule. Apex and *.outplane.app go to www with path and
// query kept; www, localhost and unknown hosts are served; probes are exempt.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createApp, HEALTH_PATH, READY_PATH } from "../../../src/api/app";
import {
  APEX_HOST,
  CANONICAL_HOST,
  CLOUDFLARE_HOSTS,
  isRedirectHost,
  normalizeHost,
} from "../../../src/api/middleware/canonical-host";
import { SITE_URL } from "../../../src/seo/site.js";
import { fakeQueries } from "../api/fake-queries";

const REPO_ROOT = join(import.meta.dir, "../../..");
const DIST = join(REPO_ROOT, "tests/server/fixtures/dist");
const WWW = "www.cengizhankose.com";
const OUTPLANE = "cengoportfoliolhal-3000-abc123.outplane.app";

let savedLogLevel: string | undefined;
beforeAll(() => {
  savedLogLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "error";
});
afterAll(() => {
  if (savedLogLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = savedLogLevel;
});

const app = () =>
  createApp({
    queries: fakeQueries(),
    serveSpa: true,
    distDir: DIST,
    env: { RATE_LIMIT_DISABLED: "1" },
  });

function request(
  path: string,
  host: string,
  init: { method?: string; headers?: Record<string, string> } = {},
) {
  return app().request(path, {
    method: init.method ?? "GET",
    headers: { host, ...init.headers },
  });
}

describe("apex -> www (SEO-03 / ANL-08 fallback)", () => {
  test("301 with path and query kept, in one hop (SEO-03 criterion 1)", async () => {
    const res = await request("/about?x=1", "cengizhankose.com");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      "https://www.cengizhankose.com/about?x=1",
    );
  });

  test("UTM parameters and the /tr prefix survive (ANL-08 criterion 1, T-12)", async () => {
    const res = await request(
      "/tr/blog/ornek-yazi?utm_source=x&utm_medium=social",
      "cengizhankose.com",
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      "https://www.cengizhankose.com/tr/blog/ornek-yazi?utm_source=x&utm_medium=social",
    );
  });

  test("root, API and missing files are redirected too", async () => {
    for (const path of ["/", "/api/posts", "/assets/yok.js", "/.env"]) {
      const res = await request(path, "cengizhankose.com");
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe(
        `https://www.cengizhankose.com${path}`,
      );
    }
  });

  test("host spelling variants: port, upper case, trailing dot", async () => {
    for (const host of [
      "cengizhankose.com:443",
      "CengizHanKose.COM",
      "cengizhankose.com.",
    ]) {
      expect((await request("/about", host)).status).toBe(301);
    }
  });

  test("the 301 carries no shared-cacheable header", async () => {
    const res = await request("/about", "cengizhankose.com");
    expect(res.status).toBe(301);
    expect(res.headers.get("cache-control") ?? "").not.toMatch(
      /public|s-maxage/i,
    );
  });

  test("HEAD is 301; other methods get 308 so the method is kept", async () => {
    expect(
      (await request("/about", "cengizhankose.com", { method: "HEAD" })).status,
    ).toBe(301);
    const post = await request("/csp-report", "cengizhankose.com", {
      method: "POST",
    });
    expect(post.status).toBe(308);
    expect(post.headers.get("location")).toBe(
      "https://www.cengizhankose.com/csp-report",
    );
  });

  test("the target host can never be chosen by the request", async () => {
    const res = await request(
      "//evil.example/x?next=https://evil.example",
      "cengizhankose.com",
    );
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin).toBe("https://www.cengizhankose.com");
  });
});

describe("www is final (no loop, SEO-03 criterion 3 / ANL-08 criterion 3)", () => {
  test("200 and no Location on www, with or without a port or trailing dot", async () => {
    for (const host of [
      WWW,
      `${WWW}:443`,
      `${WWW}.`,
      "WWW.CENGIZHANKOSE.COM",
    ]) {
      const res = await request("/", host);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  });
});

// Cloudflare forwards a client-sent X-Forwarded-Host and leaves it out of the
// cache key: if it could turn a www request into a redirect, one request would
// cache a self-redirect under a real asset URL for every visitor (review of
// this package). The host class therefore comes from Host alone.
describe("X-Forwarded-Host is ignored (no cache-poisoning self-redirect)", () => {
  const FORGED = [
    "cengizhankose.com",
    OUTPLANE,
    "foo.outplane.app",
    "cengizhankose.com, www.cengizhankose.com",
  ];

  test("Host www + a forged apex/outplane X-Forwarded-Host: 200, no Location, on pages, assets and the API", async () => {
    for (const forged of FORGED) {
      for (const path of [
        "/",
        "/about?x=1",
        "/assets/app-3f9a1c.js",
        "/robots.txt",
        "/api/posts",
      ]) {
        const res = await request(path, WWW, {
          headers: { "x-forwarded-host": forged },
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("location")).toBeNull();
      }
    }
  });

  test("a forged www X-Forwarded-Host does not save the apex or the platform host from the redirect", async () => {
    for (const host of ["cengizhankose.com", OUTPLANE]) {
      const res = await request("/about", host, {
        headers: { "x-forwarded-host": WWW },
      });
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe(
        "https://www.cengizhankose.com/about",
      );
    }
  });

  test("an unknown Host is served even when X-Forwarded-Host names the apex", async () => {
    const res = await request("/about", "10.1.2.3:3000", {
      headers: { "x-forwarded-host": "cengizhankose.com" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  test("over a real socket (Bun.serve): Host www + X-Forwarded-Host apex on an asset is 200", async () => {
    const server = Bun.serve({
      fetch: app().fetch,
      port: 0,
      hostname: "127.0.0.1",
    });
    try {
      for (const path of ["/assets/app-3f9a1c.js", "/robots.txt", "/"]) {
        const res = await fetch(`http://127.0.0.1:${server.port}${path}`, {
          redirect: "manual",
          headers: { host: WWW, "x-forwarded-host": "cengizhankose.com" },
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("location")).toBeNull();
        await res.arrayBuffer();
      }
    } finally {
      await server.stop(true);
    }
  });

  test("no server code reads X-Forwarded-Host", async () => {
    const files = ["server.ts"];
    for await (const file of new Bun.Glob("src/{api,server}/**/*.{ts,js}").scan(
      REPO_ROOT,
    )) {
      files.push(file);
    }
    expect(files.length).toBeGreaterThan(10); // the scan really saw the server code
    const reads: string[] = [];
    for (const file of files) {
      const text = await Bun.file(join(REPO_ROOT, file)).text();
      if (/["']x-forwarded-host["']/i.test(text)) reads.push(file);
    }
    expect(reads).toEqual([]);
  });
});

describe("*.outplane.app (SEC-30 step 3)", () => {
  test("the default platform address is sent to www with path and query", async () => {
    const res = await request("/blog?page=2", OUTPLANE);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      "https://www.cengizhankose.com/blog?page=2",
    );
  });

  test("look-alike hosts are not treated as the platform address", () => {
    expect(isRedirectHost("outplane.app")).toBe(false);
    expect(isRedirectHost("evil-outplane.app")).toBe(false);
    expect(isRedirectHost("x.outplane.app.evil.example")).toBe(false);
    expect(isRedirectHost(OUTPLANE)).toBe(true);
  });

  test("an /.env probe ends at 404 once the redirect is followed (SEC-30 criterion 2)", async () => {
    const hop = await request("/.env", OUTPLANE);
    expect(hop.status).toBe(301);
    const final = await request(
      new URL(hop.headers.get("location")!).pathname,
      WWW,
    );
    expect(final.status).toBe(404);
  });
});

describe("never redirected", () => {
  test("/health and /ready on every host (platform probes)", async () => {
    for (const host of ["cengizhankose.com", OUTPLANE, "10.0.0.5:3000"]) {
      for (const path of [HEALTH_PATH, READY_PATH]) {
        const res = await request(path, host);
        expect(res.status).toBe(200);
        expect(res.headers.get("location")).toBeNull();
      }
    }
  });

  test("localhost, loopback, pod IPs and unknown hosts are served as they are", async () => {
    for (const host of [
      "localhost:3000",
      "127.0.0.1:3000",
      "[::1]:3000",
      "10.0.0.5:3000",
      "app.localhost",
      "unknown.example",
      "",
    ]) {
      const res = await request("/", host);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  test("the dev API (no site) keeps answering on 127.0.0.1", async () => {
    const dev = createApp({ queries: fakeQueries(), env: {} });
    const res = await dev.request("/api/posts", {
      headers: { host: "127.0.0.1:3001" },
    });
    expect(res.status).toBe(200);
  });
});

describe("constants and config (SEO-03 steps 6-7, K-03)", () => {
  test("the canonical host is the host of the one SITE_URL constant (T-03)", () => {
    expect(SITE_URL).toBe("https://www.cengizhankose.com");
    expect(CANONICAL_HOST).toBe(new URL(SITE_URL).host);
    expect(CANONICAL_HOST).toBe(WWW);
    expect(APEX_HOST).toBe("cengizhankose.com");
    expect([...CLOUDFLARE_HOSTS].sort()).toEqual(["cengizhankose.com", WWW]);
  });

  test("package.json homepage is the https www URL (SEO-03 / ANL-08 criterion)", async () => {
    const pkg = await Bun.file(join(REPO_ROOT, "package.json")).json();
    expect(pkg.homepage).toBe("https://www.cengizhankose.com/");
  });

  test("normalizeHost", () => {
    expect(normalizeHost(" WWW.Cengizhankose.com:8443 ")).toBe(WWW);
    expect(normalizeHost("[::1]:3000")).toBe("[::1]");
    expect(normalizeHost("[::1")).toBe("");
    expect(normalizeHost("cengizhankose.com..")).toBe("cengizhankose.com");
    expect(normalizeHost("")).toBe("");
  });
});
