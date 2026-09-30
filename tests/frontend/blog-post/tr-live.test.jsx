// The TR side of W8-SEO-blog-author-rss once the TR static pages are open
// (LIVE = ALL_LIVE, SEO-11 Adım B): the blog index speaks Turkish (tagline,
// empty state with /tr/rss.xml) and a TR post links its byline, author box and
// contact call to the /tr pages. The route table is mocked the way
// tests/frontend/blog/blog-states-tr.test.jsx does it.
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});

const { json, renderBlog, testSWRValue } = await import("../blog/support.jsx");

describe("/tr/blog with the TR pages live", () => {
  it("the Turkish tagline sits right after the h1", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json([])),
    );
    renderBlog("/tr/blog");
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1.nextElementSibling.textContent).toBe(
      "Web, mobil ve yapay zekâ ürünleri geliştirirken aldığım kararlar, ölçtüğüm sayılar ve bozulan şeyler.",
    );
    vi.unstubAllGlobals();
  });

  it("the empty state: the Turkish sentence and the TR feed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json([])),
    );
    renderBlog("/tr/blog");
    await screen.findByText("Henüz yazı yok");
    expect(screen.getByText("İlk yazı yolda.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "RSS ile takip et →" }),
    ).toHaveAttribute("href", "/tr/rss.xml");
    vi.unstubAllGlobals();
  });
});

describe("a TR post with the TR pages live (SEO-16: About is /tr/about)", () => {
  it("byline, author box and footer link to the /tr pages", async () => {
    const post = {
      id: 2,
      slug: "merhaba-dunya",
      title: "Merhaba dünya",
      excerpt: "x",
      content: "gövde",
      lang: "tr",
      translationKey: null,
      translations: [],
      coverImage: null,
      createdAt: "2026-09-30T10:00:00.000Z",
      publishedAt: "2026-09-30T10:00:00.000Z",
      updatedAt: "2026-09-30T10:00:00.000Z",
    };
    const { container } = renderBlog("/tr/blog/merhaba-dunya", {
      swr: testSWRValue({ fallback: { "/api/posts/merhaba-dunya": post } }),
    });
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(
      heading.nextElementSibling.querySelector("a").getAttribute("href"),
    ).toBe("/tr/about");
    const footer = container.querySelector(".post-footer");
    expect(
      [...footer.querySelectorAll("a:not([target])")].map((a) =>
        a.getAttribute("href"),
      ),
    ).toEqual(["/tr/about", "/tr/rss.xml", "/tr/contact"]);
    expect(container.querySelector(".blog-back")).toHaveAttribute(
      "href",
      "/tr/blog",
    );
  });
});
