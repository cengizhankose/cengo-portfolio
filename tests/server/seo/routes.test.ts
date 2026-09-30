/**
 * src/seo/routes.js, first version (SEO-25): EN static list + simple
 * matchRoute. SEO-02 (W3) extends this file with the /tr prefix and LIVE.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pages as registry } from "../../../src/seo/pages.js";
import {
  matchRoute,
  POST_PATH,
  STATIC_PATHS,
} from "../../../src/seo/routes.js";

// JS module: index it with plain string keys in the tests.
const pages = registry as Record<string, any>;

const ROOT = join(import.meta.dir, "..", "..", "..");

describe("matchRoute", () => {
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

  test("everything else is notfound", () => {
    for (const path of ["/nope", "/blog/a/b", "/about/team", "/tr/about"]) {
      expect(matchRoute(path).type).toBe("notfound");
      expect(matchRoute(path).locale).toBe("en");
    }
  });

  test("every static path has a registry entry in pages.js", () => {
    for (const path of STATIC_PATHS) {
      expect(pages[path]?.en?.title).toBeTruthy();
      expect(pages[path]?.tr?.title).toBeTruthy();
    }
  });

  test("every <Route path> in src/app/routes.jsx is known to matchRoute", () => {
    const source = readFileSync(join(ROOT, "src/app/routes.jsx"), "utf8");
    // Both <Route path="/x"> and route-table objects ({ path: "/x" }).
    const paths = [...source.matchAll(/\bpath\s*[=:]\s*["']([^"']+)["']/g)]
      .map((m) => m[1])
      .filter((path) => path !== "*");
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      const concrete = path.replace(/:[A-Za-z]+/g, "sample");
      expect(matchRoute(concrete).type, path).not.toBe("notfound");
    }
  });
});
