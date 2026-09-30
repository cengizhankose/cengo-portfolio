// ANL-07 x ANL-05: the order of what reaches Umami when a page that reports
// something as it mounts (NotFound: not_found_viewed) replaces another page.
//
// React runs a child's passive effect before its parent's. The route shell's
// hook therefore sends the page view from a layout effect: the page_view goes
// out first, and the event that follows carries the new page's url, title and
// referrer (analytics/index.js holds the current page; a late page_view left
// it on the page being left). The other shell tests mock analytics/index.js
// completely, so this order is invisible to them. Here the real analytics
// module runs, with window.umami faked, like tests/frontend/analytics/
// index.test.js; the pages are stubs, NotFound and BlogPost are real.
import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, useNavigate } from "react-router-dom";
import { SWRConfig } from "swr";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { swrConfig } from "../../../src/lib/swr.js";

vi.mock("../../../src/lib/webVitals.js", () => ({ initWebVitals: vi.fn() }));

function stubPage(name) {
  const Page = () => <h1>{name}</h1>;
  Page.displayName = name.replace(/\s+/g, "");
  return Page;
}
vi.mock("../../../src/pages/home", () => ({ Home: stubPage("Home page") }));
vi.mock("../../../src/pages/about", () => ({ About: stubPage("About page") }));

const analytics = await import("../../../src/lib/analytics/index.js");
const { default: AppRoutes } = await import("../../../src/app/routes.jsx");

const WEBSITE_ID = "b59e9c65-ae32-47f1-8400-119fcf4861c4";
// What the real tracker would hand to the function form of umami.track (its
// own url/title/referrer are those of the first load).
const TRACKER_BASE = Object.freeze({
  website: WEBSITE_ID,
  hostname: "www.cengizhankose.com",
  screen: "1440x900",
  language: "en-US",
  title: "first-load title",
  url: "/first-load",
  referrer: "https://first-load-referrer.example/",
});

const NOT_FOUND_TITLE = "Page not found | Cengizhan Köse";
const POST_NOT_FOUND_TITLE = "Post not found | Cengizhan Köse";
const ABOUT_TITLE = "About | Cengizhan Köse";

const umamiTrack = vi.fn(() => Promise.resolve());

// Everything sent so far, as the tracker would build it. A send without a
// name is Umami's own page view; the others are events.
const sends = () =>
  umamiTrack.mock.calls.map(([build]) => build({ ...TRACKER_BASE }));
const summary = (payload) => ({
  name: payload.name ?? "(umami pageview)",
  url: payload.url,
  title: payload.title,
});
const sequence = () => sends().map(summary);

let navigate;
function Probe() {
  navigate = useNavigate();
  return (
    <nav aria-label="test links">
      <Link to="/about">about</Link>
      <Link to="/nope">nope</Link>
    </nav>
  );
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function renderAt(path, { strict = false } = {}) {
  const tree = (
    <SWRConfig
      value={{
        ...swrConfig,
        provider: () => new Map(),
        onErrorRetry: () => {},
      }}
    >
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <AppRoutes />
      </MemoryRouter>
    </SWRConfig>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeAll(async () => {
  // The BlogPost chunk and the markdown chain behind it are imported cold
  // the first time; on a busy machine that can take longer than one test's 5 s.
  await import("../../../src/pages/blog/BlogPost");

  // Production build, www-like allowlist (jsdom runs on localhost), tracker
  // "loaded": window.umami exists, so every send is delivered at once.
  analytics.initAnalytics({
    config: {
      provider: "umami",
      scriptSrc: "https://stats.cengizhankose.com/script.js",
      websiteId: WEBSITE_ID,
      domains: ["www.cengizhankose.com"],
      allowedHosts: [window.location.hostname],
      respectDoNotTrack: false,
    },
    isProd: true,
  });
  window.umami = { track: umamiTrack };
  document.getElementById("umami-tracker").dispatchEvent(new Event("load"));
}, 60_000);

afterAll(() => {
  delete window.umami;
  document.getElementById("umami-tracker")?.remove();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  umamiTrack.mockClear();
  document.head.innerHTML = "<title>x</title>";
  document.documentElement.lang = "en";
});

describe("an unknown path opened by navigation", () => {
  it("sends the page view first, then not_found_viewed with the new page's url, title and referrer", async () => {
    renderAt("/about");
    await screen.findByText("About page");
    // The page being left is on screen and is the analytics current page.
    expect(sends().at(-1)).toMatchObject({
      name: "page_view",
      url: "/about",
      title: ABOUT_TITLE,
    });

    umamiTrack.mockClear();
    fireEvent.click(screen.getByRole("link", { name: "nope" }));
    await screen.findByRole("heading", { level: 1, name: /not found/i });

    expect(sequence()).toEqual([
      { name: "(umami pageview)", url: "/nope", title: NOT_FOUND_TITLE },
      { name: "page_view", url: "/nope", title: NOT_FOUND_TITLE },
      { name: "not_found_viewed", url: "/nope", title: NOT_FOUND_TITLE },
    ]);

    const [, pageView, notFoundViewed] = sends();
    expect(pageView.referrer).toBe("/about");
    expect(notFoundViewed.referrer).toBe("/about");
    expect(notFoundViewed.data).toMatchObject({
      page_type: "not_found",
      requested_path_group: "other",
      referrer_host: "internal",
    });
  });

  it("does the same on the way from the home page, from an unknown path to another, and under StrictMode", async () => {
    renderAt("/about", { strict: true });
    await screen.findByText("About page");

    umamiTrack.mockClear();
    await act(async () => navigate("/nope"));
    await screen.findByRole("heading", { level: 1, name: /not found/i });
    await act(async () => navigate("/nope-either"));
    await screen.findByRole("heading", { level: 1, name: /not found/i });

    expect(sequence()).toEqual([
      { name: "(umami pageview)", url: "/nope", title: NOT_FOUND_TITLE },
      { name: "page_view", url: "/nope", title: NOT_FOUND_TITLE },
      { name: "not_found_viewed", url: "/nope", title: NOT_FOUND_TITLE },
      { name: "(umami pageview)", url: "/nope-either", title: NOT_FOUND_TITLE },
      { name: "page_view", url: "/nope-either", title: NOT_FOUND_TITLE },
      { name: "not_found_viewed", url: "/nope-either", title: NOT_FOUND_TITLE },
    ]);
    expect(sends()[3].referrer).toBe("/nope");
    expect(sends()[5].referrer).toBe("/nope");
  });

  it("a missing post (API 404) arrives after the post page: page view first, then not_found_viewed, both on the post's url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "Not found", code: "not_found" }, 404)),
    );
    renderAt("/about");
    await screen.findByText("About page");

    umamiTrack.mockClear();
    await act(async () => navigate("/blog/no-such-post"));
    await screen.findByRole("heading", { level: 1, name: /not found/i });

    expect(sequence()).toEqual([
      {
        name: "(umami pageview)",
        url: "/blog/no-such-post",
        title: POST_NOT_FOUND_TITLE,
      },
      {
        name: "page_view",
        url: "/blog/no-such-post",
        title: POST_NOT_FOUND_TITLE,
      },
      {
        name: "not_found_viewed",
        url: "/blog/no-such-post",
        title: POST_NOT_FOUND_TITLE,
      },
    ]);
    expect(sends()[2].data).toMatchObject({
      page_type: "not_found",
      requested_path_group: "blog",
      referrer_host: "internal",
    });
  });
});

describe("an unknown path opened by a hard load", () => {
  it("sends one page view and then one not_found_viewed, both on that url", async () => {
    renderAt("/this-path-does-not-exist", { strict: true });
    await screen.findByRole("heading", { level: 1, name: /not found/i });

    expect(sequence()).toEqual([
      {
        name: "(umami pageview)",
        url: "/this-path-does-not-exist",
        title: NOT_FOUND_TITLE,
      },
      {
        name: "page_view",
        url: "/this-path-does-not-exist",
        title: NOT_FOUND_TITLE,
      },
      {
        name: "not_found_viewed",
        url: "/this-path-does-not-exist",
        title: NOT_FOUND_TITLE,
      },
    ]);
  });
});
