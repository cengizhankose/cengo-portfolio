/**
 * One head mechanism (T-03, SEO-01 "no duplicate tags"): the head the server
 * prints and the one usePageMeta writes in the browser are the same. The page
 * the server sent is loaded into jsdom and the client's applyPageMeta() runs
 * with the same getPageMeta() values: the head must not change by a single
 * character (every tag is found and reused in place), and a route change
 * leaves one of each tag, never a second copy.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { applyPageMeta, setCanonical } from "../../../src/seo/usePageMeta.js";
import { displayLocale } from "../../../src/seo/pages.js";
import { matchRoute } from "../../../src/seo/routes.js";
import { getMeta } from "../seo/loose";
import { count, EN_POST, fakeQueries, siteWith, TR_POST } from "./helpers";

const site = siteWith(fakeQueries());

let dom: JSDOM | null = null;
const globals = globalThis as { document?: Document };

/** The page the server sends for `path`, parsed (scripts do not run). */
async function load(path: string) {
  const html = await (await site.request(path)).text();
  dom = new JSDOM(html);
  globals.document = dom.window.document;
  return dom.window.document;
}

afterEach(() => {
  delete globals.document;
  dom?.window.close();
  dom = null;
});

const head = (document: Document) => document.head.innerHTML;

const CASES: [string, string, object][] = [
  ["/", "en", {}],
  ["/about", "en", {}],
  ["/contact", "en", {}],
  ["/portfolio", "en", {}],
  ["/blog", "en", {}],
  ["/blog/hello-world", "en", { post: EN_POST }],
  ["/tr/blog/merhaba-dunya", "tr", { post: TR_POST }],
];

describe("the client leaves the server's head as it is", () => {
  test.each(CASES)("%s", async (path, locale, data) => {
    const document = await load(path);
    const before = head(document);
    const langBefore = document.documentElement.lang;
    const route = matchRoute(path);
    applyPageMeta(getMeta(route, locale, data));
    expect(head(document)).toBe(before);
    expect(document.documentElement.lang).toBe(langBefore);
  });

  test("the 404 pages too", async () => {
    for (const [path, post] of [
      ["/olmayan-sayfa", false],
      ["/blog/yok-boyle-bir-yazi", true],
      ["/tr/blog/yok-boyle-bir-yazi", true],
    ] as const) {
      const document = await load(path);
      const before = head(document);
      const route = matchRoute(path);
      const locale = post ? route.locale : displayLocale(route);
      applyPageMeta(getMeta(route, locale, { notFound: true }));
      expect(head(document), path).toBe(before);
    }
  });
});

describe("a route change ends with one of each tag", () => {
  const managed = (document: Document) => ({
    titles: document.querySelectorAll("title").length,
    descriptions: document.querySelectorAll('meta[name="description"]').length,
    canonicals: document.querySelectorAll('link[rel="canonical"]').length,
    hreflang: document.querySelectorAll('link[rel="alternate"][hreflang]')
      .length,
    ogTitles: document.querySelectorAll('meta[property="og:title"]').length,
    ogUrls: document.querySelectorAll('meta[property="og:url"]').length,
    twitter: document.querySelectorAll('meta[name="twitter:card"]').length,
    jsonLd: document.querySelectorAll('script[type="application/ld+json"]')
      .length,
  });

  test("post -> home -> about: no post tags left, never two canonicals", async () => {
    const document = await load("/blog/hello-world");
    expect(managed(document).hreflang).toBe(3);

    applyPageMeta(getMeta(matchRoute("/"), "en", {}));
    expect(managed(document)).toEqual({
      titles: 1,
      descriptions: 1,
      canonicals: 1,
      hreflang: 3, // en, tr and x-default: the TR home is open since W11
      ogTitles: 1,
      ogUrls: 1,
      twitter: 1,
      jsonLd: 1,
    });
    expect(
      document.querySelector('link[rel="canonical"]')!.getAttribute("href"),
    ).toBe("https://www.cengizhankose.com/");
    expect(
      document.querySelector('script[type="application/ld+json"]')!.textContent,
    ).toContain('"Person"');
    expect(
      document.querySelector('meta[property="article:author"]'),
    ).toBeNull();

    applyPageMeta(getMeta(matchRoute("/about"), "en", {}));
    expect(managed(document).jsonLd).toBe(0);
    expect(managed(document).canonicals).toBe(1);
    expect(document.title).toBe("About | Cengizhan Köse");
  });

  test("the preload hint in the head is left alone by the client", async () => {
    const document = await load("/");
    applyPageMeta(getMeta(matchRoute("/about"), "en", {}));
    expect(
      document.querySelectorAll('link[rel="preload"][as="image"]'),
    ).toHaveLength(1);
  });

  // The portfolio was the noindex example until W8 (T-10 exit); a 404 is
  // noindex for good.
  test("a noindex page drops the tags the previous page left", async () => {
    const document = await load("/about");
    applyPageMeta(getMeta(matchRoute("/no-such-page"), "en", {}));
    const counts = managed(document);
    expect(counts.canonicals).toBe(0);
    expect(counts.ogTitles).toBe(0);
    expect(
      document.querySelector('meta[name="robots"]')!.getAttribute("content"),
    ).toBe("noindex");
  });
});

describe("why the post must be there on the first client render (W6 handoff)", () => {
  test("while a post is 'loading' its rich tags would be stripped; with the post they stay", async () => {
    const document = await load("/blog/hello-world");
    const withPost = head(document);

    // A first render without the post (no swr fallback) would remove them...
    applyPageMeta(getMeta(matchRoute("/blog/hello-world"), "en", {}));
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(head(document)).not.toBe(withPost);
  });

  test("...which is why main.jsx gives swr the server's data: with the post it is a no-op", async () => {
    const document = await load("/blog/hello-world");
    const before = head(document);
    applyPageMeta(
      getMeta(matchRoute("/blog/hello-world"), "en", { post: EN_POST }),
    );
    expect(head(document)).toBe(before);
    expect(count(head(document), /rel="canonical"/g)).toBe(1);
  });
});

test("setCanonical reuses the server's link", async () => {
  const document = await load("/about");
  setCanonical("https://www.cengizhankose.com/about");
  expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
});
