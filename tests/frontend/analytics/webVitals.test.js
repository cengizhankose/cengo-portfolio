// ANL-06 / PERF-23: web-vitals 5 metrics become web_vital_reported events.
import { beforeEach, describe, expect, it, vi } from "vitest";

const listeners = vi.hoisted(() => ({}));

vi.mock("web-vitals", () => {
  const register = (name) => (callback) => {
    listeners[name] = callback;
  };
  return {
    onLCP: vi.fn(register("LCP")),
    onINP: vi.fn(register("INP")),
    onCLS: vi.fn(register("CLS")),
    onFCP: vi.fn(register("FCP")),
    onTTFB: vi.fn(register("TTFB")),
  };
});
vi.mock("../../../src/lib/analytics/index.js", () => ({ track: vi.fn() }));

const { track } = await import("../../../src/lib/analytics/index.js");
const { initWebVitals } = await import("../../../src/lib/webVitals.js");

const report = (name, value, rating = "good") =>
  listeners[name]({
    name,
    value,
    rating,
    delta: value,
    id: "v5-1",
    entries: [],
  });

beforeEach(() => {
  track.mockClear();
  for (const key of Object.keys(listeners)) delete listeners[key];
});

describe("initWebVitals", () => {
  it("listens to LCP, INP, CLS, FCP and TTFB", () => {
    initWebVitals({ pathname: "/" });
    expect(Object.keys(listeners).sort()).toEqual([
      "CLS",
      "FCP",
      "INP",
      "LCP",
      "TTFB",
    ]);
  });

  it("sends one web_vital_reported per metric with rounded values", () => {
    initWebVitals({ pathname: "/" });
    report("LCP", 2412.6);
    report("CLS", 0.123456, "needs-improvement");
    report("INP", 187.4);
    report("TTFB", 612.2, "poor");

    expect(track.mock.calls).toEqual([
      [
        "web_vital_reported",
        {
          metric: "LCP",
          value: 2413,
          rating: "good",
          page_type: "home",
          ui_locale: "en",
        },
      ],
      [
        "web_vital_reported",
        {
          metric: "CLS",
          value: 0.123,
          rating: "needs-improvement",
          page_type: "home",
          ui_locale: "en",
        },
      ],
      [
        "web_vital_reported",
        {
          metric: "INP",
          value: 187,
          rating: "good",
          page_type: "home",
          ui_locale: "en",
        },
      ],
      [
        "web_vital_reported",
        {
          metric: "TTFB",
          value: 612,
          rating: "poor",
          page_type: "home",
          ui_locale: "en",
        },
      ],
    ]);
  });

  it.each([
    ["/", "home", "en"],
    ["/tr", "home", "tr"],
    ["/about", "about", "en"],
    ["/tr/about/", "about", "tr"],
    ["/portfolio", "portfolio", "en"],
    ["/contact", "contact", "en"],
    ["/privacy", "privacy", "en"],
    ["/blog", "blog_index", "en"],
    ["/tr/blog", "blog_index", "tr"],
    ["/blog/atlas-steward", "blog_post", "en"],
    ["/tr/blog/atlas-steward", "blog_post", "tr"],
    ["/nope", "not_found", "en"],
    ["/blog/a/b", "not_found", "en"],
    ["/trx", "not_found", "en"],
  ])(
    "landing page %s -> page_type %s, ui_locale %s",
    (pathname, type, locale) => {
      expect(initWebVitals({ pathname })).toEqual({
        page_type: type,
        ui_locale: locale,
      });
      report("LCP", 1000);
      expect(track).toHaveBeenLastCalledWith(
        "web_vital_reported",
        expect.objectContaining({ page_type: type, ui_locale: locale }),
      );
    },
  );

  it("uses the current location by default and accepts a page type override", () => {
    window.history.replaceState(null, "", "/tr/contact");
    expect(initWebVitals()).toEqual({ page_type: "contact", ui_locale: "tr" });
    expect(initWebVitals({ pathname: "/x", pageType: "blog_post" })).toEqual({
      page_type: "blog_post",
      ui_locale: "en",
    });
    window.history.replaceState(null, "", "/");
  });
});
