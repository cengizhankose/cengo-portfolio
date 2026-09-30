// ANL-01 / ANL-03 / ANL-16 / ANL-18: the analytics module end to end, with
// window.umami mocked (the tracker script is never fetched in jsdom).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/webVitals.js", () => ({ initWebVitals: vi.fn() }));

const WEBSITE_ID = "b59e9c65-ae32-47f1-8400-119fcf4861c4";
const SCRIPT_SRC = "https://stats.cengizhankose.com/script.js";
// Default payload the real tracker would build (auto-track off keeps the
// first-load URL, including a query string we must never forward).
const TRACKER_BASE = {
  website: WEBSITE_ID,
  hostname: "www.cengizhankose.com",
  screen: "1440x900",
  language: "tr-TR",
  title: "first-load title",
  url: "https://www.cengizhankose.com/?email=leak%40example.com",
  referrer: "https://first-load-referrer.example/",
};

const config = (overrides = {}) => ({
  provider: "umami",
  scriptSrc: SCRIPT_SRC,
  websiteId: WEBSITE_ID,
  domains: ["www.cengizhankose.com"],
  // jsdom runs on localhost; the real allowlist is covered in guard/config tests
  allowedHosts: [window.location.hostname],
  respectDoNotTrack: true,
  ...overrides,
});

let analytics;
let umamiTrack;

const tracker = () => document.getElementById("umami-tracker");
const sentPayloads = () =>
  umamiTrack.mock.calls.map(([build]) => build({ ...TRACKER_BASE }));
const lastPayload = () => sentPayloads().at(-1);

function start(overrides) {
  return analytics.initAnalytics({ config: config(overrides), isProd: true });
}

function loadTracker() {
  window.umami = { track: umamiTrack };
  tracker().dispatchEvent(new Event("load"));
}

function setReferrer(value) {
  Object.defineProperty(document, "referrer", {
    value,
    configurable: true,
  });
}

beforeEach(async () => {
  vi.resetModules();
  analytics = await import("../../../src/lib/analytics/index.js");
  umamiTrack = vi.fn(() => Promise.resolve());
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  delete window.umami;
  tracker()?.remove();
  delete document.referrer;
  delete window.navigator.doNotTrack;
  window.history.replaceState(null, "", "/");
});

describe("initAnalytics guard (ANL-16)", () => {
  it("is a no-op in tests/dev: default call loads nothing (criterion 2)", () => {
    window.umami = { track: umamiTrack };
    expect(analytics.initAnalytics()).toBe(false);
    expect(tracker()).toBeNull();
    expect(analytics.track("cta_clicked", { cta_id: "hero_contact" })).toBe(
      false,
    );
    expect(umamiTrack).not.toHaveBeenCalled();
  });

  it("is a no-op in a non-production build even when configured", () => {
    expect(analytics.initAnalytics({ config: config(), isProd: false })).toBe(
      false,
    );
    expect(tracker()).toBeNull();
  });

  it("is a no-op without a website id", () => {
    expect(start({ provider: "none", websiteId: "" })).toBe(false);
    expect(tracker()).toBeNull();
  });

  it("is a no-op on a host outside the allowlist", () => {
    expect(start({ allowedHosts: ["www.cengizhankose.com"] })).toBe(false);
    expect(tracker()).toBeNull();
  });

  it("is a no-op for an opted-out browser", () => {
    window.localStorage.setItem("cengo:analytics-optout", "1");
    expect(start()).toBe(false);
    expect(tracker()).toBeNull();
  });

  it("?analytics=off on the landing URL opts out before anything loads", () => {
    window.history.replaceState(null, "", "/?analytics=off&utm_source=x");
    expect(start()).toBe(false);
    expect(tracker()).toBeNull();
    expect(window.localStorage.getItem("cengo:analytics-optout")).toBe("1");
    expect(window.localStorage.getItem("umami.disabled")).toBe("1");
    expect(window.location.search).toBe("?utm_source=x");
  });

  it("honours Do Not Track", () => {
    Object.defineProperty(window.navigator, "doNotTrack", {
      value: "1",
      configurable: true,
    });
    expect(start()).toBe(false);
    expect(tracker()).toBeNull();
  });

  it("drops calls made before a disabled init", () => {
    analytics.track("cta_clicked", { cta_id: "hero_contact" });
    expect(start({ provider: "none" })).toBe(false);
    window.umami = { track: umamiTrack };
    expect(analytics.track("cta_clicked", { cta_id: "hero_about" })).toBe(
      false,
    );
    expect(umamiTrack).not.toHaveBeenCalled();
  });
});

describe("tracker tag (ANL-01, PERF-23, T-13)", () => {
  it("injects one non-blocking Umami tag with the planned attributes", () => {
    expect(start()).toBe(true);
    const script = tracker();
    expect(script.getAttribute("src")).toBe(SCRIPT_SRC);
    expect(script.defer).toBe(true);
    expect(script.getAttribute("data-website-id")).toBe(WEBSITE_ID);
    expect(script.getAttribute("data-auto-track")).toBe("false");
    expect(script.getAttribute("data-domains")).toBe("www.cengizhankose.com");
    expect(script.getAttribute("data-do-not-track")).toBe("true");
    // ANL-03 step 3: the query string must stay available to the tracker
    expect(script.hasAttribute("data-exclude-search")).toBe(false);
    expect(script.parentNode).toBe(document.head);

    expect(start()).toBe(true);
    expect(document.querySelectorAll("#umami-tracker")).toHaveLength(1);
  });

  it("starts web-vitals only when tracking is on (ANL-06 step 2)", async () => {
    const vitals = await import("../../../src/lib/webVitals.js");
    vitals.initWebVitals.mockClear();
    expect(start()).toBe(true);
    await vi.waitFor(() =>
      expect(vitals.initWebVitals).toHaveBeenCalledTimes(1),
    );
  });

  it("does not load web-vitals when tracking is off", async () => {
    const vitals = await import("../../../src/lib/webVitals.js");
    vitals.initWebVitals.mockClear();
    expect(start({ provider: "none" })).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vitals.initWebVitals).not.toHaveBeenCalled();
  });
});

describe("page views and events (ANL-01 criterion, ANL-03)", () => {
  it("events after an SPA navigation carry the new page's url", () => {
    setReferrer("https://www.linkedin.com/in/someone?trk=public_profile");
    start();
    loadTracker();

    analytics.trackPageview({
      path: "/",
      search: "?utm_source=linkedin&utm_medium=social&email=a%40b.c",
      pageType: "home",
      uiLocale: "en",
      contentLanguage: "en",
      title: "Cengizhan Köse | Senior Fullstack Engineer",
    });
    analytics.trackPageview({
      path: "/about",
      pageType: "about",
      uiLocale: "en",
      contentLanguage: "en",
      title: "About | Cengizhan Köse",
    });
    analytics.track("cta_clicked", { cta_id: "hero_contact" });

    const [firstView, firstEvent, secondView, secondEvent, cta] =
      sentPayloads();

    // 1st page view: Umami page view (no name) with UTM, external referrer
    expect(firstView.name).toBeUndefined();
    expect(firstView.url).toBe("/?utm_source=linkedin&utm_medium=social");
    expect(firstView.referrer).toBe("https://www.linkedin.com/in/someone");
    expect(firstView.title).toBe("Cengizhan Köse | Senior Fullstack Engineer");
    expect(firstView.website).toBe(WEBSITE_ID);
    expect(firstEvent).toMatchObject({
      name: "page_view",
      url: "/?utm_source=linkedin&utm_medium=social",
      data: { page_type: "home", ui_locale: "en", content_language: "en" },
    });

    // 2nd page view: bare path, previous path as referrer
    expect(secondView).toMatchObject({ url: "/about", referrer: "/" });
    expect(secondView.name).toBeUndefined();
    expect(secondEvent).toMatchObject({
      name: "page_view",
      url: "/about",
      data: { page_type: "about" },
    });

    // the CTA click belongs to /about, not to the first page
    expect(cta).toMatchObject({
      name: "cta_clicked",
      url: "/about",
      title: "About | Cengizhan Köse",
      data: {
        cta_id: "hero_contact",
        page_type: "about",
        ui_locale: "en",
        content_language: "en",
      },
    });
    for (const payload of sentPayloads()) {
      expect(JSON.stringify(payload)).not.toContain("leak");
      expect(JSON.stringify(payload)).not.toContain("email");
    }
  });

  it("keeps UTM parameters on the first page view only (ANL-03 step 2)", () => {
    start();
    loadTracker();
    analytics.trackPageview({ path: "/", search: "?utm_source=github" });
    analytics.trackPageview({ path: "/blog", search: "?utm_source=x" });
    const views = sentPayloads().filter((p) => !p.name);
    expect(views.map((p) => p.url)).toEqual(["/?utm_source=github", "/blog"]);
  });

  it("sends post_slug with a blog post page view", () => {
    start();
    loadTracker();
    analytics.trackPageview({
      path: "/tr/blog/atlas-steward",
      pageType: "blog_post",
      postSlug: "atlas-steward",
      uiLocale: "tr",
    });
    expect(lastPayload()).toMatchObject({
      name: "page_view",
      url: "/tr/blog/atlas-steward",
      data: {
        page_type: "blog_post",
        post_slug: "atlas-steward",
        ui_locale: "tr",
      },
    });
  });

  it("before any page view, events use the live path with a filtered query", () => {
    window.history.replaceState(
      null,
      "",
      "/contact?email=a%40b.c&utm_source=github",
    );
    start();
    loadTracker();
    analytics.track("email_link_clicked", { location: "contact_page" });
    expect(lastPayload()).toMatchObject({
      name: "email_link_clicked",
      url: "/contact?utm_source=github",
      data: { location: "contact_page" },
    });
  });

  it("queues calls until the tracker loads and keeps each call's page", () => {
    analytics.track("cta_clicked", { cta_id: "hero_about" }); // before init
    start();
    analytics.trackPageview({ path: "/", pageType: "home" });
    analytics.trackPageview({ path: "/contact", pageType: "contact" });
    analytics.track("contact_form_started");
    expect(umamiTrack).not.toHaveBeenCalled();

    loadTracker();
    const payloads = sentPayloads();
    expect(payloads.map((p) => [p.name ?? "(pageview)", p.url])).toEqual([
      ["cta_clicked", "/"],
      ["(pageview)", "/"],
      ["page_view", "/"],
      ["(pageview)", "/contact"],
      ["page_view", "/contact"],
      ["contact_form_started", "/contact"],
    ]);
    // after load, calls go straight through
    analytics.track("email_link_clicked", { location: "contact_page" });
    expect(umamiTrack).toHaveBeenCalledTimes(7);
  });

  it("caps the waiting queue at 50 calls", () => {
    start();
    for (let i = 0; i < 60; i += 1) {
      analytics.track("contact_form_started");
    }
    loadTracker();
    expect(umamiTrack).toHaveBeenCalledTimes(analytics.QUEUE_LIMIT);
    expect(analytics.QUEUE_LIMIT).toBe(50);
  });

  it("a blocked tracker (script error) drops the queue and later calls", () => {
    start();
    analytics.track("contact_form_started");
    tracker().dispatchEvent(new Event("error"));
    window.umami = { track: umamiTrack };
    expect(analytics.track("contact_form_started")).toBe(false);
    expect(umamiTrack).not.toHaveBeenCalled();
  });
});

describe("setPageContext (ANL-18 criterion 2)", () => {
  beforeEach(() => {
    start();
    loadTracker();
  });

  it("adds page_type, ui_locale and content_language to every event", () => {
    analytics.setPageContext({
      page_type: "about",
      ui_locale: "tr",
      content_language: "tr",
    });
    analytics.track("cta_clicked", { cta_id: "hero_contact" });
    expect(lastPayload().data).toEqual({
      page_type: "about",
      ui_locale: "tr",
      content_language: "tr",
      cta_id: "hero_contact",
    });
  });

  it("drops an unsupported ui_locale", () => {
    analytics.setPageContext({ page_type: "about", ui_locale: "de" });
    analytics.track("cta_clicked", { cta_id: "hero_contact", ui_locale: "de" });
    expect(lastPayload().data).toEqual({
      page_type: "about",
      cta_id: "hero_contact",
    });
  });

  it("merges updates and removes a key with null", () => {
    analytics.setPageContext({ page_type: "home", ui_locale: "en" });
    analytics.setPageContext({ content_language: "en" });
    expect(analytics.setPageContext({ ui_locale: null })).toEqual({
      page_type: "home",
      content_language: "en",
    });
  });

  it("explicit event properties win over the context", () => {
    analytics.setPageContext({ page_type: "blog_post", ui_locale: "en" });
    analytics.track("web_vital_reported", {
      metric: "LCP",
      value: 1800,
      rating: "good",
      page_type: "home",
      ui_locale: "tr",
    });
    expect(lastPayload().data).toMatchObject({
      page_type: "home",
      ui_locale: "tr",
    });
  });
});

describe("robustness (ANL-01 step 4)", () => {
  it("drops unknown event names", () => {
    start();
    loadTracker();
    expect(analytics.track("contact_form_failed", { result: "error" })).toBe(
      false,
    );
    expect(umamiTrack).not.toHaveBeenCalled();
  });

  it("strips PII from the sent payload", () => {
    start();
    loadTracker();
    analytics.track("contact_form_submitted", {
      result: "error",
      error_code: "412",
      message_length_bucket: "lt_200",
      name: "Jane",
      email: "a@b.c",
      message: "hi",
    });
    expect(lastPayload().data).toEqual({
      result: "error",
      error_code: "412",
      message_length_bucket: "lt_200",
    });
  });

  it("never throws when the tracker throws or rejects", async () => {
    start();
    window.umami = {
      track: vi.fn(() => {
        throw new Error("tracker exploded");
      }),
    };
    tracker().dispatchEvent(new Event("load"));
    expect(() => analytics.track("contact_form_started")).not.toThrow();
    expect(() => analytics.trackPageview({ path: "/about" })).not.toThrow();

    window.umami.track = vi.fn(() => Promise.reject(new Error("offline")));
    expect(() => analytics.track("contact_form_started")).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("trackPageview and setPageContext are safe before init", () => {
    expect(() => analytics.setPageContext(undefined)).not.toThrow();
    expect(() => analytics.trackPageview()).not.toThrow();
    expect(() => analytics.track("page_view", null)).not.toThrow();
  });
});
