/**
 * SEO-11 Adım A (T-12): language paths, the language a page is shown in,
 * hreflang alternates and the canonical path of a route. Pure functions, no
 * database (plan step 8). The server's 301 for a post opened under the other
 * language's prefix is covered in post-404.test.ts.
 */
import { describe, expect, test } from "bun:test";
import {
  alternatesFor,
  displayLocale,
  getPageMeta,
  localePath,
  routePathname,
  SITE_URL,
  staticLocale,
} from "../../../src/seo/pages.js";
import { ALL_LIVE, LIVE, matchRoute } from "../../../src/seo/routes.js";

const WWW = "https://www.cengizhankose.com";
// The route table as it was before W11 opened the TR pages (rollback shape).
const EN_ONLY = { static: ["en"], post: ["en", "tr"] };

// A published EN/TR pair sharing one translation_key, as the API returns it.
const EN_POST = {
  slug: "hello-world",
  title: "Hello",
  lang: "en",
  translationKey: "hello-world",
  translations: [{ lang: "tr", slug: "merhaba-dunya" }],
};
const TR_POST = {
  slug: "merhaba-dunya",
  title: "Merhaba",
  lang: "tr",
  translationKey: "hello-world",
  translations: [{ lang: "en", slug: "hello-world" }],
};
const PAIR = [
  { hreflang: "en", href: `${WWW}/blog/hello-world` },
  { hreflang: "tr", href: `${WWW}/tr/blog/merhaba-dunya` },
  { hreflang: "x-default", href: `${WWW}/blog/hello-world` },
];

describe("language paths (T-12)", () => {
  test("EN has no prefix, TR is under /tr", () => {
    expect(localePath("en", "/")).toBe("/");
    expect(localePath("en", "/about")).toBe("/about");
    expect(localePath("tr", "/")).toBe("/tr");
    expect(localePath("tr", "/about")).toBe("/tr/about");
    expect(localePath("tr", "/blog/merhaba-dunya")).toBe(
      "/tr/blog/merhaba-dunya",
    );
  });

  test("unknown languages fall back to EN; a missing leading slash is added", () => {
    expect(localePath("de", "/about")).toBe("/about");
    expect(localePath(undefined, "/blog")).toBe("/blog");
    expect(localePath("tr", "blog")).toBe("/tr/blog");
  });

  test("links to static pages stay on live languages (staticLocale)", () => {
    expect(staticLocale("en")).toBe("en");
    expect(staticLocale("tr")).toBe("tr"); // TR pages open since W11
    expect(staticLocale("tr", EN_ONLY)).toBe("en");
    expect(staticLocale("de", ALL_LIVE)).toBe("en");
  });

  test("the back link of the TR post is /tr/blog since the TR pages are open, /blog if they close (step 6)", () => {
    expect(localePath(staticLocale("tr"), "/blog")).toBe("/tr/blog");
    expect(localePath(staticLocale("tr", EN_ONLY), "/blog")).toBe("/blog");
  });
});

describe("the language a page is shown in (displayLocale)", () => {
  test("a live route is shown in its own language", () => {
    expect(displayLocale(matchRoute("/about"))).toBe("en");
    expect(displayLocale(matchRoute("/tr/blog/x"))).toBe("tr");
  });

  test("a 404 under /tr is TR since the TR pages are open, EN if they close (SEO-02 step 4)", () => {
    expect(displayLocale(matchRoute("/tr/yok"))).toBe("tr");
    expect(displayLocale(matchRoute("/tr/about"))).toBe("tr");
    expect(displayLocale(matchRoute("/tr/yok", EN_ONLY), EN_ONLY)).toBe("en");
    expect(displayLocale(matchRoute("/nope"))).toBe("en");
  });

  test("the 404 meta follows it", () => {
    const route = matchRoute("/tr/yok");
    expect(
      getPageMeta(route, displayLocale(route), { notFound: true }),
    ).toMatchObject({ title: "Sayfa bulunamadı | Cengizhan Köse", lang: "tr" });
    const closed = matchRoute("/tr/yok", EN_ONLY);
    expect(
      getPageMeta(closed, displayLocale(closed, EN_ONLY), { notFound: true }),
    ).toMatchObject({ title: "Page not found | Cengizhan Köse", lang: "en" });
  });

  test("a missing TR post gets the TR post-not-found meta (SEO-08)", () => {
    const route = matchRoute("/tr/blog/bu-yazi-yok");
    expect(
      getPageMeta(route, displayLocale(route), { notFound: true }),
    ).toMatchObject({
      title: "Yazı bulunamadı | Cengizhan Köse",
      robots: "noindex",
      lang: "tr",
      alternates: [],
    });
  });
});

describe("hreflang alternates (SEO-11 step 4)", () => {
  test("absolute www URLs (K-03)", () => {
    expect(SITE_URL).toBe(WWW);
  });

  test("an EN/TR pair: the same set on both pages, x-default = EN", () => {
    const en = alternatesFor(matchRoute("/blog/hello-world"), {
      post: EN_POST,
    });
    const tr = alternatesFor(matchRoute("/tr/blog/merhaba-dunya"), {
      post: TR_POST,
    });
    expect(en).toEqual(PAIR);
    expect(tr).toEqual(PAIR);
  });

  test("each page is in its own set (self-reference) and the pair is reciprocal", () => {
    const en = alternatesFor("/blog/hello-world", { post: EN_POST });
    expect(en.map((a) => a.href)).toContain(`${WWW}/blog/hello-world`);
    expect(en.map((a) => a.href)).toContain(`${WWW}/tr/blog/merhaba-dunya`);
  });

  test("getPageMeta carries the alternates of a post", () => {
    expect(
      getPageMeta(matchRoute("/blog/hello-world"), "en", { post: EN_POST })
        .alternates,
    ).toEqual(PAIR);
  });

  test("a post without a translation has no alternates", () => {
    const post = {
      slug: "atlas-steward",
      title: "T",
      lang: "tr",
      translations: [],
    };
    expect(
      alternatesFor(matchRoute("/tr/blog/atlas-steward"), { post }),
    ).toEqual([]);
    expect(
      alternatesFor(matchRoute("/tr/blog/atlas-steward"), {
        post: { ...post, translations: undefined },
      }),
    ).toEqual([]);
  });

  test("a loading or missing post and 404s have no alternates", () => {
    expect(alternatesFor(matchRoute("/blog/hello-world"), {})).toEqual([]);
    expect(
      alternatesFor(matchRoute("/blog/hello-world"), {
        post: EN_POST,
        notFound: true,
      }),
    ).toEqual([]);
    expect(alternatesFor(matchRoute("/nope"))).toEqual([]);
    expect(getPageMeta("/nope", "en").alternates).toEqual([]);
  });

  test("broken translation rows are ignored (unknown language, bad slug, duplicate)", () => {
    const post = {
      ...EN_POST,
      translations: [
        { lang: "de", slug: "hallo-welt" },
        { lang: "tr", slug: "Bad Slug" },
        { lang: "en", slug: "other-en" },
      ],
    };
    expect(alternatesFor("/blog/hello-world", { post })).toEqual([]);
  });

  test("static pages: none if only EN is live (rollback shape)", () => {
    expect([...LIVE.static]).toEqual(["en", "tr"]); // open since W11
    for (const path of ["/", "/about", "/contact", "/blog"]) {
      expect(alternatesFor(matchRoute(path, EN_ONLY), {}, EN_ONLY)).toEqual([]);
      expect(
        getPageMeta(matchRoute(path, EN_ONLY), "en", {}, EN_ONLY).alternates,
      ).toEqual([]);
    }
  });

  test("static pages: en, tr, x-default once both languages are live (Adım B)", () => {
    expect(alternatesFor(matchRoute("/about"), {}, ALL_LIVE)).toEqual([
      { hreflang: "en", href: `${WWW}/about` },
      { hreflang: "tr", href: `${WWW}/tr/about` },
      { hreflang: "x-default", href: `${WWW}/about` },
    ]);
    const trHome = alternatesFor(matchRoute("/tr", ALL_LIVE), {}, ALL_LIVE);
    expect(trHome).toEqual([
      { hreflang: "en", href: `${WWW}/` },
      { hreflang: "tr", href: `${WWW}/tr` },
      { hreflang: "x-default", href: `${WWW}/` },
    ]);
    expect(alternatesFor(matchRoute("/"), {}, ALL_LIVE)).toEqual(trHome);
  });

  test("the portfolio has its pair since W8 (T-10 exit); noindex pages would get none", () => {
    const pair = [
      { hreflang: "en", href: `${WWW}/portfolio` },
      { hreflang: "tr", href: `${WWW}/tr/portfolio` },
      { hreflang: "x-default", href: `${WWW}/portfolio` },
    ];
    expect(alternatesFor(matchRoute("/portfolio"), {}, ALL_LIVE)).toEqual(pair);
    expect(
      alternatesFor(matchRoute("/tr/portfolio", ALL_LIVE), {}, ALL_LIVE),
    ).toEqual(pair);
    // 404 pages (noindex for good) still get none.
    expect(
      alternatesFor(matchRoute("/nope"), { notFound: true }, ALL_LIVE),
    ).toEqual([]);
  });

  test("a post language that is not open is left out", () => {
    const enOnly = { static: ["en"], post: ["en"] };
    expect(
      alternatesFor(matchRoute("/blog/hello-world"), { post: EN_POST }, enOnly),
    ).toEqual([]);
  });
});

describe("canonical path of a route (SEO-02 step 3d, SEO-11)", () => {
  test("static pages and posts, with their language prefix", () => {
    expect(routePathname(matchRoute("/"))).toBe("/");
    expect(routePathname(matchRoute("/about/"))).toBe("/about");
    expect(routePathname(matchRoute("/blog/x/"))).toBe("/blog/x");
    expect(routePathname(matchRoute("/tr/blog/x"))).toBe("/tr/blog/x");
    expect(routePathname(matchRoute("/tr/", ALL_LIVE))).toBe("/tr");
    expect(routePathname(matchRoute("/tr/about/", ALL_LIVE))).toBe("/tr/about");
  });

  test("notfound has none", () => {
    expect(routePathname(matchRoute("/nope"))).toBeNull();
    expect(routePathname(matchRoute("/tr/about", EN_ONLY))).toBeNull();
    expect(routePathname(matchRoute("/tr/yok"))).toBeNull();
    expect(routePathname(null)).toBeNull();
  });
});
