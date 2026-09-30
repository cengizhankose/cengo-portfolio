/**
 * SEO-04: self-referencing canonical and URL normalisation.
 *
 * canonicalUrl() is the one normal form of a page URL: absolute, www (K-03),
 * no query or hash, no trailing slash (the EN root keeps its one), lower case.
 * getPageMeta() gives every indexable page exactly one canonical pointing at
 * itself, in its own language (T-12), and none to 404s, noindex pages and a
 * post that has not loaded. The raw-HTML and curl criteria of SEO-04 are
 * checked after W7 prints this value into the first HTML.
 */
import { describe, expect, test } from "bun:test";
import { ALL_LIVE, matchRoute, STATIC_PATHS } from "../../../src/seo/routes.js";
import { LOCALES, SITE_URL } from "../../../src/seo/site.js";
import {
  alternatesFor,
  canonicalUrl,
  getMeta as getPageMeta,
  localePath,
  routePathname,
} from "./loose";

const HOST = "https://www.cengizhankose.com";
const NOINDEX_PATHS = ["/portfolio"];
const INDEXABLE_PATHS = STATIC_PATHS.filter(
  (path) => !NOINDEX_PATHS.includes(path),
);

const post = (over: Record<string, unknown> = {}) => ({
  slug: "atlas-steward",
  lang: "tr",
  title: "Atlas Steward",
  excerpt: "Özet",
  ...over,
});

describe("canonicalUrl (SEO-04 step 1 / step 4)", () => {
  test("the plan's examples", () => {
    expect(canonicalUrl("/about/", "en")).toBe(`${HOST}/about`);
    expect(canonicalUrl("/", "en")).toBe(`${HOST}/`);
    expect(canonicalUrl("/", "tr")).toBe(`${HOST}/tr`);
    expect(canonicalUrl("/about", "tr")).toBe(`${HOST}/tr/about`);
    expect(canonicalUrl("/blog/atlas-steward", "tr")).toBe(
      `${HOST}/tr/blog/atlas-steward`,
    );
  });

  test("the host is www (K-03) and is SITE_URL", () => {
    expect(SITE_URL).toBe(HOST);
    for (const locale of LOCALES) {
      for (const path of STATIC_PATHS) {
        expect(canonicalUrl(path, locale).startsWith(`${HOST}/`)).toBe(true);
      }
    }
  });

  test("upper case is lowered", () => {
    expect(canonicalUrl("/ABOUT", "en")).toBe(`${HOST}/about`);
    expect(canonicalUrl("/Blog/Atlas-Steward", "tr")).toBe(
      `${HOST}/tr/blog/atlas-steward`,
    );
  });

  test("query and hash are dropped", () => {
    expect(canonicalUrl("/about?utm_source=x", "en")).toBe(`${HOST}/about`);
    expect(canonicalUrl("/about#team", "en")).toBe(`${HOST}/about`);
    expect(canonicalUrl("/about/?a=1#b", "tr")).toBe(`${HOST}/tr/about`);
    expect(canonicalUrl("/?ref=home", "en")).toBe(`${HOST}/`);
    expect(canonicalUrl("/?ref=home", "tr")).toBe(`${HOST}/tr`);
  });

  test("trailing slashes are dropped, the EN root keeps its own", () => {
    expect(canonicalUrl("/contact//", "en")).toBe(`${HOST}/contact`);
    expect(canonicalUrl("/tr", "en")).toBe(`${HOST}/tr`);
    expect(canonicalUrl("", "en")).toBe(`${HOST}/`);
    expect(canonicalUrl(undefined as unknown as string, "tr")).toBe(
      `${HOST}/tr`,
    );
  });

  test("an unknown locale falls back to the default language", () => {
    expect(canonicalUrl("/about", "de")).toBe(`${HOST}/about`);
    expect(canonicalUrl("/about", undefined as unknown as string)).toBe(
      `${HOST}/about`,
    );
  });

  test("it is the route table's normal form (SEO-02): host + routePathname", () => {
    for (const locale of LOCALES) {
      for (const path of STATIC_PATHS) {
        const route = { type: "static", locale, path };
        const normal = routePathname(route) as string;
        // The server redirects to routePathname(); the canonical is the same
        // URL, except that the EN root keeps "/" in both.
        expect(canonicalUrl(path, locale)).toBe(`${HOST}${normal}`);
      }
      const postRoute = matchRoute(
        localePath(locale, "/blog/a-post"),
        ALL_LIVE,
      );
      expect(canonicalUrl("/blog/a-post", locale)).toBe(
        `${HOST}${routePathname(postRoute)}`,
      );
    }
  });

  test("no output has a query, a hash, upper case or a double slash after the host", () => {
    for (const locale of LOCALES) {
      for (const input of [
        "/",
        "/about/",
        "/ABOUT?x=1",
        "/blog/Some-Post#top",
        "/contact//",
      ]) {
        const url = canonicalUrl(input, locale);
        expect(url).not.toMatch(/[?#]/);
        expect(url.slice(HOST.length)).not.toMatch(/\/\/|[A-Z]/);
        expect(url).toMatch(/^https:\/\/www\.cengizhankose\.com\//);
      }
    }
  });
});

describe("getPageMeta canonical on static pages (SEO-04 step 2)", () => {
  test.each([...LOCALES])(
    "%s: every indexable page has its own canonical, equal to canonicalUrl(path, locale)",
    (locale) => {
      for (const path of INDEXABLE_PATHS) {
        const meta = getPageMeta(matchRoute(path), locale);
        expect(meta.canonical, `${locale} ${path}`).toBe(
          canonicalUrl(path, locale),
        );
      }
    },
  );

  test("EN root keeps the slash, TR root has none (acceptance criterion 1)", () => {
    expect(getPageMeta(matchRoute("/"), "en").canonical).toBe(`${HOST}/`);
    expect(getPageMeta(matchRoute("/"), "tr").canonical).toBe(`${HOST}/tr`);
    expect(getPageMeta(matchRoute("/about"), "en").canonical).toBe(
      `${HOST}/about`,
    );
    expect(getPageMeta(matchRoute("/about"), "tr").canonical).toBe(
      `${HOST}/tr/about`,
    );
  });

  test("each language page points at itself; the two languages never share one", () => {
    for (const path of INDEXABLE_PATHS) {
      const en = getPageMeta(matchRoute(path), "en").canonical;
      const tr = getPageMeta(matchRoute(path), "tr").canonical;
      expect(en).not.toBe(tr);
    }
  });

  test("the canonical of a page is among its hreflang hrefs, so hreflang is not ignored", () => {
    for (const locale of LOCALES) {
      for (const path of INDEXABLE_PATHS) {
        const route = { type: "static", locale, path };
        const hrefs = alternatesFor(route, {}, ALL_LIVE).map(
          (entry: { href: string }) => entry.href,
        );
        expect(hrefs.length).toBeGreaterThan(0);
        expect(hrefs).toContain(canonicalUrl(path, locale));
      }
    }
  });

  test("the query of the request never reaches the canonical", () => {
    const route = matchRoute("/about?utm_source=x");
    expect(getPageMeta(route, "en").canonical).toBe(`${HOST}/about`);
    expect(getPageMeta("/about?utm_source=x#t", "en").canonical).toBe(
      `${HOST}/about`,
    );
  });

  test("a noindex page has no canonical (T-10 portfolio)", () => {
    for (const locale of LOCALES) {
      const meta = getPageMeta(matchRoute("/portfolio"), locale);
      expect(meta.robots).toBe("noindex, follow");
      expect(meta.canonical).toBeNull();
    }
  });

  test("404 pages have no canonical (unknown path, post 404, forced notFound)", () => {
    expect(getPageMeta(matchRoute("/no-such-page"), "en").canonical).toBeNull();
    expect(
      getPageMeta(matchRoute("/tr/no-such-page"), "tr").canonical,
    ).toBeNull();
    expect(
      getPageMeta(matchRoute("/about"), "en", { notFound: true }).canonical,
    ).toBeNull();
    expect(
      getPageMeta(matchRoute("/blog/x-y"), "en", { notFound: true }).canonical,
    ).toBeNull();
  });

  test("a language that is not open yet has no page, so no canonical (route not live)", () => {
    // /tr/about is a 404 until LIVE.static gains 'tr' (SEO-11 Adım B).
    expect(getPageMeta("/tr/about", "tr").canonical).toBeNull();
    // After the flip the same call gives the TR page its own URL.
    expect(getPageMeta("/tr/about", "tr", {}, ALL_LIVE).canonical).toBe(
      `${HOST}/tr/about`,
    );
    expect(getPageMeta("/tr", "tr", {}, ALL_LIVE).canonical).toBe(`${HOST}/tr`);
  });
});

describe("getPageMeta canonical on posts (SEO-04 step 2)", () => {
  test("a TR post points at its /tr/blog path", () => {
    const meta = getPageMeta(matchRoute("/tr/blog/atlas-steward"), "tr", {
      post: post(),
    });
    expect(meta.canonical).toBe(`${HOST}/tr/blog/atlas-steward`);
  });

  test("an EN post points at its own unprefixed path", () => {
    const meta = getPageMeta(matchRoute("/blog/atlas-steward-en"), "en", {
      post: post({ slug: "atlas-steward-en", lang: "en" }),
    });
    expect(meta.canonical).toBe(`${HOST}/blog/atlas-steward-en`);
  });

  test("the post's language decides, not the URL prefix it was opened under (T-12)", () => {
    // The old URL /blog/<tr-slug> is answered with a 301 by the server; while
    // the client still shows it the canonical is already the final one.
    const meta = getPageMeta(matchRoute("/blog/atlas-steward"), "en", {
      post: post(),
    });
    expect(meta.lang).toBe("tr");
    expect(meta.canonical).toBe(`${HOST}/tr/blog/atlas-steward`);
  });

  test("a post without its own language uses the route's language", () => {
    const meta = getPageMeta(matchRoute("/tr/blog/atlas-steward"), "tr", {
      post: post({ lang: undefined }),
    });
    expect(meta.canonical).toBe(`${HOST}/tr/blog/atlas-steward`);
  });

  test("the canonical of a post with a translation is in its hreflang set", () => {
    const data = {
      post: post({
        translations: [{ lang: "en", slug: "atlas-steward-en" }],
      }),
    };
    const meta = getPageMeta(matchRoute("/tr/blog/atlas-steward"), "tr", data);
    const hrefs = meta.alternates.map((entry: { href: string }) => entry.href);
    expect(hrefs).toContain(meta.canonical);
  });

  test("a post that is still loading has no canonical (the blog's would be wrong)", () => {
    const meta = getPageMeta(matchRoute("/tr/blog/atlas-steward"), "tr", {
      post: null,
    });
    expect(meta.canonical).toBeNull();
  });

  test("a post 404 has no canonical", () => {
    const meta = getPageMeta(matchRoute("/tr/blog/atlas-steward"), "tr", {
      notFound: true,
    });
    expect(meta.canonical).toBeNull();
  });

  test("an uppercase or query-carrying slug input still yields the normal form", () => {
    const meta = getPageMeta(matchRoute("/tr/blog/atlas-steward?x=1"), "tr", {
      post: post(),
    });
    expect(meta.canonical).toBe(`${HOST}/tr/blog/atlas-steward`);
  });
});
