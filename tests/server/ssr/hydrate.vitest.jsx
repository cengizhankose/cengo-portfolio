// PERF-03: the server's HTML is what the browser hydrates (Vitest + jsdom, see
// vite.config.js `test.include`; the suffix keeps `bun test` from collecting
// it). For each page: the server's HTML (hydrate-support.jsx), hydrated with
// the entry-client tree, and
//   - no hydration error or warning (React logs them through console.error,
//     or reports them to onRecoverableError: both are collected),
//   - the nodes the server drew are still there afterwards (hydrateRoot adopts
//     them; a mismatch would replace them).
import { act } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  CARD,
  drawPages,
  HYDRATION_MESSAGE,
  hydratePage,
  POST,
  TR_CARD,
} from "./hydrate-support.jsx";

const BLOG_DATA = {
  "/api/posts?lang=en": [CARD],
  "/api/posts?lang=tr&missingIn=en": [TR_CARD],
};
const POST_DATA = { "/api/posts/hello-world": POST };

// [url, swr data the server wrote into the page]
const PAGES = [
  ["/", {}],
  ["/about", {}],
  ["/portfolio", {}],
  ["/contact", {}],
  ["/blog", BLOG_DATA],
  ["/blog/hello-world", POST_DATA],
  ["/blog", {}],
  // 404 pages are not hydrated by the server (no data-ssr), but the same tree
  // must still be able to adopt them.
  ["/nope", {}],
  ["/tr/about", {}],
];

let serverHtml;
beforeAll(() => {
  serverHtml = drawPages(PAGES);
}, 60_000);

let errors;
beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation((...args) => {
    errors.push(args.map(String).join(" "));
  });
});
afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

describe("every page hydrates the server's HTML without a mismatch", () => {
  it.each(PAGES)("%s", async (url, data) => {
    const { container, marked, recoverable, root } = await hydratePage(
      url,
      data,
      serverHtml,
    );

    expect(recoverable).toEqual([]);
    expect(errors.filter((line) => HYDRATION_MESSAGE.test(line))).toEqual([]);
    expect(errors).toEqual([]);

    // Adopted, not replaced.
    expect(container.querySelector("h1")).toBe(marked.h1);
    expect(container.querySelector("main")).toBe(marked.main);
    expect(container.querySelector("header")).toBe(marked.header);
    expect(container.querySelectorAll("h1").length).toBe(1);

    await act(async () => root.unmount());
  });

  it("a visitor with a light theme, a mouse and the stored theme still adopts the markup (the server cannot know any of it)", async () => {
    // What the browser knows and the server does not: the head script has set
    // data-theme before React starts, every media query matches (fine pointer,
    // light scheme) and the stored theme says light.
    document.documentElement.setAttribute("data-theme", "light");
    window.localStorage.setItem("theme", "light");
    vi.stubGlobal("matchMedia", (query) => ({
      matches: true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }));
    const { container, marked, recoverable, root } = await hydratePage(
      "/",
      {},
      serverHtml,
    );
    expect(recoverable).toEqual([]);
    expect(errors.filter((line) => HYDRATION_MESSAGE.test(line))).toEqual([]);
    expect(container.querySelector("h1")).toBe(marked.h1);
    // After hydration the page follows the browser: the dark toggle is not pressed.
    expect(
      container.querySelector(".theme-toggle").getAttribute("aria-pressed"),
    ).toBe("false");
    await act(async () => root.unmount());
  });

  it("a blog index without the server's data draws its loading state alike on both sides", async () => {
    // The 503 path: the shell has no data block, the page fetches in the browser.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[]", { status: 200 })),
    );
    const { recoverable, root } = await hydratePage("/blog", {}, serverHtml);
    expect(recoverable).toEqual([]);
    expect(errors.filter((line) => HYDRATION_MESSAGE.test(line))).toEqual([]);
    await act(async () => root.unmount());
  });
});
