// The page table (src/app/pageRoutes.jsx) and the route table
// (src/seo/routes.js) agree (SEO-02 step 7, FE-14 step 2): every page exists
// in every language, every client path is known to matchRoute with all
// languages open, every live route has a client route, and routes.jsx keeps
// only the shell plus the NotFound fallback.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALIZED_ROUTES, PAGE_ROUTES } from "../../../src/app/pageRoutes.jsx";
import { LOCALES } from "../../../src/seo/site.js";
import {
  ALL_LIVE,
  LIVE,
  LOCALE_PREFIX,
  matchRoute,
  STATIC_PATHS,
} from "../../../src/seo/routes.js";

const concrete = (path) => path.replace(/:[A-Za-z]+/g, "sample");
const clientPaths = LOCALIZED_ROUTES.map((route) => concrete(route.path));

describe("PAGE_ROUTES x LOCALES", () => {
  it("has every page once, in every language", () => {
    expect(PAGE_ROUTES.map((route) => route.path)).toEqual([
      ...STATIC_PATHS,
      "/blog/:slug",
    ]);
    expect(LOCALIZED_ROUTES).toHaveLength(PAGE_ROUTES.length * LOCALES.length);
    expect(LOCALIZED_ROUTES.map((route) => route.path)).toEqual(
      expect.arrayContaining(["/about", "/tr/about", "/tr", "/tr/blog/:slug"]),
    );
  });

  it("every client path is known to matchRoute with every language open", () => {
    for (const route of LOCALIZED_ROUTES) {
      const match = matchRoute(concrete(route.path), ALL_LIVE);
      expect(match.type, route.path).not.toBe("notfound");
      expect(match.locale, route.path).toBe(route.locale);
    }
  });

  it("every live route of the table has a client route", () => {
    for (const locale of LOCALES) {
      const prefix = LOCALE_PREFIX[locale];
      if (LIVE.static.includes(locale)) {
        for (const path of STATIC_PATHS) {
          expect(clientPaths).toContain(
            path === "/" ? prefix || "/" : `${prefix}${path}`,
          );
        }
      }
      if (LIVE.post.includes(locale)) {
        expect(clientPaths).toContain(`${prefix}/blog/sample`);
      }
    }
  });

  it("the TR post path (the 301 target) and the TR blog list are client routes", () => {
    expect(LOCALIZED_ROUTES.map((route) => route.path)).toEqual(
      expect.arrayContaining(["/tr/blog/:slug", "/tr/blog"]),
    );
  });
});

describe("routes.jsx is the shell only", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/routes.jsx"),
    "utf8",
  );

  it("renders the page table and falls back to NotFound, never Home", () => {
    expect(source).toMatch(/\{pageRoutes\(\)\}/);
    expect(source).toMatch(/<Route path="\*" element={<NotFound \/>} \/>/);
    expect(source).not.toMatch(/path="\*" element={<Home/);
    expect(source).not.toMatch(/PAGE_ROUTES/);
  });
});
