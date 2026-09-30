// The reverse of publish-flag.test.jsx (T-10 interim state): when no case is
// publishable the menu link is gone, both languages are noindex (the server's
// X-Robots-Tag and the sitemap follow `robots`), the page has no canonical or
// card, and the page itself shows a short note instead of an empty grid. One
// registry flag moves all of it (src/content/projects.js hasPublishedCases).
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/content/projects.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    publishedProjects: () => [],
    hasPublishedCases: () => false,
  };
});
vi.mock("../../../src/lib/analytics/index.js", () => ({ track: vi.fn() }));

const { default: Headermain } = await import("../../../src/header");
const { Portfolio } = await import("../../../src/pages/portfolio");
const { ALL_LIVE, LIVE, matchRoute } =
  await import("../../../src/seo/routes.js");
const { alternatesFor, getPageMeta, pages } =
  await import("../../../src/seo/pages.js");

describe("portfolio without cases (T-10 interim)", () => {
  it("the registry entry is noindex, follow on both languages", () => {
    for (const lang of ["en", "tr"]) {
      expect(pages["/portfolio"][lang].robots).toBe("noindex, follow");
    }
  });

  it.each([
    ["/portfolio", LIVE, "en"],
    ["/tr/portfolio", ALL_LIVE, "tr"],
  ])(
    "%s is noindex with no canonical, card or alternates",
    (path, live, lang) => {
      const meta = getPageMeta(matchRoute(path, live), lang, {}, live);

      expect(meta.robots).toBe("noindex, follow");
      expect(meta.canonical).toBeNull();
      expect(meta.og).toBeNull();
      expect(meta.twitter).toBeNull();
      expect(meta.jsonLd).toBeNull();
      expect(alternatesFor(matchRoute(path, live), {}, live)).toEqual([]);
    },
  );

  it("the menu has no portfolio link", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Headermain />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "Main menu" });

    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/", "/about", "/blog", "/contact"]);
    expect(document.querySelector('a[href$="/portfolio"]')).toBeNull();
  });

  it("the page says the cases are being prepared and points to the blog and GitHub", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/portfolio"]}>
        <Portfolio />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Portfolio",
    );
    expect(screen.getByText("Case studies are being prepared.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Read the blog" })).toHaveAttribute(
      "href",
      "/blog",
    );
    expect(
      screen
        .getByRole("link", { name: /See my code on GitHub/ })
        .getAttribute("href"),
    ).toBe("https://github.com/cengizhankose");
    expect(container.querySelector("article, .project-grid")).toBeNull();
    expect(container.textContent).not.toMatch(/Under Construction/i);
  });
});
