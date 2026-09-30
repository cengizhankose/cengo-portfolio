// @vitest-environment node
//
// ANL-18 criterion 1 (T-02): the language of a URL and of its content, for
// the analytics context. The wider page-type table is pinned in
// tests/frontend/shell/page-type.test.js; this file keeps the ANL-18 cases
// next to the other analytics tests.
import { describe, expect, it } from "vitest";
import {
  CONTENT_LANGUAGES,
  UI_LOCALES,
} from "../../../src/lib/analytics/events.js";
import {
  getContentLanguage,
  getPageType,
  getUiLocale,
} from "../../../src/lib/analytics/pageType.js";

describe("getUiLocale (ANL-18 step 1)", () => {
  it("reads the language from the route prefix", () => {
    expect(getUiLocale("/tr/blog/x")).toBe("tr");
    expect(getUiLocale("/tr")).toBe("tr");
    expect(getUiLocale("/tr/about")).toBe("tr");
    expect(getUiLocale("/blog")).toBe("en");
    expect(getUiLocale("/")).toBe("en");
  });

  it("never answers a value outside UI_LOCALES", () => {
    for (const path of ["/", "/tr", "/de/about", "/trx", "/nope", "/tr/nope"]) {
      expect(UI_LOCALES).toContain(getUiLocale(path));
    }
  });
});

describe("getContentLanguage (ANL-18 step 1)", () => {
  it("a static page is written in the interface language", () => {
    expect(getContentLanguage("about", "tr", null)).toBe("tr");
    expect(getContentLanguage("home", "en", null)).toBe("en");
    expect(getContentLanguage("blog_index", "tr")).toBe("tr");
  });

  it("a blog post carries its own language (posts.lang)", () => {
    expect(getContentLanguage("blog_post", "en", { lang: "tr" })).toBe("tr");
    expect(getContentLanguage("blog_post", "tr", { lang: "en" })).toBe("en");
  });

  it("a post without a usable language is unknown", () => {
    expect(getContentLanguage("blog_post", "tr", {})).toBe("unknown");
    expect(getContentLanguage("blog_post", "tr", null)).toBe("unknown");
    expect(getContentLanguage("blog_post", "en", { lang: "de" })).toBe(
      "unknown",
    );
  });

  it("only answers values of CONTENT_LANGUAGES", () => {
    const answers = [
      getContentLanguage("home", "tr"),
      getContentLanguage("home", "de"),
      getContentLanguage("blog_post", "en", { lang: "tr" }),
      getContentLanguage("blog_post", "en"),
    ];
    for (const answer of answers) expect(CONTENT_LANGUAGES).toContain(answer);
  });

  it("the language and the page type of one URL are independent", () => {
    expect(getPageType("/tr/about")).toBe("about");
    expect(getPageType("/about")).toBe("about");
    expect(getUiLocale("/tr/about")).not.toBe(getUiLocale("/about"));
  });
});
