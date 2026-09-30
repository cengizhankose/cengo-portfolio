/**
 * The blog's RSS feeds (MKT-07): /rss.xml (EN) and /tr/rss.xml (TR).
 * createApp() with in-memory queries (the route order, headers, errors) and
 * with PGlite on the production schema (drafts never appear, the set equals the
 * /blog lists). The XML is parsed with jsdom's XML parser, so a document that
 * is not well-formed fails here.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createApp } from "../../../src/api/app";
import { createPostQueries } from "../../../src/db/queries/posts";
import { posts } from "../../../src/db/schema";
import {
  buildRss,
  feedPosts,
  FEED_ITEM_LIMIT,
  xmlEscape,
} from "../../../src/server/rss";
import { createStrictTestDb } from "../db/pglite";
import { failingQueries, silenceLogs } from "../helpers";
import {
  card,
  EN_POST,
  FIXTURE_DIST,
  fakeQueries,
  makePost,
  TR_ONLY_POST,
  TR_POST,
} from "../ssr/helpers";

silenceLogs();

const parse = (xml: string) =>
  new JSDOM(xml, { contentType: "text/xml" }).window.document;

const text = (doc: Document, selector: string) =>
  doc.querySelector(selector)?.textContent ?? null;

const appWith = (queries = fakeQueries()) =>
  createApp({
    queries,
    serveSpa: true,
    distDir: FIXTURE_DIST,
    env: { RATE_LIMIT_DISABLED: "1" },
  });

describe("GET /rss.xml and /tr/rss.xml", () => {
  test.each(["/rss.xml", "/tr/rss.xml"])(
    "%s: 200, application/rss+xml, cacheable for 15 minutes, well-formed",
    async (path) => {
      const res = await appWith().request(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe(
        "application/rss+xml; charset=utf-8",
      );
      expect(res.headers.get("cache-control")).toBe("public, max-age=900");
      const doc = parse(await res.text());
      expect(doc.documentElement.nodeName).toBe("rss");
      expect(doc.documentElement.getAttribute("version")).toBe("2.0");
    },
  );

  test("HEAD answers like GET without a body", async () => {
    const res = await appWith().request("/rss.xml", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/rss+xml; charset=utf-8",
    );
    expect(await res.text()).toBe("");
  });

  test("the root element declares atom and dc, the prolog is UTF-8", async () => {
    const xml = await (await appWith().request("/rss.xml")).text();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"');
  });

  test("the EN channel: /blog title and description, en, self link, the EN /blog", async () => {
    const doc = parse(await (await appWith().request("/rss.xml")).text());
    expect(text(doc, "channel > title")).toBe("Blog | Cengizhan Köse");
    expect(text(doc, "channel > link")).toBe(
      "https://www.cengizhankose.com/blog",
    );
    expect(text(doc, "channel > language")).toBe("en");
    expect(text(doc, "channel > description")).toStartWith(
      "Notes from building web, mobile and AI products by Cengizhan Köse",
    );
    const self = doc.getElementsByTagName("atom:link")[0];
    expect(self.getAttribute("href")).toBe(
      "https://www.cengizhankose.com/rss.xml",
    );
    expect(self.getAttribute("rel")).toBe("self");
    expect(self.getAttribute("type")).toBe("application/rss+xml");
  });

  test("the TR channel: Turkish description, tr, its own self link; link stays the EN /blog while the TR pages are closed", async () => {
    const doc = parse(await (await appWith().request("/tr/rss.xml")).text());
    expect(text(doc, "channel > language")).toBe("tr");
    expect(text(doc, "channel > description")).toStartWith(
      "Cengizhan Köse'nin web, mobil ve yapay zekâ ürünleri",
    );
    expect(doc.getElementsByTagName("atom:link")[0].getAttribute("href")).toBe(
      "https://www.cengizhankose.com/tr/rss.xml",
    );
    // LIVE.static has no 'tr' yet: /tr/blog is a 404, the channel must not point at it.
    expect(text(doc, "channel > link")).toBe(
      "https://www.cengizhankose.com/blog",
    );
  });

  test("today's data shape: one TR post, no translation, in both feeds (link = its own language path)", async () => {
    const only = fakeQueries({ posts: [TR_ONLY_POST] });
    const app = appWith(only);
    for (const [path, extra] of [
      ["/rss.xml", true],
      ["/tr/rss.xml", false],
    ] as const) {
      const doc = parse(await (await app.request(path)).text());
      const items = doc.querySelectorAll("item");
      expect(items).toHaveLength(1);
      expect(text(doc, "item > link")).toBe(
        "https://www.cengizhankose.com/tr/blog/sadece-turkce",
      );
      const guid = doc.querySelector("item > guid");
      expect(guid?.getAttribute("isPermaLink")).toBe("true");
      expect(guid?.textContent).toBe(text(doc, "item > link"));
      // The EN feed lists a TR post under the "other language" group: it says so.
      expect(doc.getElementsByTagName("dc:language")).toHaveLength(
        extra ? 1 : 0,
      );
      if (extra) {
        expect(doc.getElementsByTagName("dc:language")[0].textContent).toBe(
          "tr",
        );
      }
    }
  });

  test("a pair: each feed lists its own language's post once, in /blog order", async () => {
    const app = appWith(
      fakeQueries({ posts: [EN_POST, TR_POST, TR_ONLY_POST] }),
    );
    const en = parse(await (await app.request("/rss.xml")).text());
    const tr = parse(await (await app.request("/tr/rss.xml")).text());
    const links = (doc: Document) =>
      [...doc.querySelectorAll("item > link")].map((node) => node.textContent);
    expect(links(en)).toEqual([
      "https://www.cengizhankose.com/blog/hello-world",
      "https://www.cengizhankose.com/tr/blog/sadece-turkce",
    ]);
    expect(links(tr)).toEqual([
      "https://www.cengizhankose.com/tr/blog/merhaba-dunya",
      "https://www.cengizhankose.com/tr/blog/sadece-turkce",
    ]);
  });

  test("item fields: title, pubDate (RFC 822), description", async () => {
    const doc = parse(await (await appWith().request("/rss.xml")).text());
    const item = doc.querySelector("item")!;
    expect(item.querySelector("title")?.textContent).toBe("Hello world");
    expect(item.querySelector("pubDate")?.textContent).toBe(
      new Date("2026-09-30T10:00:00Z").toUTCString(),
    );
    expect(item.querySelector("description")?.textContent).toBe(
      "A short excerpt of the post.",
    );
    expect(text(doc, "channel > lastBuildDate")).toMatch(
      /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/,
    );
  });

  test("an unreachable database is a 503 with Retry-After and no cache, not an empty feed", async () => {
    const res = await appWith(failingQueries()).request("/rss.xml");
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("120");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).not.toContain("xml");
  });

  test("the feed route comes before the static policy: other xml files keep their 404", async () => {
    const app = appWith();
    expect((await app.request("/sitemap-nope.xml")).status).toBe(404);
    expect((await app.request("/tr/sitemap-nope.xml")).status).toBe(404);
  });

  test("no request input reaches the feed: Host and query do not change a byte", async () => {
    const app = appWith();
    const plain = await (await app.request("/rss.xml")).text();
    const tricked = await (
      await app.request("/rss.xml?x=1&lang=tr", {
        headers: { "x-forwarded-host": "evil.example" },
      })
    ).text();
    expect(tricked).toBe(plain);
    expect(plain).not.toContain("evil.example");
  });
});

describe("buildRss / feedPosts", () => {
  test("caps the feed at the item limit and keeps the order of the lists", () => {
    const many = Array.from({ length: FEED_ITEM_LIMIT + 5 }, (_, index) =>
      card(
        makePost({
          id: index + 1,
          slug: `post-${index + 1}`,
          translationKey: null,
          translations: [],
        }),
      ),
    );
    expect(FEED_ITEM_LIMIT).toBe(20);
    const chosen = feedPosts([many, []], "en");
    expect(chosen).toHaveLength(20);
    expect(chosen[0].slug).toBe("post-1");
    const doc = parse(buildRss("en", [many, []]));
    expect(doc.querySelectorAll("item")).toHaveLength(20);
  });

  test("an empty feed is still valid and uses the clock for lastBuildDate", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const doc = parse(buildRss("en", [[], []], now));
    expect(doc.querySelectorAll("item")).toHaveLength(0);
    expect(text(doc, "channel > lastBuildDate")).toBe(now.toUTCString());
  });

  test("lastBuildDate is the newest change among the items", () => {
    const newest = card(
      makePost({ updatedAt: new Date("2026-10-05T08:00:00Z") }),
    );
    const doc = parse(buildRss("en", [[newest], []], new Date(0)));
    expect(text(doc, "channel > lastBuildDate")).toBe(
      new Date("2026-10-05T08:00:00Z").toUTCString(),
    );
  });

  test("hostile text is escaped and stays well-formed", () => {
    const hostile = card(
      makePost({
        title: 'A <b>"bold"</b> & ]]> move \u0001 \ud800',
        excerpt: "<![CDATA[x]]> & 'y'",
      }),
    );
    const xml = buildRss("en", [[hostile], []]);
    expect(xml).not.toContain("<b>");
    expect(xml).not.toContain("<![CDATA[");
    expect(xml).not.toContain("\u0001");
    const doc = parse(xml);
    expect(text(doc, "item > title")).toBe('A <b>"bold"</b> & ]]> move  ');
    expect(text(doc, "item > description")).toBe("<![CDATA[x]]> & 'y'");
  });

  test("xmlEscape keeps valid surrogate pairs and drops lone ones", () => {
    expect(xmlEscape("a😀b")).toBe("a😀b");
    expect(xmlEscape("a\ud83db")).toBe("ab");
    expect(xmlEscape(null)).toBe("");
  });

  test("a post without a publish date has no pubDate; a post without an excerpt no description", () => {
    const bare = card(
      makePost({ publishedAt: null, createdAt: null as never, excerpt: null }),
    );
    const doc = parse(buildRss("en", [[bare], []]));
    expect(doc.querySelector("item > pubDate")).toBeNull();
    expect(doc.querySelector("item > description")).toBeNull();
  });
});

describe("the feed over the production schema (PGlite)", () => {
  let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    ctx = await createStrictTestDb();
    await ctx.db.insert(posts).values([
      {
        slug: "hello-world",
        title: "Hello world",
        content: "EN text",
        excerpt: "EN excerpt",
        lang: "en",
        translationKey: "hello",
        published: true,
        publishedAt: new Date("2026-09-30T10:00:00Z"),
      },
      {
        slug: "merhaba-dunya",
        title: "Merhaba dünya",
        content: "TR metin",
        excerpt: "TR özet",
        lang: "tr",
        translationKey: "hello",
        published: true,
        publishedAt: new Date("2026-09-30T10:00:00Z"),
      },
      {
        slug: "sadece-turkce",
        title: "Sadece Türkçe",
        content: "TR only",
        lang: "tr",
        published: true,
        publishedAt: new Date("2026-09-29T10:00:00Z"),
      },
      {
        slug: "taslak",
        title: "Taslak yazı",
        content: "draft",
        lang: "tr",
        published: false,
      },
    ]);
    app = appWith(createPostQueries(ctx.db));
  });

  afterAll(async () => {
    await ctx?.close();
  });

  const feedLinks = async (path: string) =>
    [
      ...parse(await (await app.request(path)).text()).querySelectorAll(
        "item > link",
      ),
    ].map((node) => node.textContent);

  test("never lists a draft", async () => {
    for (const path of ["/rss.xml", "/tr/rss.xml"]) {
      const xml = await (await app.request(path)).text();
      expect(xml, path).not.toContain("taslak");
      expect(xml, path).not.toContain("Taslak");
    }
  });

  test("each feed lists the same posts in the same order as the /blog snapshot", async () => {
    expect(await feedLinks("/rss.xml")).toEqual([
      "https://www.cengizhankose.com/blog/hello-world",
      "https://www.cengizhankose.com/tr/blog/sadece-turkce",
    ]);
    // The TR feed has the API's order for lang=tr (newest row first; the two
    // rows were inserted in one go, so only the set is asserted here).
    const apiTr = (
      (await (await app.request("/api/posts?lang=tr")).json()) as {
        slug: string;
      }[]
    ).map(({ slug }) => `https://www.cengizhankose.com/tr/blog/${slug}`);
    expect(await feedLinks("/tr/rss.xml")).toEqual(apiTr);
    expect([...apiTr].sort()).toEqual([
      "https://www.cengizhankose.com/tr/blog/merhaba-dunya",
      "https://www.cengizhankose.com/tr/blog/sadece-turkce",
    ]);
    const blog = await (await app.request("/blog")).text();
    const order = [
      ...blog.matchAll(/class="blog-post-title"><a href="([^"]+)"/g),
    ]
      .map((match) => match[1])
      .map((href) => `https://www.cengizhankose.com${href}`);
    expect(order).toEqual(await feedLinks("/rss.xml"));
  });
});
