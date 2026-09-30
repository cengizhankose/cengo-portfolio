// ANL-07 / ANL-05 / ANL-06: src/lib/analytics/pageType.js derives the page
// type, the interface language, the post slug, the title and the path group
// of a URL from the one route table (src/seo/routes.js) and the one title
// source (src/seo/pages.js).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTENT_LANGUAGES,
  PAGE_TYPES,
  PATH_GROUPS,
  UI_LOCALES,
} from "../../../src/lib/analytics/events.js";
import {
  classifyPath,
  getContentLanguage,
  getPageTitle,
  getPageType,
  getPostSlug,
  getUiLocale,
  pathGroup,
} from "../../../src/lib/analytics/pageType.js";
import { getPageMeta } from "../../../src/seo/pages.js";
import { ALL_LIVE, matchRoute } from "../../../src/seo/routes.js";

const PATHS = [
  "/",
  "/tr",
  "/about",
  "/tr/about",
  "/about/",
  "/portfolio",
  "/contact",
  "/tr/contact/",
  "/privacy",
  "/tr/privacy",
  "/blog",
  "/tr/blog",
  "/blog/atlas-steward",
  "/tr/blog/atlas-steward",
  "/nope",
  "/tr/nope",
  "/tr/tr/about",
  "/trx",
  "/About",
  "/blog/a/b",
  "/blog/Bad_Slug",
  "/.env",
  "/wp-login.php",
  "/assets/x.js",
  "",
];

describe("getPageType (ANL-07 step 1)", () => {
  it.each([
    ["/", "home"],
    ["/tr", "home"],
    ["/about", "about"],
    ["/tr/about", "about"],
    ["/about/", "about"],
    ["/portfolio", "portfolio"],
    ["/tr/portfolio", "portfolio"],
    ["/contact", "contact"],
    ["/tr/contact/", "contact"],
    ["/privacy", "privacy"],
    ["/tr/privacy", "privacy"],
    ["/blog", "blog_index"],
    ["/tr/blog", "blog_index"],
    ["/blog/atlas-steward", "blog_post"],
    ["/tr/blog/atlas-steward", "blog_post"],
    ["/nope", "not_found"],
    ["/tr/nope", "not_found"],
    ["/tr/tr/about", "not_found"],
    ["/trx", "not_found"],
    ["/About", "not_found"],
    ["/blog/a/b", "not_found"],
    ["/blog/Bad_Slug", "not_found"],
    ["/.env", "not_found"],
    ["", "home"],
  ])("%s -> %s", (pathname, type) => {
    expect(getPageType(pathname)).toBe(type);
  });

  it("only answers values of the PAGE_TYPES vocabulary (events.js)", () => {
    for (const path of PATHS) expect(PAGE_TYPES).toContain(getPageType(path));
  });

  it("does not depend on a query string or a hash", () => {
    expect(getPageType("/about?x=1#team")).toBe("about");
    expect(getPageType("/tr/blog/atlas-steward#intro")).toBe("blog_post");
  });
});

describe("getUiLocale (ANL-07, T-12)", () => {
  it.each([
    ["/", "en"],
    ["/about", "en"],
    ["/tr", "tr"],
    ["/tr/about", "tr"],
    ["/tr/blog/atlas-steward", "tr"],
    ["/tr/nope", "tr"],
    ["/trx", "en"],
    ["/nope", "en"],
  ])("%s -> %s", (pathname, locale) => {
    expect(getUiLocale(pathname)).toBe(locale);
  });

  it("only answers values of UI_LOCALES", () => {
    for (const path of PATHS) expect(UI_LOCALES).toContain(getUiLocale(path));
  });
});

describe("getPostSlug", () => {
  it("returns the slug of a post URL in either language", () => {
    expect(getPostSlug("/blog/atlas-steward")).toBe("atlas-steward");
    expect(getPostSlug("/tr/blog/atlas-steward/")).toBe("atlas-steward");
  });

  it("is null for every other URL", () => {
    for (const path of ["/", "/blog", "/tr/blog", "/blog/a/b", "/nope"]) {
      expect(getPostSlug(path)).toBeNull();
    }
  });
});

describe("getContentLanguage", () => {
  it("is the post's own language on a post", () => {
    expect(getContentLanguage("blog_post", "en", { lang: "tr" })).toBe("tr");
    expect(getContentLanguage("blog_post", "tr", { lang: "en" })).toBe("en");
  });

  it("is 'unknown' for a post without a known language", () => {
    expect(getContentLanguage("blog_post", "en")).toBe("unknown");
    expect(getContentLanguage("blog_post", "en", { lang: "de" })).toBe(
      "unknown",
    );
  });

  it("is the interface language on every other page", () => {
    expect(getContentLanguage("home", "tr")).toBe("tr");
    expect(getContentLanguage("blog_index", "en")).toBe("en");
    expect(getContentLanguage("not_found", "tr")).toBe("tr");
  });

  it("only answers values of CONTENT_LANGUAGES", () => {
    for (const type of PAGE_TYPES) {
      expect(CONTENT_LANGUAGES).toContain(getContentLanguage(type, "en", {}));
    }
  });
});

describe("getPageTitle (ANL-07: the one title source)", () => {
  it("reads the T-07 titles of src/seo/pages.js", () => {
    expect(getPageTitle("/about")).toBe("About | Cengizhan Köse");
    expect(getPageTitle("/blog")).toBe("Blog | Cengizhan Köse");
    expect(getPageTitle("/contact")).toBe("Contact | Cengizhan Köse");
  });

  it("gives /tr/about the TR entry of src/seo/pages.js", () => {
    const route = matchRoute("/tr/about", ALL_LIVE);
    const expected = getPageMeta(route, "tr", {}, ALL_LIVE).title;
    expect(getPageTitle("/tr/about")).toBe(expected);
    expect(getPageTitle("/tr/about")).not.toBe(getPageTitle("/about"));
  });

  it("answers the not-found title for an unknown path", () => {
    expect(getPageTitle("/nope")).toMatch(/^Page not found \| /);
  });

  it("keeps no title table of its own", () => {
    const code = readFileSync(
      join(import.meta.dirname, "../../../src/lib/analytics/pageType.js"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\| Cengizhan Köse/);
    expect(code).not.toMatch(/PAGE_TITLES/);
  });
});

describe("pathGroup (ANL-05: requested_path_group)", () => {
  it.each([
    ["/.env", "dotfile"],
    ["/.git/config", "dotfile"],
    ["/.well-known/security.txt", "dotfile"],
    ["/assets/.hidden", "dotfile"],
    ["/wp-login.php", "wp"],
    ["/wp-content/uploads/a.png", "wp"],
    ["/wordpress/index", "wp"],
    ["/WP-Login.php", "wp"],
    ["/xmlrpc.php", "php"],
    ["/xmlrpc", "php"],
    ["/phpinfo.php", "php"],
    ["/blog/nope", "blog"],
    ["/blog", "blog"],
    ["/tr/blog/yok", "blog"],
    ["/api/nope", "api"],
    ["/api", "api"],
    ["/tr/nope", "other"],
    ["/this-page-does-not-exist-audit", "other"],
    ["/blogging", "other"],
    ["", "other"],
  ])("%s -> %s", (pathname, group) => {
    expect(pathGroup(pathname)).toBe(group);
  });

  it("only answers values of PATH_GROUPS and never returns the path", () => {
    for (const path of PATHS) {
      const group = pathGroup(path);
      expect(PATH_GROUPS).toContain(group);
      expect(group).not.toContain("/");
    }
  });

  it("ignores a query string and a hash", () => {
    expect(pathGroup("/blog/nope?x=1#y")).toBe("blog");
    expect(pathGroup("/.env?x=1")).toBe("dotfile");
  });
});

describe("classifyPath (ANL-05)", () => {
  it.each([
    ["/", "page"],
    ["/about", "page"],
    ["/about/", "page"],
    ["/tr/about", "page"],
    ["/privacy", "page"],
    ["/blog", "page"],
    ["/blog/atlas-steward", "page"],
    ["/tr/blog/atlas-steward", "page"],
    ["/assets/x.js", "asset"],
    ["/assets/index-abc.css", "asset"],
    ["/assets/missing", "asset"],
    ["/fonts/v1/raleway.woff2", "asset"],
    ["/og/default.jpg", "asset"],
    ["/api/posts", "api"],
    ["/api/nope", "api"],
    ["/robots.txt", "meta"],
    ["/favicon.ico", "meta"],
    ["/manifest.json", "meta"],
    ["/sitemap.xml", "meta"],
    ["/.well-known/apple-app-site-association", "meta"],
    ["/.env", "probe"],
    ["/.git/config", "probe"],
    ["/.vite/manifest.json", "probe"],
    ["/xmlrpc.php", "probe"],
    ["/wp-login.php", "probe"],
    ["/wp-admin/install.php", "probe"],
    ["/wordpress/", "probe"],
    ["/cgi-bin/test", "probe"],
    ["/phpmyadmin", "probe"],
    ["/admin", "probe"],
    ["/login", "probe"],
    ["/graphql", "probe"],
    ["/actuator/health", "probe"],
    ["/.ENV", "probe"],
    ["/this-page-does-not-exist-audit", "other"],
    ["/blog/a/b", "other"],
    ["/tr/tr/about", "other"],
  ])("%s -> %s", (pathname, kind) => {
    expect(classifyPath(pathname)).toBe(kind);
  });

  it("checks the meta files before the probe rules", () => {
    expect(classifyPath("/.well-known/security.txt")).toBe("meta");
    expect(classifyPath("/.git/HEAD")).toBe("probe");
  });
});
