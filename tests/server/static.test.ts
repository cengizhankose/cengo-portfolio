import { beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { join } from "node:path";
import { mountSite } from "../../src/server/static";

const REPO = join(import.meta.dir, "..", "..");
const DIST = join(import.meta.dir, "fixtures", "dist");

let app: Hono;
let shellEtag: string;

beforeAll(async () => {
  app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok" }));
  mountSite(app, { distDir: DIST });
  shellEtag = (await app.request("/")).headers.get("etag") ?? "";
});

const get = (path: string, init?: RequestInit) => app.request(path, init);

describe("HTML documents (PERF-18, BE-22)", () => {
  test("GET / -> 200 shell with no-cache and a strong ETag", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/html");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]+"$/);
    expect(await res.text()).toContain('<div id="root"></div>');
  });

  test("ETag is stable across requests and equals Bun.hash of index.html", async () => {
    const body = await Bun.file(join(DIST, "index.html")).bytes();
    expect(shellEtag).toBe(`"${Bun.hash(body).toString(16)}"`);
    expect((await get("/")).headers.get("etag")).toBe(shellEtag);
  });

  test("matching If-None-Match -> 304 without body", async () => {
    const res = await get("/", { headers: { "If-None-Match": shellEtag } });
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe(shellEtag);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toBe("");
  });

  test("weak (W/, as Cloudflare sends after brotli), listed and * validators also match", async () => {
    for (const header of [`W/${shellEtag}`, `"nope", ${shellEtag}`, "*"]) {
      expect(
        (await get("/", { headers: { "If-None-Match": header } })).status,
      ).toBe(304);
    }
  });

  test("stale If-None-Match -> 200 with body", async () => {
    const res = await get("/", { headers: { "If-None-Match": '"deadbeef"' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="root"');
  });

  test("HEAD / -> 200, headers only, Content-Length of the GET body", async () => {
    const res = await get("/", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe(shellEtag);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("content-length")).toBe(
      String(Bun.file(join(DIST, "index.html")).size),
    );
    expect(await res.text()).toBe("");
  });

  test("/index.html is served from the same in-memory document", async () => {
    const res = await get("/index.html");
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe(shellEtag);
  });

  test("a directory with index.html answers /dir and /dir/ (prerender layout dist/<route>/index.html)", async () => {
    for (const path of ["/prerendered", "/prerendered/"]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toStartWith("text/html");
      expect(res.headers.get("cache-control")).toBe("no-cache");
      expect(res.headers.get("etag")).not.toBe(shellEtag);
      expect(await res.text()).toContain("fixture-prerendered-document");
    }
  });

  test("a plain .html file is served with ETag and no-cache", async () => {
    const res = await get("/standalone.html");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]+"$/);
    expect(await res.text()).toContain("fixture-standalone-document");
  });
});

describe("known SPA routes get the shell (T-11)", () => {
  test.each([
    "/about",
    "/portfolio",
    "/contact",
    "/blog",
    "/blog/some-post",
    "/tr/blog/some-post",
    "/tr",
    "/tr/about",
    "/tr/portfolio",
    "/tr/contact",
    "/tr/blog",
    "/tr/privacy",
  ])("%s -> 200 shell", async (path) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/html");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("etag")).toBe(shellEtag);
    expect(await res.text()).toContain('<div id="root"></div>');
  });

  test("shell revalidation works on any SPA route", async () => {
    expect(
      (await get("/about", { headers: { "If-None-Match": shellEtag } })).status,
    ).toBe(304);
  });

  // T-11 part 2 (W3, SEO-02): the TR static pages are open since W11
  // (LIVE.static has 'tr', SEO-11 Adım B); an unknown path under /tr is still
  // a 404 with noindex. tests/server/seo/not-found.test.ts has the rest.
  test.each(["/tr/yok", "/tr/blog/Bad_Slug"])(
    "%s -> 404 noindex (not a known TR route)",
    async (path) => {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
    },
  );

  test("routes registered before mountSite keep priority", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("static files (PERF-17, PERF-18, BE-22, BE-23)", () => {
  test("/assets/*.js -> 200, JavaScript type, immutable", async () => {
    const res = await get("/assets/app-3f9a1c.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "text/javascript;charset=utf-8",
    );
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(await res.text()).toContain("fixture-app-js");
  });

  test("HEAD on an asset -> 200 without body, Content-Length of the file", async () => {
    const res = await get("/assets/app-3f9a1c.js", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("content-length")).toBe(
      String(Bun.file(join(DIST, "assets/app-3f9a1c.js")).size),
    );
    expect(await res.text()).toBe("");
  });

  test("a trailing slash never serves a file (/robots.txt/, /standalone.html/)", async () => {
    for (const path of [
      "/robots.txt/",
      "/standalone.html/",
      "/assets/app-3f9a1c.js/",
    ]) {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  test("a directory without index.html is not a file", async () => {
    const res = await get("/img");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test.each([
    ["/assets/style-3f9a1c.css", "text/css;charset=utf-8"],
    ["/assets/photo-4OjSTnTo.JPG", "image/jpeg"],
    ["/img/hero-v1.avif", "image/avif"],
    ["/fonts/body-v1.woff2", "font/woff2"],
  ])("%s -> %s, immutable", async (path, type) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(type);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  test.each([
    ["/robots.txt", "text/plain;charset=utf-8"],
    ["/manifest.json", "application/json;charset=utf-8"],
    ["/favicon.ico", "image/x-icon"],
  ])("%s -> %s, max-age=3600", async (path, type) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(type);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
  });

  test("an existing file under /.well-known/ is served", async () => {
    const res = await get("/.well-known/test-fixture.txt");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("fixture-well-known-file");
  });
});

describe("misses never get the SPA shell (BE-12, BE-24, SEC-28)", () => {
  const expectHardMiss = async (path: string) => {
    const res = await get(path);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toStartWith("text/plain");
    expect(res.headers.get("cache-control")).not.toContain("immutable");
    const body = await res.text();
    expect(body).not.toContain("<html");
    expect(body).not.toContain('id="root"');
  };

  test.each([
    `/assets/yok-${Date.now()}.js`,
    "/assets/audit-yok-2026.js",
    "/assets/missing-chunk.css",
    "/assets/no-extension",
    "/assets",
    "/assets/",
    "/img/missing-v1.avif",
    "/fonts/missing.woff2",
    "/missing.png",
    "/logo192.png",
    "/sitemap.xml",
    "/blog/feed.xml",
  ])("%s -> 404 text/plain no-store", expectHardMiss);

  test.each([
    "/.well-known/apple-app-site-association",
    "/.well-known/assetlinks.json",
    `/.well-known/yok-${Date.now()}`,
    "/.well-known",
  ])(
    "%s -> 404 text/plain no-store (K-09: Drivee association files removed)",
    expectHardMiss,
  );

  test.each([
    "/.hidden-file.txt",
    "/.env",
    "/.git/config",
    "/assets/.secret",
    "/.well-known/.hidden",
  ])("dotfile %s -> 404 even when it exists", expectHardMiss);

  test("HEAD on a missing asset -> 404 no-store", async () => {
    const res = await get("/assets/missing.js", { method: "HEAD" });
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("non-GET methods are not answered by the site handler", async () => {
    expect((await get("/", { method: "POST" })).status).toBe(404);
  });
});

describe("traversal through the HTTP layer (BE-22, SEC-21)", () => {
  test.each([
    "/..%2f..%2fpackage.json",
    "/%2e%2e/server.ts",
    "/..%2f..%2f..%2fserver.ts",
    "/..%2fdist-backup%2fleak.txt",
    "/assets/..%2f..%2fdist-backup%2fleak.txt",
    "/%252e%252e/%252e%252e/server.ts",
    "/..%5c..%5cserver.ts",
    "/%00",
    "/%E0%A4%A",
    "/assets/%2e%2e%2frobots.txt",
  ])("%s -> 404 and no file content", async (path) => {
    const res = await get(path);
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain("fixture-sibling-dir-must-not-leak");
    expect(body).not.toContain('"dependencies"');
    expect(body).not.toContain("mountSite");
    expect(body).not.toContain("<html");
  });
});

describe("literal dot segments (PERF-18 /../../etc/passwd probe)", () => {
  test("/../../etc/passwd is normalised to /etc/passwd by the URL parser and never leaves dist/", async () => {
    const res = await get("/../../etc/passwd");
    // Extensionless unknown path -> SPA shell in this wave (route-aware 404 comes with T-11 part 2).
    expect(res.status).toBe(404); // extensionless unknown path -> 404 not-found shell (T-11 part 2, SEO-02)
    const body = await res.text();
    expect(body).toContain('<div id="root"></div>');
    expect(body).not.toContain("root:");
  });

  test("dot-segment probes with an extension -> 404", async () => {
    expect((await get("/../../etc/passwd.txt")).status).toBe(404);
    expect((await get("/../../../package.json")).status).toBe(404);
  });
});

describe("missing dist/", () => {
  test("SPA routes answer 500 no-store instead of throwing, files 404", async () => {
    const bare = new Hono();
    const warn = console.warn;
    console.warn = () => {};
    try {
      mountSite(bare, {
        distDir: join(import.meta.dir, "fixtures", "does-not-exist"),
      });
    } finally {
      console.warn = warn;
    }
    const shell = await bare.request("/about");
    expect(shell.status).toBe(500);
    expect(shell.headers.get("cache-control")).toBe("no-store");
    expect((await bare.request("/assets/app.js")).status).toBe(404);
  });
});

describe("source hygiene (PERF-18, BE-22, BE-23, BE-28)", () => {
  const sources = [
    "server.ts",
    "src/server/static.ts",
    "src/server/mime.ts",
    "src/server/safe-path.ts",
  ];
  /** Lines of the handler sources matching `pattern` (empty = criterion met). */
  const offending = async (pattern: RegExp) => {
    const hits: string[] = [];
    for (const rel of sources) {
      const lines = (await Bun.file(join(REPO, rel)).text()).split("\n");
      lines.forEach(
        (line, i) =>
          pattern.test(line) && hits.push(`${rel}:${i + 1}: ${line.trim()}`),
      );
    }
    return hits;
  };

  test("no synchronous fs calls in the request path", async () => {
    expect(await offending(/readFileSync|existsSync/)).toEqual([]);
  });

  test("no hand-kept mimeTypes table", async () => {
    expect(await offending(/mimeTypes/)).toEqual([]);
  });

  test("server.ts does not import serveStatic from 'bun'", async () => {
    expect(
      (await offending(/serveStatic.*from ['"]bun['"]/)).filter((hit) =>
        hit.startsWith("server.ts"),
      ),
    ).toEqual([]);
  });

  test("the old unseparated guard is gone; the separator-aware one is in place", async () => {
    expect(await offending(/startsWith\(distDir\)/)).toEqual([]);
    expect(await offending(/distRoot \+ sep/)).toHaveLength(1);
  });

  test("public/.well-known holds no Drivee association files (K-09)", async () => {
    expect(
      await Bun.file(
        join(REPO, "public/.well-known/apple-app-site-association"),
      ).exists(),
    ).toBe(false);
    expect(
      await Bun.file(join(REPO, "public/.well-known/assetlinks.json")).exists(),
    ).toBe(false);
  });
});
