// ANL-18 step 4 / criterion 3: a click on the language switcher sends one
// `locale_switched` { from_locale, to_locale, target }; the page view of the
// page it leads to carries the new ui_locale (route shell, ANL-07).
//
// Two layers: the switcher against a mocked track() (what it sends and when),
// and the switcher + real analytics module with window.umami mocked (what
// lands in the payload, context included).
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});
vi.mock("../../../src/lib/webVitals.js", () => ({ initWebVitals: vi.fn() }));

const { LanguageSwitcher } =
  await import("../../../src/components/langswitch/index.jsx");
const { setPostTranslations } =
  await import("../../../src/components/langswitch/postTranslations.js");
const analytics = await import("../../../src/lib/analytics/index.js");

const link = () => screen.getByRole("link", { name: /^(EN|TR)/ });

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<LanguageSwitcher />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  act(() => setPostTranslations(null));
});

describe("locale_switched from the switcher (ANL-18 step 4)", () => {
  let spy;
  beforeEach(() => {
    spy = vi.spyOn(analytics, "track");
  });
  afterEach(() => spy.mockRestore());

  const switched = () =>
    spy.mock.calls.filter(([name]) => name === "locale_switched");

  it("/about -> TR: one event, target translation", async () => {
    renderAt("/about");
    await userEvent.click(link());
    expect(switched()).toEqual([
      [
        "locale_switched",
        { from_locale: "en", to_locale: "tr", target: "translation" },
      ],
    ]);
  });

  it("/tr/about -> EN: from tr to en", async () => {
    renderAt("/tr/about");
    await userEvent.click(link());
    expect(switched()).toEqual([
      [
        "locale_switched",
        { from_locale: "tr", to_locale: "en", target: "translation" },
      ],
    ]);
  });

  it("a post with a translation: target translation", async () => {
    renderAt("/tr/blog/merhaba");
    act(() =>
      setPostTranslations({
        lang: "tr",
        slug: "merhaba",
        translations: [{ lang: "en", slug: "hello" }],
      }),
    );
    await userEvent.click(link());
    expect(switched()[0][1]).toEqual({
      from_locale: "tr",
      to_locale: "en",
      target: "translation",
    });
  });

  it("a post without a translation: target blog_index", async () => {
    renderAt("/tr/blog/sadece-turkce");
    act(() =>
      setPostTranslations({
        lang: "tr",
        slug: "sadece-turkce",
        translations: [],
      }),
    );
    await userEvent.click(link());
    expect(switched()[0][1]).toEqual({
      from_locale: "tr",
      to_locale: "en",
      target: "blog_index",
    });
  });

  it("an unknown path (404) sends no target", async () => {
    renderAt("/tr/nope");
    await userEvent.click(link());
    expect(switched()[0][1]).toEqual({ from_locale: "tr", to_locale: "en" });
  });

  it("the current-language item is not a link and sends nothing", () => {
    renderAt("/about");
    expect(screen.queryAllByRole("link")).toHaveLength(1);
    expect(switched()).toHaveLength(0);
  });

  it("a modified or non-primary click does not count as a switch", () => {
    renderAt("/about");
    // jsdom cannot open tabs: keep the default action of the link away
    const stop = (event) => event.preventDefault();
    document.addEventListener("click", stop);
    fireEvent.click(link(), { ctrlKey: true });
    fireEvent.click(link(), { metaKey: true });
    fireEvent.click(link(), { shiftKey: true });
    fireEvent.click(link(), { button: 1 });
    expect(switched()).toHaveLength(0);
    document.removeEventListener("click", stop);
    fireEvent.click(link());
    expect(switched()).toHaveLength(1);
  });

  it("rendering alone sends nothing", () => {
    renderAt("/about");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("locale_switched payload with the real module (criteria 2-3)", () => {
  const WEBSITE_ID = "b59e9c65-ae32-47f1-8400-119fcf4861c4";
  let umamiTrack;

  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    delete window.umami;
    document.getElementById("umami-tracker")?.remove();
  });

  it("carries page_type, ui_locale and content_language of the page left", async () => {
    const real = await import("../../../src/lib/analytics/index.js");
    const { LanguageSwitcher: Switcher } =
      await import("../../../src/components/langswitch/index.jsx");
    umamiTrack = vi.fn(() => Promise.resolve());
    expect(
      real.initAnalytics({
        config: {
          provider: "umami",
          scriptSrc: "https://stats.cengizhankose.com/script.js",
          websiteId: WEBSITE_ID,
          domains: ["www.cengizhankose.com"],
          allowedHosts: [window.location.hostname],
          respectDoNotTrack: false,
        },
        isProd: true,
      }),
    ).toBe(true);
    window.umami = { track: umamiTrack };
    document.getElementById("umami-tracker").dispatchEvent(new Event("load"));

    real.setPageContext({
      page_type: "about",
      ui_locale: "en",
      content_language: "en",
    });
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <Routes>
          <Route path="*" element={<Switcher />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(link());

    const payloads = umamiTrack.mock.calls.map(([build]) => build({}));
    const events = payloads.filter((p) => p.name === "locale_switched");
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({
      page_type: "about",
      ui_locale: "en",
      content_language: "en",
      from_locale: "en",
      to_locale: "tr",
      target: "translation",
    });
  });
});
