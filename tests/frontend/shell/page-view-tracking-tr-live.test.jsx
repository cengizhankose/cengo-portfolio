// ANL-07 acceptance, language half: with the TR pages open (LIVE.static =
// ['en', 'tr'], SEO-11 Adım B) Home -> menu -> About -> language switcher ->
// /tr/about is exactly three page views, (page_type, ui_locale) =
// (home, en), (about, en), (about, tr), and none carries the previous page's
// path or title. The route table is mocked with every language open, the
// analytics API is mocked, the pages are stubs.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  trackPageview: vi.fn(),
  setPageContext: vi.fn(),
  initAnalytics: vi.fn(),
}));

vi.mock("../../../src/lib/analytics/index.js", () => analytics);

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});

function stubPage(name) {
  const Page = () => <h1>{name}</h1>;
  Page.displayName = name.replace(/\s+/g, "");
  return Page;
}
vi.mock("../../../src/pages/home", () => ({ Home: stubPage("Home page") }));
vi.mock("../../../src/pages/about", () => ({ About: stubPage("About page") }));
vi.mock("../../../src/pages/portfolio", () => ({
  Portfolio: stubPage("Portfolio page"),
}));
vi.mock("../../../src/pages/contact", () => ({
  ContactUs: stubPage("Contact page"),
}));

const { default: AppRoutes } = await import("../../../src/app/routes.jsx");
const { default: Headermain } = await import("../../../src/header");
const { getPageMeta } = await import("../../../src/seo/pages.js");

const views = () => analytics.trackPageview.mock.calls.map(([view]) => view);

beforeEach(() => {
  analytics.trackPageview.mockReset();
  analytics.setPageContext.mockReset();
  analytics.track.mockReset();
  document.head.innerHTML = "<title>x</title>";
  document.documentElement.lang = "en";
});

describe("with the TR pages live", () => {
  it("Home -> menu -> About -> language switcher is three page views in the right language", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Headermain />
        <AppRoutes />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const menu = screen.getByRole("navigation", { name: "Main menu" });
    fireEvent.click(within(menu).getByRole("link", { name: "About" }));
    fireEvent.click(screen.getByRole("link", { name: "TR – Türkçe" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "About page",
    );
    expect(views()).toHaveLength(3);
    expect(
      views().map(({ pageType, uiLocale }) => [pageType, uiLocale]),
    ).toEqual([
      ["home", "en"],
      ["about", "en"],
      ["about", "tr"],
    ]);
    expect(views().map((view) => view.path)).toEqual([
      "/",
      "/about",
      "/tr/about",
    ]);
    // No view repeats the title or path of the page before it.
    const trAbout = getPageMeta("/tr/about", "tr").title;
    expect(views()[2].title).toBe(trAbout);
    expect(views()[2].title).not.toBe(views()[1].title);
    expect(views()[1].title).not.toBe(views()[0].title);
    expect(views()[2].contentLanguage).toBe("tr");
  });

  it("a TR landing page is reported in tr", () => {
    render(
      <MemoryRouter initialEntries={["/tr"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(views()).toHaveLength(1);
    expect(views()[0]).toMatchObject({
      path: "/tr",
      pageType: "home",
      uiLocale: "tr",
      contentLanguage: "tr",
    });
  });
});
