// ANL-10 criteria 2-5 (the locally checkable part): the hook sends
// blog_read_progress once per threshold, nothing on the way back up, resets
// for a new slug, sends one blog_post_engaged bucket on leaving, and registers
// its scroll listener as passive. Real BlogPost; layout, clock and
// requestAnimationFrame are stubbed because jsdom has none.
import { act, render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  trackPageview: vi.fn(),
  setPageContext: vi.fn(),
  initAnalytics: vi.fn(),
}));
vi.mock("../../../src/lib/analytics/index.js", () => analytics);

const { default: BlogPost } = await import("../../../src/pages/blog/BlogPost");
const { testSWRValue } = await import("../blog/support.jsx");

const post = (slug) => ({
  id: 1,
  slug,
  title: `Title ${slug}`,
  excerpt: "x",
  content: "Body text",
  lang: "en",
  translationKey: null,
  translations: [],
  coverImage: null,
  createdAt: "2026-09-30T10:00:00.000Z",
  publishedAt: "2026-09-30T10:00:00.000Z",
  updatedAt: "2026-09-30T10:00:00.000Z",
});

let rectTop;
const HEIGHT = 3200;
let navigate;
let now;
// requestAnimationFrame callbacks wait here until a test flushes them, like
// in a browser (the hook asks for one frame per burst of scroll events).
let frames = [];
const flushFrames = async () => {
  const due = frames;
  frames = [];
  await act(async () => {
    due.forEach((callback) => callback(0));
  });
};

function Nav() {
  navigate = useNavigate();
  return null;
}

function mount(path = "/blog/first") {
  return render(
    <SWRConfig
      value={testSWRValue({
        // A visibilitychange must not make swr revalidate in these tests.
        revalidateOnFocus: false,
        fallback: {
          "/api/posts/first": post("first"),
          "/api/posts/second": post("second"),
        },
      })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Nav />
        <Routes>
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>
    </SWRConfig>,
  );
}

const calls = (name) =>
  analytics.track.mock.calls.filter(([event]) => event === name);
const scrollTo = async (top) => {
  rectTop = top;
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
  });
  await flushFrames();
};
const setVisibility = async (state) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

beforeEach(() => {
  analytics.track.mockClear();
  rectTop = 800; // the body starts below the fold
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  window.innerHeight = 800;
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function rect() {
      return this.classList.contains("blog-post-body")
        ? { top: rectTop, height: HEIGHT, bottom: rectTop + HEIGHT }
        : { top: 0, height: 0, bottom: 0 };
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
});

describe("blog_read_progress", () => {
  it("one event per threshold, in order, and none when scrolling back up", async () => {
    mount();
    await screen.findByRole("heading", { level: 1, name: "Title first" });
    expect(calls("blog_read_progress")).toHaveLength(0);

    await scrollTo(0); // 25 %
    await scrollTo(-800); // 50 %
    await scrollTo(-1600); // 75 %
    await scrollTo(-2400); // 100 %
    expect(calls("blog_read_progress").map(([, props]) => props)).toEqual([
      { post_slug: "first", percent: 25 },
      { post_slug: "first", percent: 50 },
      { post_slug: "first", percent: 75 },
      { post_slug: "first", percent: 100 },
    ]);

    await scrollTo(800);
    await scrollTo(-2400);
    await scrollTo(0);
    expect(calls("blog_read_progress")).toHaveLength(4);
  });

  it("a big jump fires every threshold it passed, once", async () => {
    mount();
    await screen.findByRole("heading", { level: 1 });
    await scrollTo(-1600);
    expect(
      calls("blog_read_progress").map(([, props]) => props.percent),
    ).toEqual([25, 50, 75]);
  });

  it("the scroll listener is passive", async () => {
    const add = vi.spyOn(window, "addEventListener");
    mount();
    await screen.findByRole("heading", { level: 1 });
    const scroll = add.mock.calls.find(([type]) => type === "scroll");
    expect(scroll?.[2]).toEqual({ passive: true });
  });

  it("another post in the same tab starts from zero (new slug, four events again)", async () => {
    mount();
    await screen.findByRole("heading", { level: 1, name: "Title first" });
    await scrollTo(-2400);
    expect(calls("blog_read_progress")).toHaveLength(4);

    await act(async () => navigate("/blog/second"));
    await screen.findByRole("heading", { level: 1, name: "Title second" });
    await scrollTo(800);
    analytics.track.mockClear();
    await scrollTo(-2400);
    expect(calls("blog_read_progress").map(([, props]) => props)).toEqual([
      { post_slug: "second", percent: 25 },
      { post_slug: "second", percent: 50 },
      { post_slug: "second", percent: 75 },
      { post_slug: "second", percent: 100 },
    ]);
  });
});

describe("blog_post_engaged", () => {
  it("about 40 s, then the tab is hidden: one event, bucket 30_60, not again on unmount", async () => {
    const { unmount } = mount();
    await screen.findByRole("heading", { level: 1 });
    now += 40_000;
    await setVisibility("hidden");
    expect(calls("blog_post_engaged")).toEqual([
      [
        "blog_post_engaged",
        { post_slug: "first", engaged_seconds_bucket: "30_60" },
      ],
    ]);
    await setVisibility("visible");
    now += 5_000;
    unmount();
    expect(calls("blog_post_engaged")).toHaveLength(1);
  });

  it("hidden time does not count", async () => {
    const { unmount } = mount();
    await screen.findByRole("heading", { level: 1 });
    now += 5_000;
    await setVisibility("hidden"); // 5 s counted, engaged sent below
    expect(calls("blog_post_engaged")[0][1].engaged_seconds_bucket).toBe(
      "lt_10",
    );
    unmount();
  });

  it("leaving after a second or more sends the bucket on unmount; under a second sends nothing", async () => {
    const first = mount();
    await screen.findByRole("heading", { level: 1 });
    now += 12_000;
    first.unmount();
    expect(calls("blog_post_engaged").map(([, props]) => props)).toEqual([
      { post_slug: "first", engaged_seconds_bucket: "10_30" },
    ]);

    analytics.track.mockClear();
    const second = mount();
    await screen.findByRole("heading", { level: 1 });
    now += 400;
    second.unmount();
    expect(calls("blog_post_engaged")).toHaveLength(0);
  });

  it("pagehide counts as leaving", async () => {
    mount();
    await screen.findByRole("heading", { level: 1 });
    now += 70_000;
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(calls("blog_post_engaged")[0][1].engaged_seconds_bucket).toBe(
      "60_180",
    );
  });

  it("going from one post to another closes the first view", async () => {
    mount();
    await screen.findByRole("heading", { level: 1, name: "Title first" });
    now += 20_000;
    await act(async () => navigate("/blog/second"));
    await screen.findByRole("heading", { level: 1, name: "Title second" });
    expect(calls("blog_post_engaged").map(([, props]) => props)).toEqual([
      { post_slug: "first", engaged_seconds_bucket: "10_30" },
    ]);
  });
});
