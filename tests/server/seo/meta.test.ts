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
  pages as registry,
  POST_TOPIC_MAX_LENGTH,
  postDescription,
  postTitle,
  TITLE_MAX_LENGTH,
} from "../../../src/seo/pages.js";
import { matchRoute, STATIC_PATHS } from "../../../src/seo/routes.js";
import { LOCALES, SITE_NAME } from "../../../src/seo/site.js";

// JS module: index it with plain string keys in the tests.
const pages = registry as Record<string, any>;

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
  "/privacy": {
    en: "Privacy | Cengizhan Köse",
    tr: "Gizlilik | Cengizhan Köse",
  },
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
    // /portfolio joined the list in W8 (T-10 exit, SEO-14): the three cases
    // are published, so it is indexable on both locales.
    for (const path of ["/", "/about", "/contact", "/blog", "/portfolio"]) {
      for (const locale of LOCALES) {
        expect(staticMeta(path, locale).robots).toBeNull();
      }
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

  test("getPageMeta returns exactly the head fields, present on every page (SEO-04/06/07)", () => {
    const keys = [
      "alternates",
      "canonical",
      "description",
      "jsonLd",
      "lang",
      "og",
      "robots",
      "title",
      "twitter",
    ];
    expect(Object.keys(staticMeta("/", "en")).sort()).toEqual(keys);
    expect(Object.keys(getPageMeta("/nope", "en")).sort()).toEqual(keys);
    expect(
      Object.keys(
        getPageMeta("/blog/x", "en", { post: { title: "T" } }),
      ).sort(),
    ).toEqual(keys);
  });
});

describe("blog post meta (MKT-21 step 4, SEO-10, SEO-09)", () => {
  const route = matchRoute("/blog/atlas-steward");

  test("a post uses '<title> | Cengizhan Köse' and its excerpt", () => {
    const meta = getPageMeta(route, "en", {
      post: { title: "  Short post  ", excerpt: " What it covers. " },
    });
    expect(meta).toMatchObject({
      title: "Short post | Cengizhan Köse",
      description: "What it covers.",
      robots: null,
      lang: "en",
      alternates: [],
    });
  });

  test("a loaded post speaks its own language, whatever the URL (T-12)", () => {
    const tr = { title: "Başlık", excerpt: "Özet", lang: "tr" };
    expect(getPageMeta(route, "en", { post: tr }).lang).toBe("tr");
    expect(getPageMeta(matchRoute("/tr/blog/x"), "tr", { post: tr }).lang).toBe(
      "tr",
    );
    // No (or an unknown) post language: the route's language.
    expect(getPageMeta(route, "en", { post: { title: "T" } }).lang).toBe("en");
    expect(
      getPageMeta(route, "en", { post: { title: "T", lang: "de" } }).lang,
    ).toBe("en");
  });

  test("seoTitle wins over title", () => {
    expect(
      postTitle({ title: "A very long headline", seoTitle: "Short one" }),
    ).toBe("Short one | Cengizhan Köse");
  });

  test("the brand suffix is always kept (DSG-33 table, FE-25 pattern)", () => {
    const long = "x".repeat(50);
    expect(postTitle({ title: long })).toBe(`${long} | Cengizhan Köse`);
    expect(postTitle({ title: "   " })).toBe(SITE_NAME);
    expect(postTitle(null)).toBe(SITE_NAME);
  });

  test("a 41-character seoTitle fits the 60-character limit with the suffix", () => {
    // SEO-10's draft seoTitle length for the live post.
    const seoTitle = "z".repeat(41);
    expect(postTitle({ title: "x".repeat(98), seoTitle }).length).toBe(58);
    expect(postTitle({ seoTitle }).length).toBeLessThanOrEqual(
      TITLE_MAX_LENGTH,
    );
  });

  test("the description falls back to the title when there is no excerpt", () => {
    expect(postDescription({ title: "Only a title", excerpt: null })).toBe(
      "Only a title",
    );
    expect(postDescription({ title: "T", excerpt: "a\n  b" })).toBe("a b");
  });

  test("while the post loads the blog meta is used, without noindex", () => {
    const loading = getPageMeta(route, "en", { post: null });
    const blog = getPageMeta(matchRoute("/blog"), "en");
    expect(loading).toMatchObject({
      title: blog.title,
      description: blog.description,
      robots: null,
      lang: "en",
      alternates: [],
    });
    // The blog's canonical, share card and schema do not describe this URL:
    // a post that has not loaded prints none (SEO-04, SEO-06, SEO-07).
    expect(loading).toMatchObject({
      canonical: null,
      og: null,
      twitter: null,
      jsonLd: null,
    });
    expect(blog.canonical).not.toBeNull();
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

describe("post titles within 60 characters (SEO-10)", () => {
  const SUFFIX = " | Cengizhan Köse";

  test("POST_TOPIC_MAX_LENGTH leaves room for the brand suffix", () => {
    expect(SUFFIX.length).toBe(17);
    expect(POST_TOPIC_MAX_LENGTH).toBe(TITLE_MAX_LENGTH - SUFFIX.length);
    expect(POST_TOPIC_MAX_LENGTH).toBe(43);
  });

  test("a seoTitle of POST_TOPIC_MAX_LENGTH characters gives exactly 60", () => {
    const seoTitle = "s".repeat(POST_TOPIC_MAX_LENGTH);
    expect(postTitle({ title: "t".repeat(98), seoTitle }).length).toBe(
      TITLE_MAX_LENGTH,
    );
  });

  test("the draft seoTitle for the live post fits (58 characters)", () => {
    // SEO-10 step 4 draft; the owner approves it and the publish CLI (W5)
    // writes it to posts.seo_title. The live post's own title is 98
    // characters (SEO-10 problem statement).
    const seoTitle = "Atlas Steward: Yarım İşi Yakalayan Sistem";
    expect(seoTitle.length).toBe(41);
    const title = postTitle({ title: "t".repeat(98), seoTitle });
    expect(title).toBe(`${seoTitle}${SUFFIX}`);
    expect(title.length).toBe(58);
    expect(title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
  });

  test("seoTitle is trimmed and whitespace-collapsed; a blank one falls back to title", () => {
    expect(
      postTitle({ title: "Long title", seoTitle: "  Short \n one  " }),
    ).toBe("Short one | Cengizhan Köse");
    expect(postTitle({ title: "Long title", seoTitle: "   " })).toBe(
      "Long title | Cengizhan Köse",
    );
    expect(postTitle({ title: "Long title", seoTitle: null })).toBe(
      "Long title | Cengizhan Köse",
    );
  });

  test("the post title is the page title in getPageMeta (server and client share it)", () => {
    const post = { title: "x".repeat(90), seoTitle: "Short", lang: "tr" };
    expect(getPageMeta(matchRoute("/tr/blog/a"), "tr", { post }).title).toBe(
      "Short | Cengizhan Köse",
    );
  });

  test("the 404 titles of both languages are within the limit (SEO-10 table)", () => {
    for (const locale of LOCALES) {
      for (const entry of [pages.notFound, pages.postNotFound]) {
        expect(entry[locale].title.length).toBeLessThanOrEqual(
          TITLE_MAX_LENGTH,
        );
        expect(entry[locale].title).toMatch(BRANDED);
      }
    }
    expect(pages.notFound.tr.title).toBe("Sayfa bulunamadı | Cengizhan Köse");
    expect(pages.postNotFound.tr.title).toBe(
      "Yazı bulunamadı | Cengizhan Köse",
    );
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
    // The JS default parameter types `role` as the literal default; any
    // string is accepted at runtime.
    const withRole = buildHomeTitle as (role?: string) => string;
    expect(withRole(" Role ")).toBe("Cengizhan Köse | Role");
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
