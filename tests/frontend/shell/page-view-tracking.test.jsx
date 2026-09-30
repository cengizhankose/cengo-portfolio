// ANL-07: one page_view per page, sent after the page has rendered, with an
// explicit page_type / ui_locale / title derived from the URL. The hook runs
// in the route shell (src/app/routes.jsx); the analytics API is mocked, the
// pages are stubs.
import { StrictMode, useEffect } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  trackPageview: vi.fn(),
  setPageContext: vi.fn(),
  initAnalytics: vi.fn(),
  // What was on screen each time trackPageview() ran.
  headingsAtCall: [],
  // The last page context, and how many page views had been sent, at the
  // moment a page's own effect ran.
  contextAtPageEffect: [],
  viewsAtPageEffect: [],
}));

vi.mock("../../../src/lib/analytics/index.js", () => ({
  track: analytics.track,
  trackPageview: analytics.trackPageview,
  setPageContext: analytics.setPageContext,
  initAnalytics: analytics.initAnalytics,
}));

function stubPage(name) {
  const Page = () => {
    // Children's passive effects run before the hook's passive effects would:
    // the page context and the page view must already be this page's (the
    // hook sends both from layout effects).
    useEffect(() => {
      analytics.contextAtPageEffect.push([
        name,
        analytics.setPageContext.mock.calls.at(-1)?.[0],
      ]);
      analytics.viewsAtPageEffect.push([
        name,
        analytics.trackPageview.mock.calls.map(([view]) => view.pageType),
      ]);
    }, []);
    return <h1>{name}</h1>;
  };
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
const { getPageMeta } = await import("../../../src/seo/pages.js");

let navigate;
function Links() {
  navigate = useNavigate();
  return (
    <nav aria-label="test links">
      <Link to="/">home</Link>
      <Link to="/about">about</Link>
      <Link to="/about#team">about team</Link>
      <Link to="/contact">contact</Link>
    </nav>
  );
}

function renderAt(path, { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <Links />
      <AppRoutes />
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const click = (name) => fireEvent.click(screen.getByRole("link", { name }));
const views = () => analytics.trackPageview.mock.calls.map(([view]) => view);
const titleOf = (path) => getPageMeta(path, "en").title;

beforeEach(() => {
  analytics.trackPageview.mockReset();
  analytics.setPageContext.mockReset();
  analytics.track.mockReset();
  analytics.headingsAtCall.length = 0;
  analytics.contextAtPageEffect.length = 0;
  analytics.viewsAtPageEffect.length = 0;
  analytics.trackPageview.mockImplementation(() => {
    analytics.headingsAtCall.push(
      document.querySelector("h1")?.textContent ?? null,
    );
  });
});

describe("the first page of a visit", () => {
  it("sends one page_view after the page has rendered", () => {
    renderAt("/");

    expect(analytics.trackPageview).toHaveBeenCalledTimes(1);
    expect(views()[0]).toEqual({
      path: "/",
      search: "",
      pageType: "home",
      uiLocale: "en",
      contentLanguage: "en",
      title: titleOf("/"),
    });
    expect(analytics.headingsAtCall).toEqual(["Home page"]);
  });

  it("passes the query string for the first view (UTM filtering is analytics' job)", () => {
    renderAt("/?utm_source=linkedin&utm_medium=social");

    expect(views()[0]).toMatchObject({
      path: "/",
      search: "?utm_source=linkedin&utm_medium=social",
    });
  });

  it("sends exactly one under StrictMode's double effect run", () => {
    renderAt("/about", { strict: true });

    expect(analytics.trackPageview).toHaveBeenCalledTimes(1);
    expect(views()[0]).toMatchObject({ path: "/about", pageType: "about" });
  });
});

describe("page changes", () => {
  it("send one page_view per page, each about its own page, after it rendered", () => {
    renderAt("/");

    click("about");
    click("contact");

    expect(views().map((view) => view.path)).toEqual([
      "/",
      "/about",
      "/contact",
    ]);
    expect(views().map((view) => view.pageType)).toEqual([
      "home",
      "about",
      "contact",
    ]);
    expect(views().map((view) => view.title)).toEqual([
      titleOf("/"),
      "About | Cengizhan Köse",
      "Contact | Cengizhan Köse",
    ]);
    expect(new Set(views().map((view) => view.title)).size).toBe(3);
    // The new page was on screen when its view was sent.
    expect(analytics.headingsAtCall).toEqual([
      "Home page",
      "About page",
      "Contact page",
    ]);
  });

  it("send one per page change under StrictMode", () => {
    renderAt("/", { strict: true });

    click("about");

    expect(views().map((view) => view.path)).toEqual(["/", "/about"]);
  });

  it("send one page_view on the back button, for the page returned to", async () => {
    renderAt("/");
    click("about");
    analytics.trackPageview.mockClear();

    await act(async () => navigate(-1));

    expect(views()).toHaveLength(1);
    expect(views()[0]).toMatchObject({ path: "/", pageType: "home" });
    expect(analytics.headingsAtCall.at(-1)).toBe("Home page");
  });

  it("send nothing for a hash change, an anchor or the link of the page you are on", () => {
    renderAt("/");
    click("about");
    analytics.trackPageview.mockClear();

    click("about team");
    click("about");

    expect(analytics.trackPageview).not.toHaveBeenCalled();
  });

  it("do not carry the query string of later pages (first view only)", () => {
    renderAt("/");

    click("about");

    expect(views()[1].search).toBe("");
  });
});

describe("the page context", () => {
  it("is set before the page's own effects run, so its events carry this page", () => {
    renderAt("/");
    click("about");

    const [home, about] = analytics.contextAtPageEffect;
    expect(home).toEqual([
      "Home page",
      { page_type: "home", ui_locale: "en", content_language: "en" },
    ]);
    expect(about).toEqual([
      "About page",
      { page_type: "about", ui_locale: "en", content_language: "en" },
    ]);
  });

  it("the page view is sent before the page's own effects run (ANL-05 order)", () => {
    renderAt("/");
    click("about");

    expect(analytics.viewsAtPageEffect).toEqual([
      ["Home page", ["home"]],
      ["About page", ["home", "about"]],
    ]);
  });
});

describe("unknown and closed routes", () => {
  it("an unknown path is a not_found view with the not-found title", () => {
    renderAt("/does-not-exist");

    expect(views()).toHaveLength(1);
    expect(views()[0]).toMatchObject({
      path: "/does-not-exist",
      pageType: "not_found",
      uiLocale: "en",
      title: "Page not found | Cengizhan Köse",
    });
    expect(views()[0].postSlug).toBeUndefined();
  });

  it("a path in a language that is not open yet is what the visitor sees: not_found, in the URL's ui_locale", () => {
    renderAt("/tr/about");

    expect(views()).toHaveLength(1);
    expect(views()[0]).toMatchObject({
      path: "/tr/about",
      pageType: "not_found",
      uiLocale: "tr",
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /not found/i,
    );
  });

  it("a scanner path is not a page", () => {
    renderAt("/wp-login.php");

    expect(views()[0]).toMatchObject({ pageType: "not_found" });
  });
});
