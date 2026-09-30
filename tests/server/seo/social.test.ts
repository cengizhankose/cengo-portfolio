/**
 * SEO-06 / MKT-06: Open Graph and Twitter Card values of getPageMeta() and the
 * flat tag list (socialTags) that the server and usePageMeta print. The raw
 * HTML (curl), LinkedIn Post Inspector and live image criteria are checked
 * after W7 (server head) and the deploy.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALL_LIVE, matchRoute, STATIC_PATHS } from "../../../src/seo/routes.js";
import {
  absoluteUrl,
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_SIZE,
  LOCALES,
  SOCIAL_PROFILES,
  TWITTER_HANDLE,
} from "../../../src/seo/site.js";
import {
  canonicalUrl,
  EN_ONLY,
  getMeta as getPageMeta,
  ogImage,
  OG_LOCALE,
  socialTags,
} from "./loose";

const ROOT = join(import.meta.dir, "..", "..", "..");
const HOST = "https://www.cengizhankose.com";
const INDEXABLE_PATHS = STATIC_PATHS.filter((path) => path !== "/portfolio");

type Tag = { attribute: string; key: string; content: string };
const tagsOf = (meta: unknown) => socialTags(meta) as Tag[];
const valuesOf = (tags: Tag[], key: string) =>
  tags.filter((tag) => tag.key === key).map((tag) => tag.content);

const post = (over: Record<string, unknown> = {}) => ({
  slug: "atlas-steward",
  lang: "tr",
  title: "Atlas Steward",
  seoTitle: "Atlas Steward: Yarım İşi Yakalayan Sistem",
  excerpt: "Sohbetlerde yarım kalan işleri yakalayan yerel sistem.",
  createdAt: "2026-07-01T08:00:00.000Z",
  publishedAt: "2026-07-02T09:30:00.000Z",
  updatedAt: "2026-07-05T12:00:00.000Z",
  ...over,
});

describe("site constants (SEO-06 steps 2 and 3)", () => {
  test("og:locale values of both languages", () => {
    expect(OG_LOCALE).toEqual({ en: "en_US", tr: "tr_TR" });
    expect(Object.keys(OG_LOCALE).sort()).toEqual([...LOCALES].sort());
  });

  test("the Twitter handle is the one of the X profile (K-11)", () => {
    const x = SOCIAL_PROFILES.find((profile) => profile.id === "x");
    expect(TWITTER_HANDLE).toBe("@cengzhnkse");
    expect(x?.url.endsWith(`/${TWITTER_HANDLE.slice(1)}`)).toBe(true);
  });

  test("absoluteUrl prefixes the www host and leaves absolute URLs alone", () => {
    expect(absoluteUrl("/og/default.jpg")).toBe(`${HOST}/og/default.jpg`);
    expect(absoluteUrl("covers/a.png")).toBe(`${HOST}/covers/a.png`);
    expect(absoluteUrl("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png",
    );
    expect(absoluteUrl("//cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png",
    );
    expect(absoluteUrl("  ")).toBe("");
    expect(absoluteUrl(undefined as unknown as string)).toBe("");
  });

  test("the default share image is a 1200x630 JPEG of at most 300 KB", () => {
    expect(DEFAULT_OG_IMAGE_SIZE).toEqual({
      width: 1200,
      height: 630,
      type: "image/jpeg",
    });
    const file = join(ROOT, "public", DEFAULT_OG_IMAGE);
    expect(statSync(file).size).toBeLessThanOrEqual(300 * 1024);
    const bytes = readFileSync(file);
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  });

  test("og:image:alt exists per language and carries the name and the role", () => {
    for (const locale of LOCALES) {
      expect(ogImage[locale].alt).toBe(
        "Cengizhan Köse — Senior Fullstack Engineer",
      );
    }
  });
});

describe("Open Graph on static pages (SEO-06 hedef durum)", () => {
  test.each([...LOCALES])(
    "%s: every indexable page has the full og set",
    (locale) => {
      for (const path of INDEXABLE_PATHS) {
        const meta = getPageMeta(matchRoute(path), locale);
        expect(meta.og, `${locale} ${path}`).toMatchObject({
          type: "website",
          siteName: "Cengizhan Köse",
          locale: OG_LOCALE[locale],
          title: meta.title,
          description: meta.description,
          url: meta.canonical,
          image: {
            url: `${HOST}/og/default.jpg`,
            width: 1200,
            height: 630,
            type: "image/jpeg",
            alt: ogImage[locale].alt,
          },
        });
        expect(meta.og.article).toBeUndefined();
        expect(meta.twitter).toEqual({
          card: "summary_large_image",
          site: "@cengzhnkse",
          creator: "@cengzhnkse",
        });
      }
    },
  );

  test.each([...LOCALES])(
    "%s: og:url is the canonical and og:title is unique per page",
    (locale) => {
      const titles: string[] = [];
      for (const path of INDEXABLE_PATHS) {
        const meta = getPageMeta(matchRoute(path), locale);
        expect(meta.og.url).toBe(canonicalUrl(path, locale));
        titles.push(meta.og.title);
      }
      expect(new Set(titles).size).toBe(titles.length);
    },
  );

  test("the image URL is absolute www", () => {
    const meta = getPageMeta(matchRoute("/"), "en");
    expect(meta.og.image.url).toMatch(/^https:\/\/www\.cengizhankose\.com\//);
  });

  test("no counterpart live: no og:locale:alternate (EN-only statics today)", () => {
    for (const locale of LOCALES) {
      for (const path of INDEXABLE_PATHS) {
        expect(
          getPageMeta(matchRoute(path), locale, {}, EN_ONLY).og.localeAlternate,
        ).toEqual([]);
      }
    }
  });

  test("both languages live: og:locale is the page's, og:locale:alternate the other one", () => {
    const en = getPageMeta("/about", "en", {}, ALL_LIVE);
    expect(en.og.locale).toBe("en_US");
    expect(en.og.localeAlternate).toEqual(["tr_TR"]);
    const tr = getPageMeta("/tr/about", "tr", {}, ALL_LIVE);
    expect(tr.og.locale).toBe("tr_TR");
    expect(tr.og.localeAlternate).toEqual(["en_US"]);
    const trHome = getPageMeta("/tr", "tr", {}, ALL_LIVE);
    expect(trHome.og.url).toBe(`${HOST}/tr`);
    expect(trHome.og.localeAlternate).toEqual(["en_US"]);
  });

  test("x-default is never turned into an og:locale:alternate", () => {
    const meta = getPageMeta("/", "en", {}, ALL_LIVE);
    expect(
      meta.alternates.map((entry: { hreflang: string }) => entry.hreflang),
    ).toContain("x-default");
    expect(meta.og.localeAlternate).toEqual(["tr_TR"]);
  });

  test("og:title and og:description are the page's own title and description", () => {
    const tr = getPageMeta(matchRoute("/about"), "tr");
    expect(tr.og.title).toBe("Hakkımda | Cengizhan Köse");
    expect(tr.og.description).toBe(tr.description);
    expect(tr.og.locale).toBe("tr_TR");
  });

  test("noindex, 404 and loading pages print no share card", () => {
    const empty = { canonical: null, og: null, twitter: null, jsonLd: null };
    expect(getPageMeta(matchRoute("/portfolio"), "en")).toMatchObject(empty);
    expect(getPageMeta(matchRoute("/nope"), "en")).toMatchObject(empty);
    expect(
      getPageMeta(matchRoute("/about"), "en", { notFound: true }),
    ).toMatchObject(empty);
    expect(
      getPageMeta(matchRoute("/blog/a-post"), "en", { post: null }),
    ).toMatchObject(empty);
    expect(
      getPageMeta(matchRoute("/blog/a-post"), "en", { notFound: true }),
    ).toMatchObject(empty);
  });
});

describe("Open Graph on posts (SEO-06 step 2 and step 4)", () => {
  const route = matchRoute("/tr/blog/atlas-steward");

  test("type article, the post's language, title, description and url", () => {
    const meta = getPageMeta(route, "tr", { post: post() });
    expect(meta.og).toMatchObject({
      type: "article",
      locale: "tr_TR",
      localeAlternate: [],
      title: "Atlas Steward: Yarım İşi Yakalayan Sistem | Cengizhan Köse",
      description: "Sohbetlerde yarım kalan işleri yakalayan yerel sistem.",
      url: `${HOST}/tr/blog/atlas-steward`,
    });
    expect(meta.og.url).toBe(meta.canonical);
  });

  test("no cover: the default image with its size and the language's alt", () => {
    const meta = getPageMeta(route, "tr", { post: post() });
    expect(meta.og.image).toEqual({
      url: `${HOST}/og/default.jpg`,
      width: 1200,
      height: 630,
      type: "image/jpeg",
      alt: ogImage.tr.alt,
    });
  });

  test("a relative cover becomes absolute; size and type are not invented", () => {
    const meta = getPageMeta(route, "tr", {
      post: post({ coverImage: "/img/posts/atlas.png" }),
    });
    expect(meta.og.image).toEqual({
      url: `${HOST}/img/posts/atlas.png`,
      alt: "Atlas Steward",
    });
  });

  test("an absolute cover is kept as it is", () => {
    const meta = getPageMeta(route, "tr", {
      post: post({ coverImage: "https://cdn.example.com/atlas.webp" }),
    });
    expect(meta.og.image.url).toBe("https://cdn.example.com/atlas.webp");
  });

  test("article times are ISO; published falls back to createdAt; modified to published", () => {
    const full = getPageMeta(route, "tr", { post: post() }, EN_ONLY);
    expect(full.og.article).toEqual({
      publishedTime: "2026-07-02T09:30:00.000Z",
      modifiedTime: "2026-07-05T12:00:00.000Z",
      author: `${HOST}/about`,
    });

    const older = getPageMeta(
      route,
      "tr",
      { post: post({ publishedAt: null, updatedAt: null }) },
      EN_ONLY,
    );
    expect(older.og.article).toEqual({
      publishedTime: "2026-07-01T08:00:00.000Z",
      modifiedTime: "2026-07-01T08:00:00.000Z",
      author: `${HOST}/about`,
    });

    const undated = getPageMeta(
      route,
      "tr",
      {
        post: post({
          createdAt: undefined,
          publishedAt: null,
          updatedAt: null,
        }),
      },
      EN_ONLY,
    );
    expect(undated.og.article).toEqual({ author: `${HOST}/about` });
  });

  test("article:author is the About page of the post's language (EN until TR opens)", () => {
    expect(
      getPageMeta(route, "tr", { post: post() }, EN_ONLY).og.article.author,
    ).toBe(`${HOST}/about`);
    expect(
      getPageMeta(route, "tr", { post: post() }, ALL_LIVE).og.article.author,
    ).toBe(`${HOST}/tr/about`);
    const en = getPageMeta(matchRoute("/blog/a-post"), "en", {
      post: post({ slug: "a-post", lang: "en" }),
    });
    expect(en.og.article.author).toBe(`${HOST}/about`);
  });

  test("og:locale:alternate only where the post has a published translation", () => {
    const alone = getPageMeta(route, "tr", { post: post() });
    expect(alone.og.localeAlternate).toEqual([]);

    const paired = getPageMeta(route, "tr", {
      post: post({ translations: [{ lang: "en", slug: "atlas-steward-en" }] }),
    });
    expect(paired.og.locale).toBe("tr_TR");
    expect(paired.og.localeAlternate).toEqual(["en_US"]);

    const reverse = getPageMeta(matchRoute("/blog/atlas-steward-en"), "en", {
      post: post({
        slug: "atlas-steward-en",
        lang: "en",
        translations: [{ lang: "tr", slug: "atlas-steward" }],
      }),
    });
    expect(reverse.og.locale).toBe("en_US");
    expect(reverse.og.localeAlternate).toEqual(["tr_TR"]);
  });

  test("the post's language decides og:locale, not the URL prefix", () => {
    const meta = getPageMeta(matchRoute("/blog/atlas-steward"), "en", {
      post: post(),
    });
    expect(meta.og.locale).toBe("tr_TR");
  });

  test("a hostile title is data, not markup: it stays a plain string", () => {
    const meta = getPageMeta(route, "tr", {
      post: post({ title: '<script>alert(1)</script> "x"', seoTitle: null }),
    });
    expect(meta.og.title).toBe(
      '<script>alert(1)</script> "x" | Cengizhan Köse',
    );
    expect(typeof meta.og.title).toBe("string");
  });
});

describe("socialTags (the list printed into the head)", () => {
  test("a static page: the og, image and Twitter tags in a fixed order", () => {
    const tags = tagsOf(getPageMeta(matchRoute("/about"), "en", {}, EN_ONLY));
    expect(tags.map((tag) => tag.key)).toEqual([
      "og:type",
      "og:site_name",
      "og:locale",
      "og:title",
      "og:description",
      "og:url",
      "og:image",
      "og:image:width",
      "og:image:height",
      "og:image:type",
      "og:image:alt",
      "twitter:card",
      "twitter:site",
      "twitter:creator",
    ]);
    for (const tag of tags) {
      expect(tag.attribute).toBe(
        tag.key.startsWith("twitter:") ? "name" : "property",
      );
      expect(tag.content).not.toBe("");
    }
    expect(valuesOf(tags, "og:image:width")).toEqual(["1200"]);
    expect(valuesOf(tags, "og:image:height")).toEqual(["630"]);
  });

  test("a post adds article:* and uses property for them", () => {
    const tags = tagsOf(
      getPageMeta(matchRoute("/tr/blog/atlas-steward"), "tr", { post: post() }),
    );
    const article = tags.filter((tag) => tag.key.startsWith("article:"));
    expect(article.map((tag) => tag.key)).toEqual([
      "article:published_time",
      "article:modified_time",
      "article:author",
    ]);
    expect(article.every((tag) => tag.attribute === "property")).toBe(true);
  });

  test("og:locale:alternate repeats once per other language", () => {
    const tags = tagsOf(
      getPageMeta(matchRoute("/tr/blog/atlas-steward"), "tr", {
        post: post({
          translations: [{ lang: "en", slug: "atlas-steward-en" }],
        }),
      }),
    );
    expect(valuesOf(tags, "og:locale")).toEqual(["tr_TR"]);
    expect(valuesOf(tags, "og:locale:alternate")).toEqual(["en_US"]);
  });

  test("SEO-06 criteria on a post: the five og tags once each, article, one Twitter card, distinct counts", () => {
    const tags = tagsOf(
      getPageMeta(matchRoute("/tr/blog/atlas-steward"), "tr", { post: post() }),
    );
    const five = tags.filter((tag) =>
      /^og:(type|title|description|url|image)$/.test(tag.key),
    );
    expect(five).toHaveLength(5);
    expect(valuesOf(tags, "og:type")).toEqual(["article"]);
    expect(valuesOf(tags, "og:locale")).toEqual(["tr_TR"]);
    expect(valuesOf(tags, "twitter:card")).toEqual(["summary_large_image"]);
    // MKT-06: six distinct og properties describe the page.
    const six = new Set(
      tags
        .map((tag) => tag.key)
        .filter((key) =>
          /^og:(title|description|image|url|type|locale)$/.test(key),
        ),
    );
    expect(six.size).toBe(6);
    expect(valuesOf(tags, "og:title")[0]).toContain("Atlas Steward");
  });

  test("no tag key appears twice except og:locale:alternate", () => {
    const pages = [
      getPageMeta(matchRoute("/"), "en"),
      getPageMeta(matchRoute("/tr/blog/atlas-steward"), "tr", {
        post: post({
          translations: [{ lang: "en", slug: "atlas-steward-en" }],
        }),
      }),
    ];
    for (const meta of pages) {
      const keys = tagsOf(meta)
        .map((tag) => tag.key)
        .filter((key) => key !== "og:locale:alternate");
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  test("no share card, no tags (404, noindex, loading, partial input)", () => {
    expect(tagsOf(getPageMeta(matchRoute("/nope"), "en"))).toEqual([]);
    expect(tagsOf(getPageMeta(matchRoute("/portfolio"), "en"))).toEqual([]);
    expect(tagsOf(null)).toEqual([]);
    expect(tagsOf({})).toEqual([]);
    expect(tagsOf({ title: "x" })).toEqual([]);
  });

  test("empty values are skipped, numbers are stringified", () => {
    const tags = tagsOf({
      og: {
        type: "website",
        title: "",
        image: { url: "https://x.test/a.jpg", width: 10, height: null },
      },
      twitter: { card: "summary_large_image", site: undefined },
    });
    expect(tags).toEqual([
      { attribute: "property", key: "og:type", content: "website" },
      {
        attribute: "property",
        key: "og:image",
        content: "https://x.test/a.jpg",
      },
      { attribute: "property", key: "og:image:width", content: "10" },
      {
        attribute: "name",
        key: "twitter:card",
        content: "summary_large_image",
      },
    ]);
  });
});
