// @vitest-environment node
//
// pageType.js has no React and no browser globals (ANL-05: the server's
// request statistics classify paths with the same functions, and Bun imports
// the file without a DOM). This runs it with no window and no document.
import { describe, expect, it } from "vitest";
import {
  classifyPath,
  getContentLanguage,
  getPageTitle,
  getPageType,
  getPostSlug,
  getUiLocale,
  pathGroup,
} from "../../../src/lib/analytics/pageType.js";

describe("pageType.js without a DOM", () => {
  it("has no window or document", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("answers every function", () => {
    expect(getPageType("/tr/blog/atlas-steward")).toBe("blog_post");
    expect(getUiLocale("/tr/about")).toBe("tr");
    expect(getPostSlug("/blog/atlas-steward")).toBe("atlas-steward");
    expect(getContentLanguage("blog_post", "en", { lang: "tr" })).toBe("tr");
    expect(getPageTitle("/about")).toBe("About | Cengizhan Köse");
    expect(classifyPath("/.env")).toBe("probe");
    expect(classifyPath("/assets/x.js")).toBe("asset");
    expect(pathGroup("/wp-login.php")).toBe("wp");
  });
});
