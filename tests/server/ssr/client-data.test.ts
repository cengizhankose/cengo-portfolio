/**
 * The first data of a page (SEO-01 step 8, T-04): what the server writes,
 * what readSeoData() and toSWRFallback() make of it, and that the data equals
 * what the page would have fetched from the API (so the first render shows
 * exactly what a fetch would).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createApp } from "../../../src/api/app";
import { createPostQueries } from "../../../src/db/queries/posts";
import { posts } from "../../../src/db/schema";
import { blogIndexKeys, postKey, postsKey } from "../../../src/lib/swr.js";
import { blogIndexLists, toSWRFallback } from "../../../src/lib/swrFallback.js";
import {
  groupPostsForLocale,
  mergePostLists,
  postLanguage,
} from "../../../src/lib/postGroups.js";
import { readSeoData, SEO_DATA_ID } from "../../../src/seo/readSeoData.js";
import { ALL_LIVE, LIVE } from "../../../src/seo/routes.js";
import { createStrictTestDb } from "../db/pglite";
import { silenceLogs } from "../helpers";
import { FIXTURE_DIST } from "./helpers";

silenceLogs();

describe("blogIndexLists", () => {
  test.each(["en", "tr"])(
    "%s: the same keys, in the same order, as blogIndexKeys (src/lib/swr.js)",
    (locale) => {
      expect(blogIndexLists(locale).map((entry) => entry.key)).toEqual(
        blogIndexKeys(locale),
      );
    },
  );

  test("the page's own list first, then every other open language's untranslated posts", () => {
    expect(blogIndexLists("en", ALL_LIVE as never)).toEqual([
      { key: "/api/posts?lang=en", lang: "en" },
      { key: "/api/posts?lang=tr&missingIn=en", lang: "tr", missingIn: "en" },
    ]);
    expect(blogIndexLists("tr", ALL_LIVE as never)).toEqual([
      { key: "/api/posts?lang=tr", lang: "tr" },
      { key: "/api/posts?lang=en&missingIn=tr", lang: "en", missingIn: "tr" },
    ]);
  });

  test("a language that is not open for posts has no group", () => {
    const onlyEn = { static: ["en"], post: ["en"] };
    expect(blogIndexLists("en", onlyEn as never)).toEqual([
      { key: postsKey("en"), lang: "en" },
    ]);
    expect(LIVE.post).toContain("en");
  });
});

describe("readSeoData", () => {
  const doc = (inner: string) =>
    new JSDOM(`<body>${inner}</body>`).window.document;
  const block = (text: string) =>
    `<script id="${SEO_DATA_ID}" type="application/json">${text}</script>`;

  test("reads the JSON object of the block", () => {
    expect(readSeoData(doc(block('{"/api/posts/a":{"slug":"a"}}')))).toEqual({
      "/api/posts/a": { slug: "a" },
    });
  });

  test.each([
    ["no block", ""],
    ["an empty block", block("")],
    ["broken JSON", block("{not json")],
    ["an array", block("[1,2]")],
    ["a string", block('"x"')],
    ["null", block("null")],
  ])("%s gives an empty object", (_name, inner) => {
    expect(readSeoData(doc(inner))).toEqual({});
  });

  test("no document gives an empty object", () => {
    expect(readSeoData(null as never)).toEqual({});
    expect(readSeoData(undefined)).toEqual({});
  });
});

describe("toSWRFallback", () => {
  const post = { slug: "a", title: "A" };
  const card = { slug: "a", title: "A" };

  test("keeps blog list keys with arrays and post keys with objects", () => {
    const data = {
      "/api/posts?lang=en": [card],
      "/api/posts?lang=tr&missingIn=en": [],
      "/api/posts/a": post,
    };
    expect(toSWRFallback(data)).toEqual(data);
  });

  test("drops everything else", () => {
    expect(
      toSWRFallback({
        "/api/posts?lang=en": { not: "a list" },
        "/api/posts/a": [1],
        "/api/posts/b": "text",
        "/api/other": [],
        "/elsewhere": {},
        "": {},
      }),
    ).toEqual({});
  });

  test("a hostile key cannot reach the prototype", () => {
    const data = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"a":1}}',
    );
    const out = toSWRFallback(data);
    expect(out).toEqual({});
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  test("anything that is not an object gives an empty map", () => {
    for (const value of [null, undefined, "x", 5, [], true]) {
      expect(toSWRFallback(value)).toEqual({});
    }
  });
});

describe("postGroups (shared by BlogHome and the snapshot)", () => {
  const en = { id: 1, slug: "a", lang: "en", translationKey: "k" };
  const tr = { id: 2, slug: "b", lang: "tr", translationKey: "k" };
  const trOnly = { id: 3, slug: "c", lang: "tr", translationKey: null };
  const legacy = { id: 4, slug: "d" };

  test("own posts, then the other language's untranslated ones", () => {
    expect(groupPostsForLocale([en, tr, trOnly], "en")).toEqual({
      own: [en],
      other: [trOnly],
    });
    expect(groupPostsForLocale([en, tr, trOnly], "tr")).toEqual({
      own: [tr, trOnly],
      other: [],
    });
  });

  test("a row without a language counts as EN", () => {
    expect(postLanguage(legacy)).toBe("en");
    expect(groupPostsForLocale([legacy], "en").own).toEqual([legacy]);
    expect(groupPostsForLocale([legacy], "tr").other).toEqual([legacy]);
  });

  test("mergePostLists lists a post once, in API order", () => {
    expect(
      mergePostLists([
        [en, trOnly],
        [trOnly, tr],
      ]),
    ).toEqual([en, trOnly, tr]);
    expect(mergePostLists([undefined as never, [en]])).toEqual([en]);
  });
});

describe("the data block equals the API's answers (PGlite, production schema)", () => {
  let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    ctx = await createStrictTestDb();
    await ctx.db.insert(posts).values([
      {
        slug: "hello-world",
        title: "Hello world",
        content: "## Body\n\nEN text.",
        excerpt: "EN excerpt",
        lang: "en",
        translationKey: "hello",
        published: true,
        publishedAt: new Date("2026-09-30T10:00:00Z"),
      },
      {
        slug: "merhaba-dunya",
        title: "Merhaba dünya",
        content: "## Gövde\n\nTR metin.",
        lang: "tr",
        translationKey: "hello",
        published: true,
        publishedAt: new Date("2026-09-30T10:00:00Z"),
      },
      {
        slug: "sadece-turkce",
        title: "Sadece Türkçe",
        content: "TR only",
        coverImage: "https://example.com/c.png",
        lang: "tr",
        published: true,
      },
      {
        slug: "taslak",
        title: "Taslak",
        content: "draft",
        lang: "tr",
        published: false,
      },
    ]);
    app = createApp({
      queries: createPostQueries(ctx.db),
      serveSpa: true,
      distDir: FIXTURE_DIST,
      env: { RATE_LIMIT_DISABLED: "1" },
    });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  async function island(path: string): Promise<Record<string, unknown>> {
    const html = await (await app.request(path)).text();
    const match = new RegExp(
      `<script id="${SEO_DATA_ID}" type="application/json">([\\s\\S]*?)</script>`,
    ).exec(html);
    expect(match, path).not.toBeNull();
    return JSON.parse(match![1]);
  }

  test("/blog: each list equals GET /api/posts?lang=… (same cards, same order, same JSON)", async () => {
    const data = await island("/blog");
    expect(Object.keys(data)).toEqual(blogIndexKeys("en"));
    for (const key of blogIndexKeys("en")) {
      const api = await (await app.request(key)).json();
      expect(data[key], key).toEqual(api);
    }
    expect(
      (data["/api/posts?lang=tr&missingIn=en"] as { slug: string }[]).map(
        (p) => p.slug,
      ),
    ).toEqual(["sadece-turkce"]);
  });

  test("a post page: the block equals GET /api/posts/<slug>, translations included", async () => {
    for (const [path, slug] of [
      ["/blog/hello-world", "hello-world"],
      ["/tr/blog/merhaba-dunya", "merhaba-dunya"],
      ["/tr/blog/sadece-turkce", "sadece-turkce"],
    ] as const) {
      const data = await island(path);
      const key = postKey(slug)!;
      expect(Object.keys(data)).toEqual([key]);
      expect(data[key], path).toEqual(await (await app.request(key)).json());
    }
  });

  test("the block never holds a draft", async () => {
    for (const path of [
      "/blog",
      "/blog/hello-world",
      "/tr/blog/merhaba-dunya",
    ]) {
      const html = await (await app.request(path)).text();
      expect(html, path).not.toContain("taslak");
      expect(html, path).not.toContain("draft");
    }
    expect((await app.request("/tr/blog/taslak")).status).toBe(404);
  });

  test("what the client takes over: the map passes toSWRFallback unchanged", async () => {
    for (const path of ["/blog", "/blog/hello-world"]) {
      const data = await island(path);
      expect(toSWRFallback(data)).toEqual(data);
    }
  });
});
