/**
 * src/seo/routes.js: the one route table (SEO-02 step 1 + 7, T-11, T-12).
 * EN static pages and posts, the /tr prefix, the LIVE table and slug
 * validation. The routes.jsx check makes a new client route without a
 * server-side entry (or the other way round) fail here.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pages as registry } from "../../../src/seo/pages.js";
import {
  ALL_LIVE,
  LIVE,
  LOCALE_PREFIX,
  matchRoute,
  POST_PATH,
  SLUG_PATTERN,
  STATIC_PATHS,
} from "../../../src/seo/routes.js";
import { LOCALES } from "../../../src/seo/site.js";

// JS module: index it with plain string keys in the tests.
const pages = registry as Record<string, any>;
const prefixes = LOCALE_PREFIX as Record<string, string>;
const live = LIVE as { static: readonly string[]; post: readonly string[] };

const ROOT = join(import.meta.dir, "..", "..", "..");

describe("the table (SEO-02 step 1)", () => {
  test("static paths, post path and language prefixes", () => {
    expect([...STATIC_PATHS]).toEqual([
      "/",
      "/about",
      "/portfolio",
      "/contact",
      "/blog",
    ]);
    expect(POST_PATH).toBe("/blog/:slug");
    expect(LOCALE_PREFIX).toEqual({ en: "", tr: "/tr" });
    expect(Object.keys(LOCALE_PREFIX).sort()).toEqual([...LOCALES].sort());
  });

  test("LIVE: EN everywhere, TR posts open (SEO-11 Adım A), TR pages not yet (Adım B)", () => {
    expect(LIVE).toEqual({ static: ["en"], post: ["en", "tr"] });
    expect(Object.isFrozen(LIVE)).toBe(true);
    expect(Object.isFrozen(LIVE.static)).toBe(true);
    expect(ALL_LIVE).toEqual({ static: ["en", "tr"], post: ["en", "tr"] });
  });

  test("every static path has a registry entry in pages.js for both languages", () => {
    for (const path of STATIC_PATHS) {
      expect(pages[path]?.en?.title).toBeTruthy();
      expect(pages[path]?.tr?.title).toBeTruthy();
    }
  });
});

describe("matchRoute: EN (no prefix)", () => {
  test("static pages", () => {
    for (const path of STATIC_PATHS) {
      expect(matchRoute(path)).toEqual({ type: "static", locale: "en", path });
    }
  });

  test("one trailing slash, query and hash are ignored", () => {
    expect(matchRoute("/about/")).toEqual({
      type: "static",
      locale: "en",
      path: "/about",
    });
    expect(matchRoute("/blog?page=2#top").path).toBe("/blog");
    expect(matchRoute("").path).toBe("/");
    expect(matchRoute(undefined).path).toBe("/");
  });

  test("blog posts", () => {
    expect(matchRoute("/blog/atlas-steward")).toEqual({
      type: "post",
      locale: "en",
      path: POST_PATH,
      slug: "atlas-steward",
    });
    expect(matchRoute("/blog/atlas-steward/").slug).toBe("atlas-steward");
  });

  test("everything else is notfound, with the prefix-free path", () => {
    for (const path of ["/nope", "/blog/a/b", "/about/team", "/trx", "/en"]) {
      expect(matchRoute(path)).toEqual({
        type: "notfound",
        locale: "en",
        path,
      });
    }
  });

  test("matching is case-sensitive (the server 301s other spellings)", () => {
    expect(matchRoute("/About").type).toBe("notfound");
    expect(matchRoute("/BLOG").type).toBe("notfound");
  });
});

describe("matchRoute: the /tr prefix and LIVE (SEO-02 step 7, SEO-11)", () => {
  test("/tr is the TR home page: locale tr, path '/'", () => {
    expect(matchRoute("/tr", ALL_LIVE)).toEqual({
      type: "static",
      locale: "tr",
      path: "/",
    });
    expect(matchRoute("/tr/", ALL_LIVE).path).toBe("/");
  });

  test("TR static pages are notfound while LIVE.static is EN only", () => {
    expect(matchRoute("/tr")).toEqual({
      type: "notfound",
      locale: "tr",
      path: "/",
    });
    for (const path of STATIC_PATHS.filter((p) => p !== "/")) {
      expect(matchRoute(`/tr${path}`)).toEqual({
        type: "notfound",
        locale: "tr",
        path,
      });
    }
  });

  test("with every language open the TR pages match", () => {
    for (const path of STATIC_PATHS) {
      const url = path === "/" ? "/tr" : `/tr${path}`;
      expect(matchRoute(url, ALL_LIVE)).toEqual({
        type: "static",
        locale: "tr",
        path,
      });
    }
  });

  test("TR posts are live (SEO-11 Adım A)", () => {
    expect(matchRoute("/tr/blog/merhaba-dunya")).toEqual({
      type: "post",
      locale: "tr",
      path: POST_PATH,
      slug: "merhaba-dunya",
    });
    expect(matchRoute("/tr/blog/x").type).toBe("post");
    expect(matchRoute("/blog/x").locale).toBe("en");
  });

  test("a closed post language is notfound", () => {
    const enOnly = { static: ["en"], post: ["en"] };
    expect(matchRoute("/tr/blog/x", enOnly)).toEqual({
      type: "notfound",
      locale: "tr",
      path: "/blog/x",
    });
    expect(matchRoute("/blog/x", enOnly).type).toBe("post");
  });

  test("unknown paths under /tr keep locale tr", () => {
    expect(matchRoute("/tr/yok")).toEqual({
      type: "notfound",
      locale: "tr",
      path: "/yok",
    });
    expect(matchRoute("/tr/tr/about", ALL_LIVE).type).toBe("notfound");
  });
});

describe("slug validation", () => {
  test("lower-case words joined by single hyphens", () => {
    for (const slug of [
      "a",
      "hello-world",
      "atlas-steward-laya-konustan-yarim-is-cikaran-sistem",
      "react-19",
    ]) {
      expect(SLUG_PATTERN.test(slug)).toBe(true);
      expect(matchRoute(`/blog/${slug}`).type).toBe("post");
    }
  });

  test("anything else under /blog/ is notfound", () => {
    for (const slug of [
      "Hello",
      "a--b",
      "-a",
      "a-",
      "a_b",
      "a.b",
      "%C3%A7",
      "a%2Fb",
    ]) {
      expect(matchRoute(`/blog/${slug}`).type, slug).toBe("notfound");
    }
  });
});

describe("routes.jsx agrees with the table (SEO-02 step 7)", () => {
  const source = readFileSync(join(ROOT, "src/app/routes.jsx"), "utf8");
  // Both <Route path="/x"> and route-table objects ({ path: "/x" }).
  const paths = [...source.matchAll(/\bpath\s*[=:]\s*["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((path) => path !== "*");
  const concrete = paths.map((p) => p.replace(/:[A-Za-z]+/g, "sample"));

  test("every client path is known to matchRoute with every language open", () => {
    expect(paths.length).toBeGreaterThan(0);
    for (const [index, url] of concrete.entries()) {
      expect(matchRoute(url, ALL_LIVE).type, paths[index]).not.toBe("notfound");
    }
  });

  test("the TR post path (the 301 target) and the TR blog list are client routes", () => {
    expect(paths).toContain("/tr/blog/:slug");
    expect(paths).toContain("/tr/blog");
  });

  test("every live route of the table has a client route", () => {
    for (const locale of LOCALES) {
      const prefix = prefixes[locale];
      if (live.static.includes(locale)) {
        for (const path of STATIC_PATHS) {
          const url = path === "/" ? prefix || "/" : `${prefix}${path}`;
          expect(concrete, url).toContain(url);
        }
      }
      if (live.post.includes(locale)) {
        expect(concrete).toContain(`${prefix}/blog/sample`);
      }
    }
  });

  test("unknown paths render NotFound, not Home (FE-16)", () => {
    expect(source).toMatch(/<Route path="\*" element={<NotFound \/>} \/>/);
    expect(source).not.toMatch(/path="\*" element={<Home/);
  });
});
