// PERF-03 with the TR pages open (T-12, SEO-11 Adım B): the Turkish pages the
// server draws hydrate without a mismatch too. The server side is drawn with
// LIVE.static = ['en', 'tr'] (render-pages.ts, OPEN_TR); this file opens the
// same language for the browser side by replacing the route table's LIVE with
// ALL_LIVE (what that edit means once made).
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
  TR_CARD,
  TR_POST,
} from "./hydrate-support.jsx";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});

const BLOG_TR = {
  "/api/posts?lang=tr": [TR_CARD],
  "/api/posts?lang=en&missingIn=tr": [CARD],
};
const POST_TR = { "/api/posts/sadece-turkce": TR_POST };

const PAGES = [
  ["/tr", {}],
  ["/tr/about", {}],
  ["/tr/portfolio", {}],
  ["/tr/contact", {}],
  ["/tr/blog", BLOG_TR],
  ["/tr/blog/sadece-turkce", POST_TR],
  ["/about", {}],
];

let serverHtml;
beforeAll(() => {
  serverHtml = drawPages(PAGES, { openTr: true });
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
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

describe("the Turkish pages hydrate the server's HTML without a mismatch", () => {
  it.each(PAGES)("%s", async (url, data) => {
    const { container, marked, recoverable, root, html } = await hydratePage(
      url,
      data,
      serverHtml,
    );
    // The server really drew this page in the language of its URL.
    if (url.startsWith("/tr")) expect(html).toContain('lang="tr"');

    expect(recoverable).toEqual([]);
    expect(errors.filter((line) => HYDRATION_MESSAGE.test(line))).toEqual([]);
    expect(errors).toEqual([]);
    expect(container.querySelector("h1")).toBe(marked.h1);
    expect(container.querySelector("main")).toBe(marked.main);
    expect(container.querySelectorAll("h1").length).toBe(1);

    await act(async () => root.unmount());
  });
});
