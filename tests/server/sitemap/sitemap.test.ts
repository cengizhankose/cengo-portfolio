/**
 * SEO-05 / SEO-22 (Sitemap: line): the bilingual XML sitemap.
 *   - buildSitemap(): pure, checked on fixtures (counts, noindex exclusion,
 *     alternates, lastmod) with the live route table and with ALL_LIVE;
 *   - GET /sitemap.xml through createApp(): headers, well-formedness, 503 on a
 *     database error, every <loc> answers 200 and is not noindex;
 *   - the same over PGlite (production schema): drafts never listed, more posts
 *     than one page, lastmod = the API's updatedAt day;
 *   - public/robots.txt: one Sitemap line, /api/ not blocked, served text/plain.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { createApp } from "../../../src/api/app";
import { createPostQueries } from "../../../src/db/queries/posts";
import { posts } from "../../../src/db/schema";
import { pages } from "../../../src/seo/pages.js";
import { ALL_LIVE, LIVE, STATIC_PATHS } from "../../../src/seo/routes.js";
import { SITE_URL } from "../../../src/seo/site.js";
import { buildSitemap } from "../../../src/seo/sitemap";
import {
  listAllPublishedPosts,
  SITEMAP_PATH,
} from "../../../src/server/sitemap";
import { createStrictTestDb } from "../db/pglite";
import { failingQueries, REPO_ROOT, silenceLogs } from "../helpers";
import {
  EN_POST,
  FIXTURE_DIST,
  fakeQueries,
  TR_ONLY_POST,
  TR_POST,
} from "../ssr/helpers";

silenceLogs();

const XHTML = "http://www.w3.org/1999/xhtml";

interface Url {
  loc: string;
  lastmod: string | null;
  alternates: { hreflang: string; href: string }[];
}

/** Parses the document (a document that is not well-formed throws) into its URL entries. */
function parse(xml: string): Url[] {
  const doc = new JSDOM(xml, { contentType: "text/xml" }).window.document;
  expect(doc.documentElement.localName).toBe("urlset");
  expect(doc.documentElement.namespaceURI).toBe(
    "http://www.sitemaps.org/schemas/sitemap/0.9",
  );
  return [...doc.getElementsByTagName("url")].map((url) => ({
    loc: url.getElementsByTagName("loc")[0]?.textContent ?? "",
    lastmod: url.getElementsByTagName("lastmod")[0]?.textContent ?? null,
    alternates: [...url.getElementsByTagNameNS(XHTML, "link")].map((link) => {
      expect(link.getAttribute("rel")).toBe("alternate");
      return {
        hreflang: link.getAttribute("hreflang") ?? "",
        href: link.getAttribute("href") ?? "",
      };
    }),
  }));
}

const locs = (urls: Url[]) => urls.map((url) => url.loc);
const find = (urls: Url[], loc: string) => {
  const url = urls.find((entry) => entry.loc === loc);
  expect(url, loc).toBeDefined();
  return url!;
};

// Card rows as listPublishedPosts() returns them.
const row = (overrides: Record<string, unknown>) => ({
  id: 1,
  slug: "hello-world",
  title: "Hello world",
  excerpt: null,
  coverImage: null,
  createdAt: new Date("2026-09-01T10:00:00Z"),
  updatedAt: new Date("2026-09-30T10:00:00Z"),
  publishedAt: new Date("2026-09-01T10:00:00Z"),
  lang: "en",
  translationKey: null,
  ...overrides,
});
const EN_PAIR = row({ id: 1, slug: "hello-world", translationKey: "hello" });
const TR_PAIR = row({
  id: 2,
  slug: "merhaba-dunya",
  lang: "tr",
  translationKey: "hello",
  updatedAt: new Date("2026-09-29T10:00:00Z"),
});
const TR_SOLO = row({
  id: 3,
  slug: "sadece-turkce",
  lang: "tr",
  updatedAt: null,
  publishedAt: null,
  createdAt: new Date("2026-09-28T10:00:00Z"),
});
const EN_SOLO = row({
  id: 4,
  slug: "only-english",
  updatedAt: new Date("2026-09-27T10:00:00Z"),
});
const FIXTURE = [EN_PAIR, TR_PAIR, TR_SOLO, EN_SOLO];

const registry = pages as Record<string, any>;
const STATIC_COUNT = STATIC_PATHS.filter(
  (path) => !/\bnoindex\b/i.test(registry[path].en.robots ?? ""),
).length;

// The static URLs of the live route table: the TR pages are open since W11, so
// every static page is listed in both languages. EN_ONLY is the shape the table
// had before (and has again if the TR pages are closed).
const LIVE_STATIC = STATIC_COUNT * LIVE.static.length;
const EN_ONLY = Object.freeze({ static: ["en"], post: [...LIVE.post] });

describe("buildSitemap: document", () => {
  const xml = buildSitemap(pages, FIXTURE, ALL_LIVE);

  test("XML prolog, urlset with the sitemap and xhtml namespaces", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(
      true,
    );
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    );
    expect(() => parse(xml)).not.toThrow();
  });

  test("no changefreq, no priority (Google ignores them)", () => {
    expect(xml).not.toContain("changefreq");
    expect(xml).not.toContain("priority");
  });

  test("every <loc> is absolute on the www host (K-03), lower case, without a trailing slash except the root", () => {
    for (const loc of locs(parse(xml))) {
      expect(loc.startsWith(`${SITE_URL}/`) || loc === SITE_URL).toBe(true);
      expect(loc).toBe(loc.toLowerCase());
      expect(new URL(loc).pathname).not.toMatch(/.\/$/);
      expect(loc).not.toMatch(/[?#]/);
    }
  });

  test("each URL appears once", () => {
    const list = locs(parse(xml));
    expect(new Set(list).size).toBe(list.length);
  });

  test("empty input still yields a valid document with the static pages", () => {
    const urls = parse(buildSitemap(pages, [], LIVE));
    expect(locs(urls)).toHaveLength(LIVE_STATIC);
  });
});

describe("buildSitemap: which URLs", () => {
  test("live route table: both languages (TR open since W11); EN pages only if it is closed", () => {
    const live = locs(parse(buildSitemap(pages, [], LIVE)));
    expect(live).toHaveLength(LIVE_STATIC);
    expect(live).toContain(`${SITE_URL}/tr`);
    expect(live).toContain(`${SITE_URL}/tr/about`);
    const urls = locs(parse(buildSitemap(pages, FIXTURE, EN_ONLY)));
    const staticUrls = urls.filter((loc) => !loc.includes("/blog/"));
    expect(staticUrls).toHaveLength(STATIC_COUNT);
    expect(staticUrls).toContain(`${SITE_URL}/`);
    expect(staticUrls).toContain(`${SITE_URL}/about`);
    expect(staticUrls).toContain(`${SITE_URL}/contact`);
    expect(staticUrls).toContain(`${SITE_URL}/blog`);
    expect(staticUrls.some((loc) => loc.includes("/tr"))).toBe(false);
  });

  test("ALL_LIVE: every static page in both languages (TR enters with no code change)", () => {
    const urls = locs(parse(buildSitemap(pages, [], ALL_LIVE)));
    expect(urls).toHaveLength(STATIC_COUNT * 2);
    expect(urls).toContain(`${SITE_URL}/tr`);
    expect(urls).toContain(`${SITE_URL}/tr/about`);
    expect(urls).toContain(`${SITE_URL}/tr/contact`);
    expect(urls).toContain(`${SITE_URL}/tr/blog`);
  });

  test("posts: own language path, TR posts under /tr/blog, total = static + posts", () => {
    const urls = locs(parse(buildSitemap(pages, FIXTURE, EN_ONLY)));
    expect(urls).toContain(`${SITE_URL}/blog/hello-world`);
    expect(urls).toContain(`${SITE_URL}/blog/only-english`);
    expect(urls).toContain(`${SITE_URL}/tr/blog/merhaba-dunya`);
    expect(urls).toContain(`${SITE_URL}/tr/blog/sadece-turkce`);
    expect(urls).not.toContain(`${SITE_URL}/blog/merhaba-dunya`);
    expect(urls).not.toContain(`${SITE_URL}/blog/sadece-turkce`);
    expect(urls).toHaveLength(STATIC_COUNT + FIXTURE.length);
  });

  test("a page whose registry entry is noindex is left out; the rest stays", () => {
    const noindexed = {
      ...pages,
      "/portfolio": {
        en: { ...pages["/portfolio"].en, robots: "noindex, follow" },
        tr: { ...pages["/portfolio"].tr, robots: "noindex, follow" },
      },
    };
    const urls = locs(parse(buildSitemap(noindexed, [], ALL_LIVE)));
    expect(urls.some((loc) => loc.endsWith("/portfolio"))).toBe(false);
    expect(urls).toHaveLength((STATIC_COUNT - 1) * 2);
    // per language: a page that is noindex in one language only is left out there only
    const onlyTr = {
      ...pages,
      "/portfolio": {
        en: { ...pages["/portfolio"].en, robots: undefined },
        tr: { ...pages["/portfolio"].tr, robots: "noindex" },
      },
    };
    const partial = locs(parse(buildSitemap(onlyTr, [], ALL_LIVE)));
    expect(partial).toContain(`${SITE_URL}/portfolio`);
    expect(partial).not.toContain(`${SITE_URL}/tr/portfolio`);
  });

  test("the real registry: portfolio is listed once it has published cases (W8), 404 and notFound are never", () => {
    const urls = locs(parse(buildSitemap(pages, [], ALL_LIVE)));
    expect(pages["/portfolio"].en.robots).toBeUndefined();
    expect(urls).toContain(`${SITE_URL}/portfolio`);
    expect(urls).toContain(`${SITE_URL}/tr/portfolio`);
    expect(urls.some((loc) => /not-?found|404/i.test(loc))).toBe(false);
  });

  test("posts in a language that is not open for posts, and slugs that are not routes, are dropped", () => {
    const xml = buildSitemap(
      pages,
      [
        row({ id: 10, slug: "Upper-Case" }),
        row({ id: 11, slug: "a&b" }),
        row({ id: 12, slug: "two--hyphens" }),
        row({ id: 13, slug: "ok-post" }),
        row({ id: 14, slug: "de-post", lang: "de" }),
      ],
      LIVE,
    );
    const urls = locs(parse(xml));
    expect(urls).toContain(`${SITE_URL}/blog/ok-post`);
    expect(urls.filter((loc) => loc.includes("/blog/"))).toHaveLength(
      // "de" is not a language of the site: it is read as EN (postLanguage),
      // so it is kept at the EN path; nothing else survives.
      2,
    );
    expect(xml).not.toContain("&b");
    expect(xml).not.toContain("Upper");
    const closed = buildSitemap(pages, [TR_SOLO], {
      static: ["en"],
      post: ["en"],
    });
    expect(closed).not.toContain("sadece-turkce");
  });

  test("the same post listed twice is one URL", () => {
    const urls = locs(parse(buildSitemap(pages, [EN_SOLO, EN_SOLO], LIVE)));
    expect(urls.filter((loc) => loc.endsWith("/only-english"))).toHaveLength(1);
  });
});

describe("buildSitemap: xhtml:link alternates", () => {
  const all = parse(buildSitemap(pages, FIXTURE, ALL_LIVE));

  test("static pair: exactly en, tr, x-default on both URLs, same set, x-default = the EN URL", () => {
    for (const path of ["/about", "/contact", "/blog"]) {
      const en = find(all, `${SITE_URL}${path}`);
      const tr = find(all, `${SITE_URL}/tr${path}`);
      expect(en.alternates).toHaveLength(3);
      expect(tr.alternates).toHaveLength(3);
      expect(en.alternates.map((link) => link.hreflang)).toEqual([
        "en",
        "tr",
        "x-default",
      ]);
      expect(tr.alternates).toEqual(en.alternates);
      expect(en.alternates[0].href).toBe(`${SITE_URL}${path}`);
      expect(en.alternates[1].href).toBe(`${SITE_URL}/tr${path}`);
      expect(en.alternates[2].href).toBe(`${SITE_URL}${path}`);
    }
    // the home pair: EN root keeps its slash, TR is /tr
    expect(find(all, `${SITE_URL}/`).alternates[1].href).toBe(`${SITE_URL}/tr`);
    expect(find(all, `${SITE_URL}/tr`).alternates[2].href).toBe(`${SITE_URL}/`);
  });

  test("EN/TR post pair: reciprocal, each lists itself, x-default = the EN URL", () => {
    const en = find(all, `${SITE_URL}/blog/hello-world`);
    const tr = find(all, `${SITE_URL}/tr/blog/merhaba-dunya`);
    const expected = [
      { hreflang: "en", href: `${SITE_URL}/blog/hello-world` },
      { hreflang: "tr", href: `${SITE_URL}/tr/blog/merhaba-dunya` },
      { hreflang: "x-default", href: `${SITE_URL}/blog/hello-world` },
    ];
    expect(en.alternates).toEqual(expected);
    expect(tr.alternates).toEqual(expected);
  });

  test("posts without a translation have no xhtml:link at all", () => {
    expect(find(all, `${SITE_URL}/tr/blog/sadece-turkce`).alternates).toEqual(
      [],
    );
    expect(find(all, `${SITE_URL}/blog/only-english`).alternates).toEqual([]);
  });

  test("a translation key with a single published row is not a pair", () => {
    const urls = parse(
      buildSitemap(pages, [
        row({ id: 20, slug: "lonely", translationKey: "k" }),
      ]),
    );
    expect(find(urls, `${SITE_URL}/blog/lonely`).alternates).toEqual([]);
  });

  test("EN-only route table (TR static pages closed): static pages have no alternates, post pairs still do", () => {
    const live = parse(buildSitemap(pages, FIXTURE, EN_ONLY));
    for (const path of ["/", "/about", "/blog"]) {
      expect(find(live, `${SITE_URL}${path}`).alternates).toEqual([]);
    }
    expect(find(live, `${SITE_URL}/blog/hello-world`).alternates).toHaveLength(
      3,
    );
  });

  test("every alternate points at a URL that is itself in the sitemap, and lists the page back", () => {
    const listed = new Map(all.map((url) => [url.loc, url]));
    for (const url of all) {
      for (const { href } of url.alternates) {
        const target = listed.get(href);
        expect(target, `${url.loc} -> ${href}`).toBeDefined();
        expect(target!.alternates.map((link) => link.href)).toContain(url.loc);
      }
    }
  });
});

describe("buildSitemap: lastmod", () => {
  const urls = parse(buildSitemap(pages, FIXTURE, ALL_LIVE));

  test("a post: updatedAt as an ISO timestamp; createdAt when it has no other date", () => {
    expect(find(urls, `${SITE_URL}/blog/hello-world`).lastmod).toBe(
      "2026-09-30T10:00:00.000Z",
    );
    expect(find(urls, `${SITE_URL}/tr/blog/merhaba-dunya`).lastmod).toBe(
      "2026-09-29T10:00:00.000Z",
    );
    expect(find(urls, `${SITE_URL}/tr/blog/sadece-turkce`).lastmod).toBe(
      "2026-09-28T10:00:00.000Z",
    );
  });

  test("each language's /blog: the newest post that page lists", () => {
    // EN /blog lists the EN posts plus the TR post without an EN translation.
    expect(find(urls, `${SITE_URL}/blog`).lastmod).toBe(
      "2026-09-30T10:00:00.000Z",
    );
    // TR /blog lists the TR posts plus the EN post without a TR translation.
    expect(find(urls, `${SITE_URL}/tr/blog`).lastmod).toBe(
      "2026-09-29T10:00:00.000Z",
    );
  });

  test("the other static pages carry no lastmod; /blog carries none with no posts", () => {
    expect(find(urls, `${SITE_URL}/about`).lastmod).toBeNull();
    const empty = parse(buildSitemap(pages, [], LIVE));
    expect(empty.every((url) => url.lastmod === null)).toBe(true);
  });

  test("an unreadable date is left out instead of printing Invalid Date", () => {
    const xml = buildSitemap(
      pages,
      [
        row({
          id: 30,
          slug: "bad-date",
          updatedAt: "nope",
          publishedAt: null,
          createdAt: null,
        }),
      ],
      LIVE,
    );
    expect(xml).not.toContain("Invalid");
    expect(find(parse(xml), `${SITE_URL}/blog/bad-date`).lastmod).toBeNull();
  });
});

const appWith = (queries = fakeQueries()) =>
  createApp({
    queries,
    serveSpa: true,
    distDir: FIXTURE_DIST,
    env: { RATE_LIMIT_DISABLED: "1" },
  });

describe("GET /sitemap.xml through createApp", () => {
  test("200 application/xml; charset=utf-8, cacheable for an hour, well-formed", async () => {
    const res = await appWith().request(SITEMAP_PATH);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-robots-tag")).toBeNull();
    const urls = parse(await res.text());
    // fakeQueries: EN_POST, TR_POST (a pair) and TR_ONLY_POST
    expect(urls).toHaveLength(LIVE_STATIC + 3);
  });

  test("HEAD answers like GET without a body", async () => {
    const res = await appWith().request(SITEMAP_PATH, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(await res.text()).toBe("");
  });

  test("it is not the SPA shell and not the static policy's 404 (route order)", async () => {
    const res = await appWith().request(SITEMAP_PATH);
    const body = await res.text();
    expect(body).not.toContain("<!doctype html");
    expect(body).not.toContain('id="root"');
  });

  test("a database error is a 503 with Retry-After and no cache, never an empty sitemap", async () => {
    const res = await appWith(failingQueries()).request(SITEMAP_PATH);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("120");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toStartWith("text/plain");
    expect(await res.text()).not.toContain("<urlset");
  });

  test("every <loc> answers 200 at its own URL (no redirect) and is not noindex", async () => {
    const app = appWith();
    const urls = parse(await (await app.request(SITEMAP_PATH)).text());
    for (const { loc } of urls) {
      const path = new URL(loc).pathname;
      const res = await app.request(path);
      expect(res.status, loc).toBe(200);
      expect(res.headers.get("x-robots-tag") ?? "", loc).not.toMatch(
        /noindex/i,
      );
      expect(await res.text(), loc).not.toMatch(
        /<meta[^>]+name="robots"[^>]+noindex/i,
      );
    }
    expect(locs(urls)).toContain(`${SITE_URL}/tr/blog/merhaba-dunya`);
  });

  test("the queries object is only read, never written (GET /sitemap.xml lists, nothing else)", async () => {
    const calls: Record<string, number> = {};
    await appWith(fakeQueries({ calls })).request(SITEMAP_PATH);
    expect(Object.keys(calls)).toEqual(["listPublishedPosts"]);
  });
});

describe("the sitemap over the production schema (PGlite)", () => {
  let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;
  let app: ReturnType<typeof appWith>;
  const MANY = 60;

  beforeAll(async () => {
    ctx = await createStrictTestDb();
    await ctx.db.insert(posts).values([
      {
        slug: "hello-world",
        title: "Hello world",
        content: "EN text",
        lang: "en",
        translationKey: "hello",
        published: true,
        publishedAt: new Date("2026-09-30T10:00:00Z"),
      },
      {
        slug: "merhaba-dunya",
        title: "Merhaba dünya",
        content: "TR metin",
        lang: "tr",
        translationKey: "hello",
        published: true,
        publishedAt: new Date("2026-09-30T10:00:00Z"),
      },
      {
        slug: "taslak",
        title: "Taslak yazı",
        content: "draft",
        lang: "tr",
        published: false,
      },
      ...Array.from({ length: MANY }, (_, i) => ({
        slug: `bulk-${String(i).padStart(3, "0")}`,
        title: `Bulk ${i}`,
        content: "x",
        lang: "en" as const,
        published: true,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        publishedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      })),
    ]);
    app = appWith(createPostQueries(ctx.db));
  });

  afterAll(async () => {
    await ctx?.close();
  });

  test("never lists a draft", async () => {
    const xml = await (await app.request(SITEMAP_PATH)).text();
    expect(xml).not.toContain("taslak");
  });

  test("lists every published post, also past the first 50-row page", async () => {
    const urls = locs(parse(await (await app.request(SITEMAP_PATH)).text()));
    const blog = urls.filter((loc) => loc.includes("/blog/"));
    // 60 bulk + hello-world + merhaba-dunya
    expect(blog).toHaveLength(MANY + 2);
    expect(urls).toContain(`${SITE_URL}/blog/bulk-000`);
    expect(urls).toContain(`${SITE_URL}/blog/bulk-059`);
    expect(urls).toHaveLength(LIVE_STATIC + MANY + 2);
  });

  test("the post count equals the API's (per language): <loc> = static + /api/posts", async () => {
    const api = async (lang: string) => {
      const out: unknown[] = [];
      let cursor: string | null = null;
      do {
        const res: Response = await app.request(
          `/api/posts?lang=${lang}&limit=50${cursor ? `&cursor=${cursor}` : ""}`,
        );
        const page = (await res.json()) as unknown[];
        out.push(...page);
        cursor = res.headers.get("x-next-cursor");
      } while (cursor);
      return out.length;
    };
    const total = (await api("en")) + (await api("tr"));
    const urls = locs(parse(await (await app.request(SITEMAP_PATH)).text()));
    expect(urls).toHaveLength(LIVE_STATIC + total);
  });

  test("a post's lastmod is the same day as updatedAt in /api/posts/<slug>", async () => {
    const urls = parse(await (await app.request(SITEMAP_PATH)).text());
    for (const [slug, path] of [
      ["hello-world", "/blog/hello-world"],
      ["merhaba-dunya", "/tr/blog/merhaba-dunya"],
      ["bulk-007", "/blog/bulk-007"],
    ] as const) {
      const api = (await (await app.request(`/api/posts/${slug}`)).json()) as {
        updatedAt: string;
      };
      expect(find(urls, `${SITE_URL}${path}`).lastmod!.slice(0, 10)).toBe(
        api.updatedAt.slice(0, 10),
      );
    }
  });

  test("the EN/TR pair lists each other; a post without a translation has no alternates", async () => {
    const urls = parse(await (await app.request(SITEMAP_PATH)).text());
    const en = find(urls, `${SITE_URL}/blog/hello-world`);
    expect(en.alternates.map((link) => link.hreflang)).toEqual([
      "en",
      "tr",
      "x-default",
    ]);
    expect(find(urls, `${SITE_URL}/tr/blog/merhaba-dunya`).alternates).toEqual(
      en.alternates,
    );
    expect(find(urls, `${SITE_URL}/blog/bulk-001`).alternates).toEqual([]);
  });

  test("listAllPublishedPosts pages by keyset and never repeats a row", async () => {
    const queries = createPostQueries(ctx.db);
    const rows = await listAllPublishedPosts(queries, ["en"]);
    expect(rows).toHaveLength(MANY + 1);
    expect(new Set(rows.map((post) => post.id)).size).toBe(rows.length);
  });

  test("xmllint accepts the document when it is installed", async () => {
    const xmllint = Bun.which("xmllint");
    if (!xmllint) return;
    const xml = await (await app.request(SITEMAP_PATH)).text();
    const proc = Bun.spawn([xmllint, "--noout", "-"], {
      stdin: new Blob([xml]),
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(0);
  });
});

describe("robots.txt (SEO-22 Sitemap line)", () => {
  const robots = readFileSync(join(REPO_ROOT, "public/robots.txt"), "utf8");
  const dist = mkdtempSync(join(tmpdir(), "w9-robots-"));

  beforeAll(() => {
    cpSync(FIXTURE_DIST, dist, { recursive: true });
    cpSync(join(REPO_ROOT, "public/robots.txt"), join(dist, "robots.txt"));
  });
  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  test("exactly one absolute Sitemap line pointing at the www sitemap", () => {
    const lines = robots
      .split(/\r?\n/)
      .filter((line) => /^sitemap:/i.test(line));
    expect(lines).toEqual([`Sitemap: ${SITE_URL}${SITEMAP_PATH}`]);
    expect(robots).toMatch(
      /^Sitemap: https:\/\/www\.cengizhankose\.com\/sitemap\.xml$/m,
    );
  });

  test("/api/ is not blocked (the blog loads /api/posts while Googlebot renders)", () => {
    expect(robots.match(/disallow:\s*\/api/gi) ?? []).toHaveLength(0);
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Disallow:\s*$/m);
  });

  test("served as text/plain; charset=utf-8 and the sitemap it names answers 200", async () => {
    const app = createApp({
      queries: fakeQueries(),
      serveSpa: true,
      distDir: dist,
      env: { RATE_LIMIT_DISABLED: "1" },
    });
    const res = await app.request("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")?.replace(/\s/g, "")).toBe(
      "text/plain;charset=utf-8",
    );
    expect(await res.text()).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
    expect((await app.request("/sitemap.xml")).status).toBe(200);
  });
});

// Keep fixtures referenced so a change to the shared helpers fails loudly here.
test("the shared SSR fixtures are the pair plus a TR-only post", () => {
  expect(EN_POST.translationKey).toBe(TR_POST.translationKey);
  expect(TR_ONLY_POST.translationKey).toBeNull();
});
