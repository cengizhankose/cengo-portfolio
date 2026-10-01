/**
 * Route-aware 404 (T-11 part 2): SEO-02, SEC-23, FE-16 (server half).
 * Known page routes -> 200 shell; other spellings of a known route -> 301;
 * unknown page paths -> 404 shell with noindex (meta + X-Robots-Tag) and the
 * "Page not found" title; file-like misses and bot probes -> plain 404
 * no-store; unknown /api paths -> JSON 404 (through createApp).
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { join } from "node:path";
import { createApp } from "../../../src/api/app";
import type { PostQueries } from "../../../src/db/queries/posts";
import { injectShellMeta, mountSite } from "../../../src/server/static";

const DIST = join(import.meta.dir, "..", "fixtures", "dist");

let app: Hono;
beforeAll(() => {
  app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok" }));
  mountSite(app, { distDir: DIST });
});

const get = (path: string, init?: RequestInit) => app.request(path, init);

async function expectNotFoundPage(res: Response, lang = "en") {
  expect(res.status).toBe(404);
  expect(res.headers.get("content-type")).toStartWith("text/html");
  expect(res.headers.get("x-robots-tag")).toBe("noindex");
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("etag")).toBeNull();
  const html = await res.text();
  expect(html).toContain('<div id="root"></div>'); // the SPA renders NotFound
  expect(html).toContain('<meta name="robots" content="noindex" data-seo>');
  expect(html).toContain(`<html lang="${lang}">`);
  return html;
}

describe("unknown page paths -> 404 + noindex (SEO-02, SEC-23)", () => {
  test.each([
    "/this-page-does-not-exist-seo-audit-7f3",
    "/olmayan-sayfa",
    "/bu-sayfa-yok",
    "/about/team",
    "/blog/a/b",
    "/trx",
  ])("%s", async (path) => {
    const html = await expectNotFoundPage(await get(path));
    expect(html).toContain(
      "<title data-seo>Page not found | Cengizhan Köse</title>",
    );
    expect(html).not.toContain("Fixture shell"); // the shell's own title is replaced
  });

  test("HEAD -> 404 with the same headers and no body", async () => {
    const res = await get("/olmayan-sayfa", { method: "HEAD" });
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(Number(res.headers.get("content-length"))).toBeGreaterThan(0);
    expect(await res.text()).toBe("");
  });

  test("a 404 never turns into a 304", async () => {
    const res = await get("/olmayan-sayfa", {
      headers: { "If-None-Match": "*" },
    });
    expect(res.status).toBe(404);
  });

  test("/../../etc/passwd (normalised to /etc/passwd) is a 404 page, nothing leaks", async () => {
    const html = await expectNotFoundPage(await get("/../../etc/passwd"));
    expect(html).not.toContain("root:");
  });

  test("no Accept-Language based redirect (T-12)", async () => {
    const res = await get("/", {
      headers: { "Accept-Language": "tr-TR,tr;q=0.9" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("TR pages are open since W11 (SEO-02 step 7, SEO-11 Adım B)", () => {
  test.each(["/tr", "/tr/about", "/tr/portfolio", "/tr/contact", "/tr/blog"])(
    "%s -> 200 shell, indexable",
    async (path) => {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-robots-tag")).toBeNull();
      expect(await res.text()).not.toContain("Page not found");
    },
  );

  test("/tr/ -> 301 /tr", async () => {
    const res = await get("/tr/");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/tr");
  });

  test("/tr/this-page-does-not-exist -> 404 + noindex, the Turkish not-found title", async () => {
    const html = await expectNotFoundPage(
      await get("/tr/this-page-does-not-exist-7f3"),
      "tr",
    );
    expect(html).toContain("Sayfa bulunamadı | Cengizhan Köse");
  });
});

describe("file-like misses and bot probes -> plain 404, no-store (SEC-23, BE-12)", () => {
  test.each([
    "/.env",
    "/.env.backup",
    "/.git/config",
    "/xmlrpc.php",
    "/wp-login.php",
    "/phpinfo.php",
    "/assets/yok-123.js",
    "/assets/yok.js",
    "/blog/some.post",
  ])("%s", async (path) => {
    const res = await get(path);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toStartWith("text/plain");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("cache-control")).not.toContain("immutable");
    expect(await res.text()).toBe("Not found");
  });
});

describe("known routes -> 200 shell (SEO-02, FE-16)", () => {
  test.each([
    "/",
    "/about",
    "/portfolio",
    "/contact",
    "/blog",
    "/blog/any-post",
  ])("%s", async (path) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/html");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]+"$/);
    const html = await res.text();
    expect(html).toContain("<title>Fixture shell</title>");
    expect(html).not.toContain("noindex");
  });

  test("indexable pages carry no X-Robots-Tag", async () => {
    for (const path of ["/", "/about", "/contact", "/blog", "/portfolio"]) {
      expect((await get(path)).headers.get("x-robots-tag")).toBeNull();
    }
  });

  test("/portfolio: 200 without X-Robots-Tag since W8 (T-10 exit, SEO-14 hook), 304 on revalidation", async () => {
    const res = await get("/portfolio");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBeNull();
    const etag = res.headers.get("etag")!;
    const revalidated = await get("/portfolio", {
      headers: { "If-None-Match": etag },
    });
    expect(revalidated.status).toBe(304);
    expect(revalidated.headers.get("x-robots-tag")).toBeNull();
  });

  test("routes registered before mountSite keep priority", async () => {
    expect((await get("/health")).status).toBe(200);
  });
});

describe("one URL per page: 301 to the canonical spelling (SEO-02 step 3d)", () => {
  test.each([
    ["/about/", "/about"],
    ["/About", "/about"],
    ["/ABOUT/", "/about"],
    ["/blog/", "/blog"],
    ["/Blog", "/blog"],
    ["/about//", "/about"],
    ["/blog/Hello-World", "/blog/hello-world"],
    ["/blog/hello-world/", "/blog/hello-world"],
    ["/tr/blog/Merhaba-Dunya", "/tr/blog/merhaba-dunya"],
  ])("%s -> 301 %s", async (path, target) => {
    const res = await get(path);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(target);
  });

  test("the query string is kept", async () => {
    const res = await get("/About/?utm_source=x&b=2");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/about?utm_source=x&b=2");
  });

  test("the target is always a local path built from the route table (no open redirect)", async () => {
    for (const path of [
      "//evil.example/",
      "//evil.example",
      "/%2F%2Fevil.example/",
      "/\\evil.example/",
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get("location"), path).toBeNull();
    }
  });

  test("a spelling of an open language is redirected like an EN one (TR open since W11)", async () => {
    const res = await get("/TR/About");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/tr/about");
  });
});

describe("through createApp (SEC-23 criteria 1-3)", () => {
  const queries: PostQueries = {
    listPublishedPosts: async () => [],
    getPublishedPostBySlug: async () => null,
    getPostForLocale: async () => ({ status: "missing" }),
    ping: async () => {},
  };
  const site = createApp({ queries, serveSpa: true, distDir: DIST });
  const quiet = async (path: string) => {
    const original = console.log;
    console.log = () => {}; // request log lines
    try {
      return await site.request(path);
    } finally {
      console.log = original;
    }
  };

  test.each([
    "/.env",
    "/.git/config",
    "/wp-login.php",
    "/phpinfo.php",
    "/assets/yok.js",
    "/olmayan-sayfa",
    "/api/yok",
  ])("%s -> 404", async (path) => {
    expect((await quiet(path)).status).toBe(404);
  });

  test("/api/yok is the T-01 JSON envelope, /olmayan-sayfa the noindex page", async () => {
    const api = await quiet("/api/yok");
    expect(api.headers.get("content-type")).toStartWith("application/json");
    expect(await api.json()).toEqual({ error: "Not found", code: "NOT_FOUND" });
    const page = await quiet("/olmayan-sayfa");
    expect(page.headers.get("x-robots-tag")).toBe("noindex");
  });

  test.each(["/", "/about", "/portfolio", "/contact", "/blog", "/health"])(
    "%s -> 200",
    async (path) => {
      expect((await quiet(path)).status).toBe(200);
    },
  );
});

describe("injectShellMeta (SEO-02 step 4)", () => {
  const shell =
    '<!doctype html><html lang="en"><head><meta charset="utf-8" />' +
    "<title>Cengizhan Köse | Senior Fullstack Engineer</title></head>" +
    '<body><div id="root"></div></body></html>';

  test("replaces the title, adds robots, sets <html lang>", () => {
    const html = injectShellMeta(shell, {
      title: "Sayfa bulunamadı | Cengizhan Köse",
      robots: "noindex",
      lang: "tr",
    });
    expect(html).toContain('<html lang="tr">');
    expect(html).toContain(
      "<title data-seo>Sayfa bulunamadı | Cengizhan Köse</title>",
    );
    expect(html).not.toContain("Senior Fullstack Engineer");
    expect(html).toContain(
      '<meta name="robots" content="noindex" data-seo></head>',
    );
    expect(html.match(/<title/g)).toHaveLength(1);
  });

  test("keeps other <html> attributes and replaces an existing robots tag", () => {
    const html = injectShellMeta(
      '<html data-theme="dark" lang="en"><head><meta name="robots" content="all">' +
        "<title>x</title></head></html>",
      { robots: "noindex", lang: "tr" },
    );
    expect(html).toContain('<html data-theme="dark" lang="tr">');
    expect(html.match(/name="robots"/g)).toHaveLength(1);
    expect(html).toContain('content="noindex"');
    expect(html).toContain("<title>x</title>");
  });

  test("adds a title when the shell has none; escapes values", () => {
    const html = injectShellMeta("<html><head></head><body></body></html>", {
      title: 'A <b>"x"</b> & y',
      lang: "en",
    });
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(
      "<title data-seo>A &lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y</title></head>",
    );
  });

  test("`$` in a value is inserted literally", () => {
    const html = injectShellMeta(shell, { title: "$& $1 $$" });
    expect(html).toContain("<title data-seo>$&amp; $1 $$</title>");
  });
});
