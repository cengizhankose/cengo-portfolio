// T-10 exit (FE-04 criterion 4, DSG-08, SEO-14): with the three cases
// published the menu link is back, the page is indexable (no robots value, so
// no X-Robots-Tag and no meta tag) and it has the share card, the canonical
// and the alternates the other indexable pages have. publish-flag-off.test.jsx
// holds the reverse.
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { hasPublishedCases } from "../../../src/content/projects.js";
import Headermain from "../../../src/header";
import { ALL_LIVE, LIVE, matchRoute } from "../../../src/seo/routes.js";
import { alternatesFor, getPageMeta, pages } from "../../../src/seo/pages.js";

vi.mock("../../../src/lib/analytics/index.js", () => ({ track: vi.fn() }));

const renderHeader = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Headermain />
    </MemoryRouter>,
  );

describe("indexable portfolio (cases published)", () => {
  it("the registry has cases to show", () => {
    expect(hasPublishedCases()).toBe(true);
  });

  it("the registry entry has no robots value on either language", () => {
    for (const lang of ["en", "tr"]) {
      expect(Object.hasOwn(pages["/portfolio"][lang], "robots")).toBe(false);
    }
  });

  it.each([
    ["/portfolio", LIVE, "en"],
    ["/tr/portfolio", ALL_LIVE, "tr"],
  ])("%s prints the full head, not the noindex one", (path, live, lang) => {
    const meta = getPageMeta(matchRoute(path, live), lang, {}, live);

    expect(meta.robots).toBeNull();
    expect(meta.canonical).toBe(
      lang === "en"
        ? "https://www.cengizhankose.com/portfolio"
        : "https://www.cengizhankose.com/tr/portfolio",
    );
    expect(meta.og).toBeTruthy();
    expect(meta.twitter).toBeTruthy();
    expect(meta.title).toBe(
      lang === "en"
        ? "Portfolio | Cengizhan Köse"
        : "Portfolyo | Cengizhan Köse",
    );
  });

  it("gets hreflang alternates once both languages are live (SEO-11)", () => {
    expect(alternatesFor(matchRoute("/portfolio"), {}, ALL_LIVE)).toEqual([
      {
        hreflang: "en",
        href: "https://www.cengizhankose.com/portfolio",
      },
      {
        hreflang: "tr",
        href: "https://www.cengizhankose.com/tr/portfolio",
      },
      {
        hreflang: "x-default",
        href: "https://www.cengizhankose.com/portfolio",
      },
    ]);
  });

  it("the description names the featured set", () => {
    expect(pages["/portfolio"].en.description).toMatch(
      /SalesGym.*Farmin.*effort/i,
    );
    expect(pages["/portfolio"].tr.description).toMatch(
      /SalesGym.*Farmin.*effort/i,
    );
  });

  it("the menu links the portfolio once, in its place (FE-04 exit)", () => {
    renderHeader("/");
    const nav = screen.getByRole("navigation", { name: "Main menu" });

    expect(
      within(nav).getAllByRole("link", { name: "Portfolio" }),
    ).toHaveLength(1);
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/", "/portfolio", "/about", "/blog", "/contact"]);
  });
});
