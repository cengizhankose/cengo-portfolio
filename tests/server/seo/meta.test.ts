/**
 * T-03 page meta: titles, robots and lang from getPageMeta
 * (SEO-25 step 6, SEO-10 title rules, T-07, MKT-21, DSG-33, FE-25).
 * The route list comes from src/seo/routes.js, so a new static route without
 * a registry entry fails here.
 */
import { describe, expect, test } from "bun:test";
import {
  buildHomeTitle,
  buildTitle,
  getPageMeta,
  pages,
  postDescription,
  postTitle,
  TITLE_MAX_LENGTH,
} from "../../../src/seo/pages.js";
import { matchRoute, STATIC_PATHS } from "../../../src/seo/routes.js";
import { LOCALES, SITE_NAME } from "../../../src/seo/site.js";

const HOME_TITLE = "Cengizhan Köse | Senior Fullstack Engineer";
const BRANDED = /^.+ \| Cengizhan Köse$/;
const NO_EDGE_SPACE = /^\S.*\S$/;

// DSG-33 step 2 / MKT-21 step 2 title table.
const TITLE_TABLE: Record<string, { en: string; tr: string }> = {
  "/": { en: HOME_TITLE, tr: HOME_TITLE },
  "/about": { en: "About | Cengizhan Köse", tr: "Hakkımda | Cengizhan Köse" },
  "/portfolio": {
    en: "Portfolio | Cengizhan Köse",
    tr: "Portfolyo | Cengizhan Köse",
  },
  "/contact": {
    en: "Contact | Cengizhan Köse",
    tr: "İletişim | Cengizhan Köse",
  },
  "/blog": { en: "Blog | Cengizhan Köse", tr: "Blog | Cengizhan Köse" },
};

function staticMeta(path: string, locale: string) {
  const route = matchRoute(path);
  expect(route.type).toBe("static");
  return getPageMeta(route, locale);
}

describe("static page titles (SEO-25, T-07, SEO-10)", () => {
  for (const locale of LOCALES) {
    for (const path of STATIC_PATHS) {
      test(`${locale} ${path}: non-empty, trimmed, T-07 pattern, <= 60 chars`, () => {
        const { title } = staticMeta(path, locale);
        expect(title).toMatch(NO_EDGE_SPACE);
        expect(title).not.toContain("KÖSE");
        expect(title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
        if (path === "/") {
          expect(title).toBe(HOME_TITLE);
        } else {
          expect(title).toMatch(BRANDED);
          expect(title).toMatch(/^[^|]+ \| Cengizhan Köse$/);
        }
      });
    }

    test(`${locale}: titles are unique within the locale`, () => {
      const titles = STATIC_PATHS.map((path) => staticMeta(path, locale).title);
      expect(new Set(titles).size).toBe(titles.length);
    });
  }

  test("titles equal the DSG-33 / MKT-21 table on both locales", () => {
    for (const [path, expected] of Object.entries(TITLE_TABLE)) {
      expect(staticMeta(path, "en").title).toBe(expected.en);
      expect(staticMeta(path, "tr").title).toBe(expected.tr);
      expect(pages[path].en.title).toBe(expected.en);
      expect(pages[path].tr.title).toBe(expected.tr);
    }
    expect(Object.keys(TITLE_TABLE).sort()).toEqual([...STATIC_PATHS].sort());
  });

  test("the home title carries the role from the content inputs (§2.4)", () => {
    expect(staticMeta("/", "en").title).toContain("Senior Fullstack Engineer");
    expect(staticMeta("/", "tr").title).toContain("Senior Fullstack Engineer");
  });
});

describe("robots and lang", () => {
  test("indexable static pages have no robots value", () => {
    for (const path of ["/", "/about", "/contact", "/blog"]) {
      for (const locale of LOCALES) {
        expect(staticMeta(path, locale).robots).toBeNull();
      }
    }
  });

  test("/portfolio stays noindex, follow on both locales (T-10, SEO-14)", () => {
    for (const locale of LOCALES) {
      expect(staticMeta("/portfolio", locale).robots).toBe("noindex, follow");
    }
  });

  test("unknown paths get the notFound meta with noindex (SEO-25)", () => {
    const meta = getPageMeta(matchRoute("/does-not-exist"), "en");
    expect(meta.title).toBe("Page not found | Cengizhan Köse");
    expect(meta.robots).toBe("noindex");
    expect(pages.notFound.en.robots).toBe("noindex");
    expect(pages.notFound.tr.robots).toBe("noindex");
    expect(getPageMeta(matchRoute("/nope"), "tr").title).toBe(
      "Sayfa bulunamadı | Cengizhan Köse",
    );
  });

  test("data.notFound forces the notFound meta", () => {
    const meta = getPageMeta(matchRoute("/about"), "en", { notFound: true });
    expect(meta.title).toBe("Page not found | Cengizhan Köse");
    expect(meta.robots).toBe("noindex");
  });

  test("lang is the requested locale; anything else falls back to en", () => {
    expect(staticMeta("/about", "en").lang).toBe("en");
    expect(staticMeta("/about", "tr").lang).toBe("tr");
    expect(getPageMeta(matchRoute("/about"), "de").lang).toBe("en");
    expect(getPageMeta(matchRoute("/about"), undefined).lang).toBe("en");
  });

  test("getPageMeta also accepts a pathname", () => {
    expect(getPageMeta("/contact", "en")).toEqual(
      getPageMeta(matchRoute("/contact"), "en"),
    );
  });

  test("getPageMeta returns exactly title, description, robots and lang", () => {
    expect(Object.keys(staticMeta("/", "en")).sort()).toEqual([
      "description",
      "lang",
      "robots",
      "title",
    ]);
  });
});

describe("blog post meta (MKT-21 step 4, SEO-10, SEO-09)", () => {
  const route = matchRoute("/blog/atlas-steward");

  test("a post uses '<title> | Cengizhan Köse' and its excerpt", () => {
    const meta = getPageMeta(route, "en", {
      post: { title: "  Short post  ", excerpt: " What it covers. " },
    });
    expect(meta).toEqual({
      title: "Short post | Cengizhan Köse",
      description: "What it covers.",
      robots: null,
      lang: "en",
    });
  });

  test("seoTitle wins over title", () => {
    expect(
      postTitle({ title: "A very long headline", seoTitle: "Short one" }),
    ).toBe("Short one | Cengizhan Köse");
  });

  test("the brand suffix is dropped when it would pass 60 characters", () => {
    const long = "x".repeat(50);
    expect(buildTitle(long).length).toBeGreaterThan(TITLE_MAX_LENGTH);
    expect(postTitle({ title: long })).toBe(long);
    const fits = "y".repeat(60 - " | Cengizhan Köse".length);
    expect(postTitle({ title: fits })).toBe(`${fits} | Cengizhan Köse`);
    expect(postTitle({ title: fits }).length).toBe(TITLE_MAX_LENGTH);
  });

  test("the description falls back to the title when there is no excerpt", () => {
    expect(postDescription({ title: "Only a title", excerpt: null })).toBe(
      "Only a title",
    );
    expect(postDescription({ title: "T", excerpt: "a\n  b" })).toBe("a b");
  });

  test("while the post loads the blog meta is used, without noindex", () => {
    expect(getPageMeta(route, "en", { post: null })).toEqual(
      getPageMeta(matchRoute("/blog"), "en"),
    );
  });

  test("an API 404 gives the post-not-found meta with noindex", () => {
    const en = getPageMeta(route, "en", { notFound: true });
    expect(en.title).toBe("Post not found | Cengizhan Köse");
    expect(en.robots).toBe("noindex");
    const tr = getPageMeta(route, "tr", { notFound: true });
    expect(tr.title).toBe("Yazı bulunamadı | Cengizhan Köse");
    expect(tr.robots).toBe("noindex");
  });
});

describe("title builders (T-07)", () => {
  test("buildTitle trims and appends the brand", () => {
    expect(buildTitle("  About  ")).toBe("About | Cengizhan Köse");
    expect(buildTitle("")).toBe(SITE_NAME);
    expect(buildTitle(undefined)).toBe(SITE_NAME);
  });

  test("buildHomeTitle puts the name first", () => {
    expect(buildHomeTitle()).toBe(HOME_TITLE);
    expect(buildHomeTitle(" Role ")).toBe("Cengizhan Köse | Role");
  });
});

describe("registry shape", () => {
  test("every registry entry has a title and a description for every locale", () => {
    for (const [key, entry] of Object.entries(pages)) {
      for (const locale of LOCALES) {
        const values = (entry as Record<string, any>)[locale];
        expect(values, `${key}.${locale}`).toBeDefined();
        expect(values.title).toMatch(NO_EDGE_SPACE);
        expect(values.description).toMatch(NO_EDGE_SPACE);
        expect(values.title).not.toContain("KÖSE");
        expect(values.description).not.toContain("KÖSE");
      }
    }
  });

  test("the registry has an entry for every static path plus notFound", () => {
    for (const path of STATIC_PATHS) expect(pages).toHaveProperty([path]);
    expect(pages).toHaveProperty("notFound");
  });
});
