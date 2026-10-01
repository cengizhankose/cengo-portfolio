// ANL-09: outbound_link_clicked {network, location, link_host?} from one
// delegated capture-phase listener (src/lib/analytics/outbound.js), started
// by initAnalytics() only when tracking is on. The URL itself is never sent.
//
// Plan command: `bunx vitest run tests/frontend/analytics/outbound.test.js`;
// the package scope puts the test here (tests/frontend/social/**).
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Socialicons } from "../../../src/components/socialicons";
import Headermain from "../../../src/header";
import { NETWORKS } from "../../../src/lib/analytics/events.js";
import {
  initOutboundTracking,
  linkLocation,
  networkFromHost,
  outboundProps,
  stopOutboundTracking,
} from "../../../src/lib/analytics/outbound.js";
import PostMarkdown from "../../../src/pages/blog/PostMarkdown.jsx";
import { SOCIAL_PROFILES } from "../../../src/seo/site.js";
import headerStyles from "../../../src/header/header.module.css";
import railStyles from "../../../src/components/socialicons/socialicons.module.css";

vi.mock("../../../src/lib/webVitals.js", () => ({ initWebVitals: vi.fn() }));

// jsdom cannot open the links it is asked to follow ("Not implemented:
// navigation"); cancel the default action once every listener has run.
const cancelNavigation = (event) => event.preventDefault();
beforeEach(() => window.addEventListener("click", cancelNavigation));
afterEach(() => window.removeEventListener("click", cancelNavigation));

describe("networkFromHost (ANL-09 criterion 1)", () => {
  it.each([
    ["www.linkedin.com", "linkedin"],
    ["linkedin.com", "linkedin"],
    ["tr.linkedin.com", "linkedin"],
    ["lnkd.in", "linkedin"],
    ["github.com", "github"],
    ["gist.github.com", "github"],
    ["x.com", "x"],
    ["twitter.com", "x"],
    ["mobile.twitter.com", "x"],
    ["youtu.be", "youtube"],
    ["www.youtube.com", "youtube"],
    ["m.youtube.com", "youtube"],
    ["www.twitch.tv", "twitch"],
    ["www.instagram.com", "instagram"],
    ["WWW.LinkedIn.COM.", "linkedin"],
    ["www.facebook.com", "other"],
    ["example.org", "other"],
    ["notgithub.com", "other"],
    ["github.com.evil.example", "other"],
    ["", "other"],
    [undefined, "other"],
  ])("%s -> %s", (host, network) => {
    expect(networkFromHost(host)).toBe(network);
  });

  it("NETWORKS is the K-11 enum plus other", () => {
    expect(NETWORKS).toEqual([
      "linkedin",
      "github",
      "x",
      "youtube",
      "twitch",
      "instagram",
      "other",
    ]);
  });

  it("maps every SOCIAL_PROFILES URL to its own id", () => {
    for (const { id, url } of SOCIAL_PROFILES) {
      expect(networkFromHost(new URL(url).hostname), id).toBe(id);
    }
  });
});

describe("outboundProps (what a click sends)", () => {
  const OPTS = {
    baseUrl: "https://www.cengizhankose.com/blog/post",
    currentHost: "www.cengizhankose.com",
  };

  function anchor(html) {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    return host.querySelector("a");
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("a social link: network + location, no link_host, no URL", () => {
    const a = anchor(
      '<nav data-analytics-location="social_rail"><a href="https://github.com/cengizhankose?tab=repositories">x</a></nav>',
    );
    const props = outboundProps(a, OPTS);
    expect(props).toEqual({ network: "github", location: "social_rail" });
    expect(JSON.stringify(props)).not.toMatch(/cengizhankose\?|tab=/);
  });

  it("another host: network other + bare lower-case link_host", () => {
    const a = anchor(
      '<div data-analytics-location="blog_body"><a href="https://Docs.Example.org/a/b?secret=1#x">x</a></div>',
    );
    expect(outboundProps(a, OPTS)).toEqual({
      network: "other",
      location: "blog_body",
      link_host: "docs.example.org",
    });
  });

  it("location falls back to other (missing or not a token)", () => {
    expect(
      outboundProps(anchor('<a href="https://x.com/a">x</a>'), OPTS),
    ).toEqual({ network: "x", location: "other" });
    expect(
      linkLocation(
        anchor(
          '<div data-analytics-location="Not A Token!"><a href="https://x.com/a">x</a></div>',
        ),
      ),
    ).toBe("other");
  });

  it.each([
    ["/about", "an internal path"],
    ["/tr/about", "the language switcher target"],
    ["https://www.cengizhankose.com/blog", "an absolute link to this site"],
    ["https://cengizhankose.com/blog", "the apex host"],
    ["mailto:me@cengizhankose.com", "a mailto link"],
    ["tel:+900000000000", "a tel link"],
    ["#user-content-fn-1", "a fragment"],
    ["notes.md", "a relative path"],
  ])("%s (%s) is not outbound", (href) => {
    expect(outboundProps(anchor(`<a href="${href}">x</a>`), OPTS)).toBeNull();
  });

  it.each(["project", "cv", "PROJECT"])(
    "data-track=%s links have their own event",
    (track) => {
      expect(
        outboundProps(
          anchor(`<a data-track="${track}" href="https://github.com/a">x</a>`),
          OPTS,
        ),
      ).toBeNull();
    },
  );

  it("ignores anchors without href and bad input", () => {
    expect(outboundProps(anchor("<a>x</a>"), OPTS)).toBeNull();
    expect(outboundProps(null, OPTS)).toBeNull();
    expect(outboundProps({}, OPTS)).toBeNull();
  });
});

describe("initOutboundTracking (delegated listener)", () => {
  let send;
  let stop;

  beforeEach(() => {
    send = vi.fn();
    stop = initOutboundTracking({ send, doc: document });
  });

  afterEach(() => {
    stop();
  });

  const renderShell = (path = "/") =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Headermain />
        <aside>
          <Socialicons />
        </aside>
      </MemoryRouter>,
    );

  it("each of the six rail icons sends its own network with location social_rail (criterion 2)", () => {
    renderShell();
    const rail = [...document.querySelectorAll(`.${railStyles.rail} a`)];
    expect(rail).toHaveLength(6);
    for (const link of rail) fireEvent.click(link.querySelector("svg"));

    expect(send.mock.calls).toEqual(
      SOCIAL_PROFILES.map(({ id }) => [
        "outbound_link_clicked",
        { network: id, location: "social_rail" },
      ]),
    );
  });

  it("the menu footer GitHub link sends location menu_footer (criterion 3)", () => {
    renderShell();
    const github = [
      ...document.querySelectorAll(`.${headerStyles.menuFooter} a`),
    ].find((a) => a.textContent === "GitHub");
    fireEvent.click(github);
    expect(send).toHaveBeenCalledExactlyOnceWith("outbound_link_clicked", {
      network: "github",
      location: "menu_footer",
    });
  });

  it("an external link in a post sends location blog_body (criterion 3)", () => {
    render(
      <MemoryRouter>
        <PostMarkdown
          content={
            "See [the docs](https://example.org/guide?id=7) and [about](/about)."
          }
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("the docs"));
    fireEvent.click(screen.getByText("about"));
    expect(send.mock.calls).toEqual([
      [
        "outbound_link_clicked",
        { network: "other", location: "blog_body", link_host: "example.org" },
      ],
    ]);
  });

  it("internal links, the language switcher and mailto send nothing (criterion 4)", () => {
    renderShell();
    const internal = [...document.querySelectorAll("a[href]")].filter(
      (a) => !/^https?:/.test(a.getAttribute("href")),
    );
    expect(internal.length).toBeGreaterThan(0);
    const mail = document.createElement("a");
    mail.href = "mailto:me@cengizhankose.com";
    document.body.append(mail);

    for (const link of [...internal, mail]) fireEvent.click(link);
    expect(send).not.toHaveBeenCalled();
    mail.remove();
  });

  it("middle click (auxclick button 1) counts, right click does not", () => {
    renderShell();
    const link = document.querySelector(`.${railStyles.rail} a`);
    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, button: 2 }));
    expect(send).not.toHaveBeenCalled();
    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(send).toHaveBeenCalledExactlyOnceWith("outbound_link_clicked", {
      network: "linkedin",
      location: "social_rail",
    });
  });

  it("runs in the capture phase: a handler that stops the click cannot hide it", () => {
    renderShell();
    const link = document.querySelector(`.${railStyles.rail} a`);
    const blocker = (event) => event.stopPropagation();
    link.parentElement.addEventListener("click", blocker);
    fireEvent.click(link);
    link.parentElement.removeEventListener("click", blocker);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never prevents the navigation and survives a throwing send", () => {
    renderShell();
    stop();
    stop = initOutboundTracking({
      send: () => {
        throw new Error("boom");
      },
      doc: document,
    });
    const link = document.querySelector(`.${railStyles.rail} a`);
    // Read the flag on the link itself: after the document's capture
    // listener, before the test's own canceller on window.
    let prevented;
    link.addEventListener("click", (event) => {
      prevented = event.defaultPrevented;
    });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    expect(() => link.dispatchEvent(event)).not.toThrow();
    expect(prevented).toBe(false);
  });

  it("stop() removes the listener; a second start replaces the first", () => {
    renderShell();
    const link = document.querySelector(`.${railStyles.rail} a`);
    const second = vi.fn();
    const stopSecond = initOutboundTracking({ send: second, doc: document });
    fireEvent.click(link);
    expect(send).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    stopSecond();
    fireEvent.click(link);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stopOutboundTracking(doc) removes whatever listener the document has", () => {
    renderShell();
    stopOutboundTracking(document);
    fireEvent.click(document.querySelector(`.${railStyles.rail} a`));
    expect(send).not.toHaveBeenCalled();
    expect(() => stopOutboundTracking(document)).not.toThrow();
  });

  it("does nothing without a send function", () => {
    const noop = initOutboundTracking({ doc: document });
    expect(noop).toBeTypeOf("function");
    expect(() => noop()).not.toThrow();
  });
});

describe("initAnalytics wiring (ANL-09 step 4)", () => {
  const WEBSITE_ID = "b59e9c65-ae32-47f1-8400-119fcf4861c4";
  const config = {
    provider: "umami",
    scriptSrc: "https://stats.cengizhankose.com/script.js",
    websiteId: WEBSITE_ID,
    domains: ["www.cengizhankose.com"],
    allowedHosts: [window.location.hostname],
    respectDoNotTrack: true,
  };
  let umamiTrack;

  beforeEach(() => {
    vi.resetModules();
    umamiTrack = vi.fn(() => Promise.resolve());
  });

  afterEach(() => {
    stopOutboundTracking(document);
    delete window.umami;
    document.getElementById("umami-tracker")?.remove();
    document.body.innerHTML = "";
  });

  function socialLink() {
    const box = document.createElement("div");
    box.setAttribute("data-analytics-location", "social_rail");
    box.innerHTML =
      '<a href="https://www.youtube.com/@cengizhankse" target="_blank">YouTube</a>';
    document.body.append(box);
    return box.firstElementChild;
  }

  it("tracking on: a click reaches Umami as outbound_link_clicked without the URL", async () => {
    const analytics = await import("../../../src/lib/analytics/index.js");
    expect(analytics.initAnalytics({ config, isProd: true })).toBe(true);
    window.umami = { track: umamiTrack };
    document.getElementById("umami-tracker").dispatchEvent(new Event("load"));

    fireEvent.click(socialLink());

    expect(umamiTrack).toHaveBeenCalledTimes(1);
    const [build] = umamiTrack.mock.calls[0];
    const payload = build({ website: WEBSITE_ID });
    expect(payload.name).toBe("outbound_link_clicked");
    expect(payload.data).toEqual({
      network: "youtube",
      location: "social_rail",
    });
    expect(JSON.stringify(payload.data)).not.toMatch(/youtube\.com|@/);
  });

  it("tracking off (dev/test default): no listener, nothing sent", async () => {
    const analytics = await import("../../../src/lib/analytics/index.js");
    window.umami = { track: umamiTrack };
    expect(analytics.initAnalytics()).toBe(false);

    fireEvent.click(socialLink());
    expect(umamiTrack).not.toHaveBeenCalled();
  });
});
