/**
 * mountSite with SEO injection on (SEO-01 step 7): the pages the server sends.
 * Head tags, the server render (PERF-03: the app's own HTML, drawn by
 * src/entry-server.jsx) and the data block per route; 404, 503 and redirects
 * keep their status rules; ETag/304; the kill switch; the negative cache for
 * unknown slugs; fail-fast on a shell without markers.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { createApp } from "../../../src/api/app";
import { LIVE } from "../../../src/seo/routes.js";
import { mountSite } from "../../../src/server/static";
import { captureLogs, failingQueries, silenceLogs } from "../helpers";
import {
  count,
  EN_POST,
  fakeQueries,
  FIXTURE_DIST,
  makePost,
  rootOf,
  siteWith,
  wordCount,
} from "./helpers";

silenceLogs();

const SITE = "https://www.cengizhankose.com";
const SHELL_TITLE = "<title>Fixture shell</title>";

const pageOf = async (app: Hono, path: string, init?: RequestInit) => {
  const res = await app.request(path, init);
  return { res, html: await res.text() };
};

const site = siteWith(fakeQueries());

describe("a published post", () => {
  test("200 with head tags, the article in #root and the data block", async () => {
    const { res, html } = await pageOf(site, "/blog/hello-world");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/html");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("x-robots-tag")).toBeNull();
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]+"$/);

    expect(html).toContain('<html lang="en">');
    expect(html).not.toContain("Fixture shell");
    expect(html).toContain(
      "<title data-seo>Hello world | Cengizhan Köse</title>",
    );
    expect(html).not.toContain('<div id="root"></div>');
    expect(html).toContain('<div id="root" data-ssr>');
    expect(count(rootOf(html), /<h1\b/g)).toBe(1);
    expect(html).toContain(
      '<script id="__SEO_DATA__" type="application/json">',
    );
  });

  test("one of every managed head tag", async () => {
    const { html } = await pageOf(site, "/blog/hello-world");
    const head = html.slice(0, html.indexOf("</head>"));
    expect(count(head, /<title\b/g)).toBe(1);
    expect(count(head, /name="description"/g)).toBe(1);
    expect(count(head, /rel="canonical"/g)).toBe(1);
    expect(count(head, /property="og:url"/g)).toBe(1);
    expect(count(head, /name="twitter:card"/g)).toBe(1);
    expect(count(head, /application\/ld\+json/g)).toBe(1);
    expect(head).toContain(
      `<link rel="canonical" href="${SITE}/blog/hello-world" data-seo>`,
    );
  });

  test("a post written in Turkish: <html lang=tr>, its own canonical and hreflang pair", async () => {
    const { res, html } = await pageOf(site, "/tr/blog/merhaba-dunya");
    expect(res.status).toBe(200);
    expect(html).toContain('<html lang="tr">');
    expect(html).toContain(
      `<link rel="canonical" href="${SITE}/tr/blog/merhaba-dunya" data-seo>`,
    );
    expect(html).toContain(
      '<meta property="og:locale" content="tr_TR" data-seo>',
    );
    expect(html).toContain(`hreflang="en" href="${SITE}/blog/hello-world"`);
    expect(html).toContain(
      `hreflang="tr" href="${SITE}/tr/blog/merhaba-dunya"`,
    );
    expect(html).toContain(
      `hreflang="x-default" href="${SITE}/blog/hello-world"`,
    );
    expect(rootOf(html)).toContain('<article class="blog-post" lang="tr">');
  });

  test("the data block holds the post under its swr key", async () => {
    const { html } = await pageOf(site, "/blog/hello-world");
    const json = />({"\/api\/posts\/hello-world".*})<\/script><\/body>/.exec(
      html,
    )![1];
    const data = JSON.parse(json);
    expect(Object.keys(data)).toEqual(["/api/posts/hello-world"]);
    expect(data["/api/posts/hello-world"]).toMatchObject({
      slug: "hello-world",
      lang: "en",
      translations: [{ lang: "tr", slug: "merhaba-dunya" }],
    });
  });

  test("ETag is stable; If-None-Match gets 304; HEAD has headers only", async () => {
    const first = await site.request("/blog/hello-world");
    const etag = first.headers.get("etag")!;
    const bytes = new TextEncoder().encode(await first.text()).length;
    expect((await site.request("/blog/hello-world")).headers.get("etag")).toBe(
      etag,
    );
    const revalidated = await site.request("/blog/hello-world", {
      headers: { "If-None-Match": etag },
    });
    expect(revalidated.status).toBe(304);
    expect(await revalidated.text()).toBe("");
    const head = await site.request("/blog/hello-world", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(bytes));
    expect(await head.text()).toBe("");
  });

  test("a changed post changes the page and its ETag", async () => {
    let post = EN_POST;
    const live = siteWith({
      ...fakeQueries(),
      getPostForLocale: async () => ({ status: "ok", post }),
    });
    const before = (await live.request("/blog/hello-world")).headers.get(
      "etag",
    );
    post = makePost({ title: "Edited title" });
    const res = await live.request("/blog/hello-world");
    expect(res.headers.get("etag")).not.toBe(before);
    expect(await res.text()).toContain("Edited title | Cengizhan Köse");
  });

  test("the request's Host header never reaches the page (K-03)", async () => {
    const { html } = await pageOf(site, "/blog/hello-world", {
      headers: { Host: "evil.example", "X-Forwarded-Host": "evil.example" },
    });
    expect(html).not.toContain("evil.example");
  });

  test("the only executable script is the shell's own", async () => {
    const { html } = await pageOf(site, "/blog/hello-world");
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
    const executable = scripts.filter(
      (attrs) => !/type="application\/(?:ld\+)?json"/.test(attrs),
    );
    expect(executable).toHaveLength(1);
    expect(executable[0]).toContain("/assets/app-3f9a1c.js");
  });
});

describe("static pages", () => {
  const PATHS = ["/", "/about", "/portfolio", "/contact", "/blog"];

  test.each(PATHS)(
    "%s: 200, one title, one description, lang en, the server render in #root",
    async (path) => {
      const { res, html } = await pageOf(site, path);
      expect(res.status).toBe(200);
      expect(html).toContain('<html lang="en">');
      expect(count(html, /<title\b/g)).toBe(1);
      expect(count(html, /name="description"/g)).toBe(1);
      expect(html).not.toContain(SHELL_TITLE);
      expect(html).toContain('<div id="root" data-ssr>');
      expect(count(rootOf(html), /<h1\b/g)).toBe(1);
    },
  );

  test("the six EN titles are six different titles (SEO-01 criterion 3)", async () => {
    const titles = new Set<string>();
    for (const path of [...PATHS, "/blog/hello-world"]) {
      const { html } = await pageOf(site, path);
      titles.add(/<title[^>]*>([^<]*)<\/title>/.exec(html)![1]);
    }
    expect(titles.size).toBe(6);
  });

  test("the home page and a post are different documents (cmp)", async () => {
    const home = await (await site.request("/")).text();
    const post = await (await site.request("/blog/hello-world")).text();
    expect(home).not.toBe(post);
  });

  test("the hero preload is on the home page only (PERF-01 criterion 1)", async () => {
    const counts: Record<string, number> = {};
    for (const path of [...PATHS, "/blog/hello-world"]) {
      counts[path] = count(
        (await pageOf(site, path)).html,
        /rel="preload" as="image"/g,
      );
    }
    expect(counts).toEqual({
      "/": 1,
      "/about": 0,
      "/portfolio": 0,
      "/contact": 0,
      "/blog": 0,
      "/blog/hello-world": 0,
    });
  });

  test("the home page carries the photo the preload names, once in the head and once drawn", async () => {
    const { html } = await pageOf(site, "/");
    expect(html).toContain('<img src="/img/hero/cengizhan-kose-v1-768.jpg"');
    // The hint in the head and the <img> (React writes fetchPriority in camel
    // case); React's own copy of the hint is not left inside #root.
    expect(count(html, /fetchpriority="high"/gi)).toBe(2);
    expect(count(rootOf(html), /rel="preload"/g)).toBe(0);
  });

  test("/portfolio is indexable since W8 (T-10 exit): no X-Robots-Tag, canonical and card", async () => {
    const { res, html } = await pageOf(site, "/portfolio");
    expect(res.headers.get("x-robots-tag")).toBeNull();
    expect(html).not.toContain('name="robots"');
    expect(html).toContain('rel="canonical"');
    expect(html).toContain("og:title");
    // The page holds the cases, not the old stub.
    expect(html).toContain('data-project-id="salesgym"');
    expect(html).not.toContain("Under Construction");
  });

  test("indexable pages send no X-Robots-Tag and no robots meta", async () => {
    for (const path of ["/", "/about", "/contact", "/blog", "/portfolio"]) {
      const { res, html } = await pageOf(site, path);
      expect(res.headers.get("x-robots-tag"), path).toBeNull();
      expect(html, path).not.toContain('name="robots"');
    }
  });

  test("ETag, 304 and HEAD on a static page", async () => {
    const res = await site.request("/about");
    const etag = res.headers.get("etag")!;
    const body = await res.text();
    expect(res.headers.get("cache-control")).toBe("no-cache");
    const revalidated = await site.request("/about", {
      headers: { "If-None-Match": etag },
    });
    expect(revalidated.status).toBe(304);
    const head = await site.request("/about", { method: "HEAD" });
    expect(head.headers.get("content-length")).toBe(
      String(new TextEncoder().encode(body).length),
    );
    expect(await head.text()).toBe("");
  });

  test("/ is the home page; /index.html stays the bare shell", async () => {
    const root = await pageOf(site, "/");
    expect(root.html).toContain("introName");
    const file = await pageOf(site, "/index.html");
    expect(file.html).toContain(SHELL_TITLE);
    expect(file.html).toContain('<div id="root"></div>');
  });

  test("a trailing slash or upper case is still one 301 away from the page", async () => {
    const res = await site.request("/About/");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/about");
  });

  test("/tr keeps the LIVE rule: a page of a closed language is a 404 page", async () => {
    const res = await site.request("/tr/about");
    expect(res.status).toBe(LIVE.static.includes("tr") ? 200 : 404);
  });
});

describe("the blog index", () => {
  test("lists the posts of both groups and sends them as swr data under their API keys", async () => {
    const { res, html } = await pageOf(site, "/blog");
    expect(res.status).toBe(200);
    const root = rootOf(html);
    // EN post first; the TR-only post in the other-language group; the
    // translated TR post is not listed twice.
    expect(root).toContain(
      '<a href="/blog/hello-world" data-discover="true">Hello world</a>',
    );
    expect(root).toContain('<section class="blog-other"');
    expect(root).toContain('<a href="/tr/blog/sadece-turkce"');
    expect(root).not.toContain("merhaba-dunya");

    const data = JSON.parse(
      />({"\/api\/posts\?lang=en".*})<\/script><\/body>/.exec(html)![1],
    );
    expect(Object.keys(data)).toEqual([
      "/api/posts?lang=en",
      "/api/posts?lang=tr&missingIn=en",
    ]);
    expect(
      data["/api/posts?lang=en"].map((p: { slug: string }) => p.slug),
    ).toEqual(["hello-world"]);
    expect(
      data["/api/posts?lang=tr&missingIn=en"].map(
        (p: { slug: string }) => p.slug,
      ),
    ).toEqual(["sadece-turkce"]);
    // Cards only: no content, and none of the keyset machinery.
    expect(data["/api/posts?lang=en"][0]).not.toHaveProperty("content");
    expect(data["/api/posts?lang=en"][0]).not.toHaveProperty("cursor");
  });

  test("no published posts: 200 with the empty state", async () => {
    const empty = siteWith(fakeQueries({ posts: [] }));
    const { res, html } = await pageOf(empty, "/blog");
    expect(res.status).toBe(200);
    expect(rootOf(html)).toContain("No posts yet");
  });

  test("asks each list once per request, through the query object it was given", async () => {
    const calls: Record<string, number> = {};
    const counted = siteWith(fakeQueries({ calls }));
    await counted.request("/blog");
    expect(calls.listPublishedPosts).toBe(2);
    expect(calls.getPostForLocale ?? 0).toBe(0);
  });

  test("a database error is a 503 with Retry-After, the plain shell and no noindex", async () => {
    const down = siteWith(failingQueries());
    const { result, lines } = await captureLogs(() => pageOf(down, "/blog"));
    expect(result.res.status).toBe(503);
    expect(result.res.headers.get("retry-after")).toBe("120");
    expect(result.res.headers.get("cache-control")).toBe("no-store");
    expect(result.res.headers.get("x-robots-tag")).toBeNull();
    expect(result.html).toContain('<div id="root"></div>');
    expect(result.html).not.toContain("noindex");
    expect(lines.some((line) => line.msg === "post list failed")).toBe(true);
  });
});

describe("404 pages", () => {
  test("an unknown path: 404 with its own head tags and a readable Page not found", async () => {
    const { res, html } = await pageOf(site, "/olmayan-sayfa");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("etag")).toBeNull();
    expect(html).toContain(
      "<title data-seo>Page not found | Cengizhan Köse</title>",
    );
    expect(html).toContain('<meta name="robots" content="noindex" data-seo>');
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain("og:title");
    expect(html).not.toContain("ld+json");
    expect(rootOf(html)).toContain(">Page not found</h1>");
  });

  test("a missing post: 404 + noindex, Post not found in the URL's language", async () => {
    for (const [path, lang, title] of [
      ["/blog/yok-boyle-bir-yazi", "en", "Post not found"],
      ["/tr/blog/yok-boyle-bir-yazi", "tr", "Yazı bulunamadı"],
    ] as const) {
      const { res, html } = await pageOf(site, path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get("x-robots-tag"), path).toBe("noindex");
      expect(html, path).toContain(`<html lang="${lang}">`);
      expect(html, path).toContain(
        `<title data-seo>${title} | Cengizhan Köse</title>`,
      );
      expect(rootOf(html), path).toContain(`>${title}</h1>`);
    }
  });

  test("a draft is indistinguishable from a missing slug", async () => {
    const drafts = siteWith(
      fakeQueries({ posts: [makePost({ slug: "taslak", published: false })] }),
    );
    const { res, html } = await pageOf(drafts, "/blog/taslak");
    expect(res.status).toBe(404);
    expect(html).not.toContain("Hello world");
    expect(html).toContain("Post not found");
  });

  test("HEAD on a 404 sends the headers and no body", async () => {
    const res = await site.request("/olmayan-sayfa", { method: "HEAD" });
    expect(res.status).toBe(404);
    expect(Number(res.headers.get("content-length"))).toBeGreaterThan(0);
    expect(await res.text()).toBe("");
  });
});

describe("a post in the other language, a lookup error", () => {
  test("TR post under the EN prefix: one 301 to its own path", async () => {
    const res = await site.request("/blog/merhaba-dunya?utm=x");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/tr/blog/merhaba-dunya?utm=x");
  });

  test("a failed lookup: 503 + Retry-After 120, the plain shell, no noindex, one log line", async () => {
    const down = siteWith(failingQueries());
    const { result, lines } = await captureLogs(() =>
      pageOf(down, "/blog/hello-world"),
    );
    expect(result.res.status).toBe(503);
    expect(result.res.headers.get("retry-after")).toBe("120");
    expect(result.res.headers.get("x-robots-tag")).toBeNull();
    expect(result.html).toContain('<div id="root"></div>');
    expect(result.html).not.toContain("noindex");
    expect(
      lines.filter((line) => line.msg === "post lookup failed"),
    ).toHaveLength(1);
  });

  test("static pages do not touch the database", async () => {
    const calls: Record<string, number> = {};
    const counted = siteWith(fakeQueries({ calls }));
    for (const path of ["/", "/about", "/contact", "/portfolio", "/olmayan"]) {
      await counted.request(path);
    }
    expect(calls).toEqual({});
  });
});

describe("unknown slugs are remembered for a while (SEO-08 step 5)", () => {
  function counted(options: {
    now: () => number;
    ttl?: number;
    queries?: ReturnType<typeof fakeQueries>;
  }) {
    const calls: Record<string, number> = {};
    const queries = options.queries ?? fakeQueries({ calls });
    return {
      calls,
      app: siteWith(queries, { now: options.now, missingTtlMs: options.ttl }),
    };
  }

  test("a second request inside the window does not ask the database", async () => {
    let clock = 1_000;
    const { app, calls } = counted({ now: () => clock });
    expect((await app.request("/blog/random-one")).status).toBe(404);
    clock += 29_000;
    expect((await app.request("/blog/random-one")).status).toBe(404);
    expect(calls.getPostForLocale).toBe(1);
    expect(calls.getPublishedPostBySlug).toBeUndefined();
  });

  test("after the window it asks again (a post published meanwhile appears)", async () => {
    let clock = 1_000;
    const posts = [EN_POST];
    const { app } = counted({
      now: () => clock,
      queries: fakeQueries({ posts }),
    });
    expect((await app.request("/blog/late-post")).status).toBe(404);
    posts.push(makePost({ id: 9, slug: "late-post", title: "Late" }));
    clock += 31_000;
    expect((await app.request("/blog/late-post")).status).toBe(200);
  });

  test("the window is per slug, the other language's prefix shares it", async () => {
    const { app, calls } = counted({ now: () => 5 });
    await app.request("/blog/nothing-here");
    await app.request("/tr/blog/nothing-here");
    await app.request("/blog/something-else");
    expect(calls.getPostForLocale).toBe(2);
  });

  test("a published post is never remembered as missing", async () => {
    const { app, calls } = counted({ now: () => 5 });
    for (let i = 0; i < 3; i++)
      expect((await app.request("/blog/hello-world")).status).toBe(200);
    expect(calls.getPostForLocale).toBe(3);
  });

  test("a database error is not remembered", async () => {
    let fail = true;
    const base = fakeQueries();
    const app = siteWith(
      {
        ...base,
        getPostForLocale: async (slug, locale) => {
          if (fail) throw new Error("down");
          return base.getPostForLocale(slug, locale);
        },
      },
      { now: () => 5 },
    );
    const { result } = await captureLogs(() =>
      app.request("/blog/hello-world"),
    );
    expect(result.status).toBe(503);
    fail = false;
    expect((await app.request("/blog/hello-world")).status).toBe(200);
  });

  test("at most 500 slugs are remembered, the oldest are forgotten", async () => {
    const { app, calls } = counted({ now: () => 5 });
    for (let i = 0; i < 501; i++) await app.request(`/blog/missing-${i}`);
    expect(calls.getPostForLocale).toBe(501);
    await app.request("/blog/missing-500"); // still remembered
    expect(calls.getPostForLocale).toBe(501);
    await app.request("/blog/missing-0"); // evicted: asked again
    expect(calls.getPostForLocale).toBe(502);
  });
});

describe("the kill switch and the modes without queries", () => {
  const originalEnv = process.env.SEO_INJECT;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SEO_INJECT;
    else process.env.SEO_INJECT = originalEnv;
  });

  const plain = async (app: Hono) => {
    for (const path of ["/", "/about", "/blog", "/blog/hello-world"]) {
      const { res, html } = await pageOf(app, path);
      expect(res.status, path).toBe(200);
      expect(html, path).toContain(SHELL_TITLE);
      expect(html, path).toContain('<div id="root"></div>');
      expect(html, path).not.toContain("__SEO_DATA__");
    }
  };

  test("SEO_INJECT=off serves the plain shell (any case, padded)", async () => {
    for (const value of ["off", "OFF", " Off "]) {
      process.env.SEO_INJECT = value;
      await plain(siteWith(fakeQueries()));
    }
  });

  test("the kill switch is logged once at startup, as a warning", async () => {
    process.env.SEO_INJECT = "off";
    const { lines } = await captureLogs(() => siteWith(fakeQueries()));
    const warnings = lines.filter((line) =>
      line.msg?.toString().startsWith("seo injection is off"),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].level).toBe("warn");
    delete process.env.SEO_INJECT;
    const quiet = await captureLogs(() => siteWith(fakeQueries()));
    expect(
      quiet.lines.filter((line) =>
        line.msg?.toString().includes("seo injection"),
      ),
    ).toEqual([]);
  });

  test("any other value leaves the layer on", async () => {
    for (const value of ["", "on", "0", "false"]) {
      process.env.SEO_INJECT = value;
      expect(
        (await pageOf(siteWith(fakeQueries()), "/about")).html,
      ).not.toContain(SHELL_TITLE);
    }
  });

  test("seoInject: false overrides the environment", async () => {
    delete process.env.SEO_INJECT;
    await plain(siteWith(fakeQueries(), { seoInject: false }));
  });

  test("with the layer off a 404 is still the route-aware 404 (title and robots only)", async () => {
    const { res, html } = await pageOf(
      siteWith(fakeQueries(), { seoInject: false }),
      "/olmayan",
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(html).toContain(
      "<title data-seo>Page not found | Cengizhan Köse</title>",
    );
    expect(html).toContain('<div id="root"></div>');
    expect(html).not.toContain('name="description"');
  });

  test("without queries the plain shell is served (tests, tools)", async () => {
    delete process.env.SEO_INJECT;
    await plain(siteWith(undefined));
  });

  test("seoInject: true without queries still writes the static pages, not the post and blog lists", async () => {
    const bare = siteWith(undefined, { seoInject: true });
    expect((await pageOf(bare, "/about")).html).not.toContain(SHELL_TITLE);
    expect((await pageOf(bare, "/blog")).html).toContain(
      '<div id="root"></div>',
    );
    expect((await pageOf(bare, "/blog/anything")).html).toContain(
      '<div id="root"></div>',
    );
  });
});

describe("fail fast on a shell the layer cannot rewrite", () => {
  function distWith(indexHtml: string) {
    const dir = mkdtempSync(join(tmpdir(), "seo-shell-"));
    writeFileSync(join(dir, "index.html"), indexHtml);
    return dir;
  }
  const GOOD =
    '<!doctype html><html lang="en"><head><title>x</title></head><body><div id="root"></div></body></html>';

  test("a missing marker stops mountSite at startup, naming the marker", () => {
    const dir = distWith(GOOD.replace("</body>", ""));
    try {
      expect(() =>
        mountSite(new Hono(), { distDir: dir, queries: fakeQueries() }),
      ).toThrow(/missing <\/body>/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("a complete shell mounts", () => {
    const dir = distWith(GOOD);
    try {
      expect(() =>
        mountSite(new Hono(), { distDir: dir, queries: fakeQueries() }),
      ).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("with the layer off the same shell is fine (nothing is rewritten)", () => {
    const dir = distWith("<p>not a page</p>");
    try {
      expect(() =>
        mountSite(new Hono(), {
          distDir: dir,
          queries: fakeQueries(),
          seoInject: false,
        }),
      ).not.toThrow();
      expect(() => mountSite(new Hono(), { distDir: dir })).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe("through createApp (production wiring)", () => {
  const app = createApp({
    queries: fakeQueries(),
    serveSpa: true,
    distDir: FIXTURE_DIST,
    env: { RATE_LIMIT_DISABLED: "1" },
  });

  test("a post page carries the head and the article with the layer's defaults", async () => {
    const res = await app.request("/blog/hello-world");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(
      "<title data-seo>Hello world | Cengizhan Köse</title>",
    );
    expect(count(rootOf(html), /<h1\b/g)).toBe(1);
  });

  test("the security headers and the CSP are unchanged on an injected page", async () => {
    const res = await app.request("/blog/hello-world");
    const csp =
      res.headers.get("content-security-policy-report-only") ??
      res.headers.get("content-security-policy") ??
      "";
    expect(csp).toContain("script-src");
    // The data blocks are not executable: no hash or nonce is needed for them,
    // and 'unsafe-inline' never shows up in script-src.
    const scriptSrc = /script-src ([^;]*)/.exec(csp)![1];
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("/api/posts keeps answering JSON next to the pages", async () => {
    const res = await app.request("/api/posts?lang=en");
    expect(res.headers.get("content-type")).toStartWith("application/json");
  });
});

describe("the snapshot of the real post has the post's words (SEO-01 criteria 1-2)", () => {
  test("a long post: words, one h1, headings", async () => {
    const words = Array.from({ length: 1800 }, (_, i) => `word${i}`).join(" ");
    const sections = Array.from(
      { length: 12 },
      (_, i) => `## Heading ${i}\n\n${words.slice(0, 200)}`,
    ).join("\n\n");
    const long = siteWith(
      fakeQueries({
        posts: [
          makePost({
            content: `${words}\n\n${sections}`,
            lang: "tr",
            slug: "uzun-yazi",
            title: "Uzun yazı",
            translations: [],
            translationKey: null,
          }),
        ],
      }),
    );
    const { html } = await pageOf(long, "/tr/blog/uzun-yazi");
    const root = rootOf(html);
    expect(html).toContain('<html lang="tr">');
    expect(wordCount(root)).toBeGreaterThan(1500);
    expect(count(root, /<h1\b/g)).toBe(1);
    expect(count(root, /<h[23]\b/g)).toBeGreaterThanOrEqual(10);
  });
});

describe("the blog's lazily loaded stylesheet is linked where the snapshot needs it", () => {
  // A copy of the fixture dist with one more stylesheet, like Vite's
  // assets/style-<hash>.css of the blog chunk.
  const dir = mkdtempSync(join(tmpdir(), "seo-blogcss-"));
  cpSync(FIXTURE_DIST, dir, { recursive: true });
  writeFileSync(
    join(dir, "assets", "style-blog1.css"),
    ".blog-container{padding:80px 20px}.blog-post-container{padding:20px}",
  );
  const app = siteWith(fakeQueries(), { distDir: dir });
  const link = '<link rel="stylesheet" href="/assets/style-blog1.css">';

  test("the blog index and a post link it once, in <head>", async () => {
    for (const path of [
      "/blog",
      "/blog/hello-world",
      "/tr/blog/merhaba-dunya",
    ]) {
      const { html } = await pageOf(app, path);
      expect(count(html, /assets\/style-blog1\.css/g), path).toBe(1);
      expect(html.indexOf(link), path).toBeLessThan(html.indexOf("</head>"));
    }
  });

  test("the other pages and the 404s do not", async () => {
    for (const path of [
      "/",
      "/about",
      "/contact",
      "/portfolio",
      "/olmayan-sayfa",
      "/blog/yok-boyle-bir-yazi",
    ]) {
      const { html } = await pageOf(app, path);
      expect(html, path).not.toContain("style-blog1.css");
    }
  });

  test("the shell's own stylesheet and a build without the lazy CSS are untouched", async () => {
    const { html } = await pageOf(app, "/blog");
    expect(html).toContain('href="/assets/style-3f9a1c.css"');
    const { html: plain } = await pageOf(site, "/blog"); // fixture dist: no blog CSS
    expect(count(plain, /rel="stylesheet"/g)).toBe(1);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true });
  });
});

describe("a request without a Host header (W3 review)", () => {
  // HTTP/1.0 may omit Host; Bun then hands the handler a path instead of a URL.
  // Before the fix every such request was a 500.
  async function rawStatus(port: number, request: string): Promise<string> {
    let data = "";
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000);
      void Bun.connect({
        hostname: "127.0.0.1",
        port,
        socket: {
          open: (socket) => void socket.write(request),
          data: (socket, chunk) => {
            data += chunk.toString();
            if (data.includes("\r\n")) {
              clearTimeout(timer);
              socket.end();
              resolve();
            }
          },
          close: () => {
            clearTimeout(timer);
            resolve();
          },
          error: () => resolve(),
        },
      });
    });
    return data.split("\r\n")[0];
  }

  test.each([
    ["/", "200"],
    ["/about", "200"],
    ["/blog/hello-world", "200"],
    ["/blog/merhaba-dunya", "301"],
    ["/olmayan-sayfa", "404"],
  ])("GET %s HTTP/1.0 -> %s", async (path, status) => {
    const app = createApp({
      queries: fakeQueries(),
      serveSpa: true,
      distDir: FIXTURE_DIST,
      env: { RATE_LIMIT_DISABLED: "1" },
    });
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: app.fetch,
    });
    try {
      const line = await rawStatus(
        server.port!,
        `GET ${path} HTTP/1.0\r\n\r\n`,
      );
      expect(line).toContain(` ${status} `);
    } finally {
      void server.stop(true);
    }
  });
});
