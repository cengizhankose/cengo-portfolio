/**
 * SEO-09 / MKT-21: per-page, per-language meta descriptions.
 * 5 static pages x EN/TR = 10 descriptions, unique within a language,
 * 140-160 characters, no "_" and no comma without a following space.
 * TR values render only after the W11 LIVE flip, but are checked now.
 */
import { describe, expect, test } from "bun:test";
import { getPageMeta, pages as registry } from "../../../src/seo/pages.js";
import { matchRoute, STATIC_PATHS } from "../../../src/seo/routes.js";
import { LOCALES } from "../../../src/seo/site.js";

// JS module: index it with plain string keys in the tests.
const pages = registry as Record<string, any>;

const PAGES = ["/", "/about", "/portfolio", "/contact", "/blog"];
// Turkish letters; every TR description contains at least one.
const TURKISH = /[çğıİöşüÇĞÖŞÜ]/;

describe("static page descriptions (SEO-09)", () => {
  test("the SEO-09 page list is the static route list", () => {
    expect([...STATIC_PATHS].sort()).toEqual([...PAGES].sort());
  });

  for (const locale of LOCALES) {
    const descriptions = PAGES.map((path) => pages[path][locale].description);

    test(`${locale}: 5 descriptions, unique within the language`, () => {
      expect(descriptions).toHaveLength(5);
      expect(new Set(descriptions).size).toBe(5);
    });

    for (const [i, path] of PAGES.entries()) {
      test(`${locale} ${path}: 140-160 chars, trimmed, clean punctuation`, () => {
        const text = descriptions[i];
        expect(text).toBe(text.trim());
        expect(text.length).toBeGreaterThanOrEqual(140);
        expect(text.length).toBeLessThanOrEqual(160);
        expect(text).not.toMatch(/_/);
        expect(text).not.toMatch(/,[^ ]/);
        expect(text).not.toMatch(/\s{2,}/);
        expect(text).toContain("Cengizhan Köse");
        expect(text).not.toContain("KÖSE");
      });
    }
  }

  test("the MKT-21 bun -e criterion holds", () => {
    const ok = ["en", "tr"].every((l) => {
      const d = PAGES.map((k) => pages[k][l].description);
      return (
        new Set(d).size === d.length &&
        d.every((x) => x === x.trim() && x.length >= 140 && x.length <= 160)
      );
    });
    expect(ok).toBe(true);
  });

  test("each TR description is Turkish and differs from its EN pair", () => {
    for (const path of PAGES) {
      const { en, tr } = pages[path];
      expect(tr.description).not.toBe(en.description);
      expect(tr.description).toMatch(TURKISH);
      expect(en.description).not.toMatch(/[çğıİşÇĞŞ]/);
    }
  });

  test("getPageMeta returns the registry text verbatim for every page and language", () => {
    for (const locale of LOCALES) {
      for (const path of PAGES) {
        expect(getPageMeta(matchRoute(path), locale).description).toBe(
          pages[path][locale].description,
        );
      }
    }
  });

  test("the old shared description is gone", () => {
    for (const locale of LOCALES) {
      for (const path of PAGES) {
        const text = pages[path][locale].description;
        expect(text).not.toContain("Mobile Developer _ Full stack developer");
        expect(text).not.toBe("Thoughts, tutorials, and insights");
      }
    }
  });
});
