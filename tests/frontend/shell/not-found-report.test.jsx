// ANL-05: the not-found page reports `not_found_viewed` once per mount, with
// the coarse path group and the referrer host (never the path), and sends no
// page_view of its own; the route shell's hook sends that one, as page_type
// `not_found` (ANL-07). Together a bad path is exactly one of each.
import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  trackPageview: vi.fn(),
  setPageContext: vi.fn(),
  initAnalytics: vi.fn(),
}));

vi.mock("../../../src/lib/analytics/index.js", () => analytics);

function stubPage(name) {
  const Page = () => <h1>{name}</h1>;
  Page.displayName = name.replace(/\s+/g, "");
  return Page;
}
vi.mock("../../../src/pages/home", () => ({ Home: stubPage("Home page") }));
vi.mock("../../../src/pages/about", () => ({ About: stubPage("About page") }));

const { NotFound } = await import("../../../src/pages/notfound");
const { referrerHost, notFoundViewedProps } =
  await import("../../../src/pages/notfound/report.js");
const { default: AppRoutes } = await import("../../../src/app/routes.jsx");
const { PATH_GROUPS, EVENTS, sanitizeProps } =
  await import("../../../src/lib/analytics/events.js");

const reports = () =>
  analytics.track.mock.calls.filter(([name]) => name === "not_found_viewed");

function setReferrer(value) {
  Object.defineProperty(document, "referrer", {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  analytics.track.mockReset();
  analytics.trackPageview.mockReset();
  analytics.setPageContext.mockReset();
  document.head.innerHTML = "<title>x</title>";
  setReferrer("");
});

afterEach(() => {
  delete document.referrer;
});

describe("not_found_viewed", () => {
  it.each([
    ["/.env", "dotfile"],
    ["/.git/config", "dotfile"],
    ["/wp-login.php", "wp"],
    ["/xmlrpc.php", "php"],
    ["/blog/no-such-post", "blog"],
    ["/api/nope", "api"],
    ["/this-page-does-not-exist-audit", "other"],
    ["/tr/nope", "other"],
  ])("%s -> requested_path_group %s", (path, group) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <NotFound />
      </MemoryRouter>,
    );

    expect(reports()).toEqual([
      [
        "not_found_viewed",
        { requested_path_group: group, referrer_host: "direct" },
      ],
    ]);
  });

  it("carries the group, never the path, and passes the event allowlist", () => {
    const props = notFoundViewedProps("/.env.backup", "default", {
      referrer: "",
      hostname: "www.cengizhankose.com",
    });

    expect(Object.values(props).join(" ")).not.toContain("env.backup");
    expect(PATH_GROUPS).toContain(props.requested_path_group);
    expect(EVENTS.not_found_viewed.props).toEqual([
      "requested_path_group",
      "referrer_host",
    ]);
    expect(sanitizeProps("not_found_viewed", props)).toEqual(props);
  });

  it("is sent once per mount: not again under StrictMode, a re-render or a click on its own path", () => {
    function Own() {
      return <Link to="/nope">again</Link>;
    }
    const { rerender } = render(
      <StrictMode>
        <MemoryRouter initialEntries={["/nope"]}>
          <Own />
          <NotFound />
        </MemoryRouter>
      </StrictMode>,
    );
    expect(reports()).toHaveLength(1);

    fireEvent.click(screen.getByRole("link", { name: "again" }));
    rerender(
      <StrictMode>
        <MemoryRouter initialEntries={["/nope"]}>
          <Own />
          <NotFound />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(reports()).toHaveLength(1);
  });

  it("is sent for a missing post too (variant post)", () => {
    render(
      <MemoryRouter initialEntries={["/blog/gone"]}>
        <NotFound variant="post" />
      </MemoryRouter>,
    );

    expect(reports()).toEqual([
      [
        "not_found_viewed",
        { requested_path_group: "blog", referrer_host: "direct" },
      ],
    ]);
  });

  it("sends no page_view of its own", () => {
    render(
      <MemoryRouter initialEntries={["/nope"]}>
        <NotFound />
      </MemoryRouter>,
    );

    expect(analytics.trackPageview).not.toHaveBeenCalled();
  });
});

describe("referrer_host", () => {
  const env = (referrer, hostname = "www.cengizhankose.com") => ({
    referrer,
    hostname,
  });

  it("is the referrer's host on a full page load from another site", () => {
    expect(referrerHost("default", env("https://www.linkedin.com/feed/"))).toBe(
      "www.linkedin.com",
    );
    expect(referrerHost("default", env("http://Example.ORG/a?b=1"))).toBe(
      "example.org",
    );
  });

  it("is 'direct' on a full page load without a usable referrer", () => {
    expect(referrerHost("default", env(""))).toBe("direct");
    expect(referrerHost("default", env("not a url"))).toBe("direct");
    expect(
      referrerHost("default", env("android-app://com.linkedin.android/")),
    ).toBe("direct");
  });

  it("is 'internal' for a referrer on this site", () => {
    expect(
      referrerHost("default", env("https://www.cengizhankose.com/about")),
    ).toBe("internal");
  });

  it("is 'internal' after in-app navigation, whatever the referrer says", () => {
    expect(referrerHost("k3j2h1", env("https://www.linkedin.com/feed/"))).toBe(
      "internal",
    );
    expect(referrerHost("abc123", env(""))).toBe("internal");
  });

  it("reads the document's referrer and host by default", () => {
    setReferrer("https://news.ycombinator.com/item?id=1");

    expect(referrerHost("default")).toBe("news.ycombinator.com");
  });

  it("only ever returns something the event's host rule accepts", () => {
    for (const value of [
      "https://www.linkedin.com/",
      "https://xn--ko-vla.example/",
      "",
    ]) {
      const host = referrerHost("default", env(value));
      expect(
        sanitizeProps("not_found_viewed", { referrer_host: host }),
      ).toEqual({ referrer_host: host });
    }
  });
});

describe("a bad path in the running shell", () => {
  it("is one page_view (page_type not_found) and one not_found_viewed", () => {
    render(
      <MemoryRouter initialEntries={["/no-such-page"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /not found/i,
    );
    expect(analytics.trackPageview).toHaveBeenCalledTimes(1);
    expect(analytics.trackPageview.mock.calls[0][0]).toMatchObject({
      pageType: "not_found",
      path: "/no-such-page",
    });
    expect(reports()).toHaveLength(1);
    // The not_found_viewed event was sent with this page's context already set.
    expect(analytics.setPageContext.mock.calls[0][0]).toMatchObject({
      page_type: "not_found",
    });
  });

  it("an in-app move to a bad path reports the referrer as internal, once", () => {
    function Bad() {
      return <Link to="/gone-page">bad link</Link>;
    }
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Bad />
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(reports()).toHaveLength(0);

    fireEvent.click(screen.getByRole("link", { name: "bad link" }));

    expect(reports()).toEqual([
      [
        "not_found_viewed",
        { requested_path_group: "other", referrer_host: "internal" },
      ],
    ]);
  });

  it("two bad paths in a row are two views", () => {
    function Two() {
      return (
        <>
          <Link to="/gone-one">one</Link>
          <Link to="/.env">two</Link>
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Two />
        <AppRoutes />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "one" }));
    fireEvent.click(screen.getByRole("link", { name: "two" }));

    expect(reports().map(([, props]) => props.requested_path_group)).toEqual([
      "other",
      "dotfile",
    ]);
  });
});
