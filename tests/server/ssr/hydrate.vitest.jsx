// PERF-03: the server's HTML is what the browser hydrates (Vitest + jsdom, see
// vite.config.js `test.include`; the suffix keeps `bun test` from collecting
// it). For each page: draw it with src/entry-server.jsx, put the HTML into a
// #root marked data-ssr, hydrate it with the entry-client tree and require
//   - no hydration error or warning (React logs them through console.error,
//     or reports them to onRecoverableError: both are collected),
//   - the nodes the server drew are still there afterwards (hydrateRoot adopts
//     them; a mismatch would replace them).
// The tree is the one in src/entry-client.jsx (StrictMode > SWRConfig >
// BrowserRouter > AppRoot); the swr data is the same JSON the server writes
// into the page.
import { act } from "@testing-library/react";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AppRoot } from "../../../src/app/App";
import { swrConfig } from "../../../src/lib/swr";
import { toSWRFallback } from "../../../src/lib/swrFallback.js";
import { chunkLoaderForRoute } from "../../../src/lib/prefetch.js";
import { matchRoute } from "../../../src/seo/routes.js";

const POST = {
  id: 1,
  slug: "hello-world",
  title: "Hello world",
  content:
    "Intro with **bold** and a [link](https://example.com).\n\n## A section\n\nText.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n",
  excerpt: "A short excerpt.",
  coverImage: null,
  published: true,
  createdAt: "2026-09-30T10:00:00.000Z",
  updatedAt: "2026-09-30T10:00:00.000Z",
  publishedAt: "2026-09-30T10:00:00.000Z",
  lang: "en",
  translationKey: "hello",
  seoTitle: null,
  diagrams: {},
  translations: [{ lang: "tr", slug: "merhaba-dunya" }],
};
const CARD = { ...POST, content: undefined, translations: undefined };
const TR_CARD = {
  ...CARD,
  id: 2,
  slug: "sadece-turkce",
  title: "Sadece Türkçe",
  lang: "tr",
  translationKey: null,
};

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

const HYDRATION_MESSAGE =
  /hydrat|did not match|server rendered|Minified React error #(418|423|425)/i;

// The server's HTML of every page, drawn by Bun in one process (see
// render-pages.ts for why it is a separate one). The data goes through JSON
// first, as it does on the wire (dates become strings).
const WIRE = (data) => JSON.parse(JSON.stringify(data));
const SERVER_HTML = new Map();
beforeAll(() => {
  const stdout = execFileSync(
    "bun",
    [join(import.meta.dirname, "render-pages.ts")],
    {
      input: JSON.stringify(PAGES.map(([url, data]) => [url, WIRE(data)])),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const html = JSON.parse(stdout);
  PAGES.forEach(([url, data], index) =>
    SERVER_HTML.set(`${url}\u0000${JSON.stringify(data)}`, html[index]),
  );
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

async function hydrate(url, data) {
  const wire = WIRE(data);
  const html = SERVER_HTML.get(`${url}\u0000${JSON.stringify(data)}`);

  document.body.innerHTML = `<div id="root" data-ssr>${html}</div>`;
  const container = document.getElementById("root");
  window.history.replaceState(null, "", url);

  // The entry's own preparation: the page chunk first.
  const load = chunkLoaderForRoute(matchRoute(url));
  if (load) await load();

  const marked = {
    h1: container.querySelector("h1"),
    main: container.querySelector("main"),
    header: container.querySelector("header"),
  };
  const recoverable = [];
  let root;
  await act(async () => {
    root = hydrateRoot(
      container,
      <StrictMode>
        <SWRConfig
          value={{
            ...swrConfig,
            provider: () => new Map(),
            fallback: toSWRFallback(wire),
          }}
        >
          <BrowserRouter>
            <AppRoot />
          </BrowserRouter>
        </SWRConfig>
      </StrictMode>,
      { onRecoverableError: (error) => recoverable.push(String(error)) },
    );
  });
  // Lazy pages and effects settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  return { container, marked, recoverable, root, html };
}

describe("every page hydrates the server's HTML without a mismatch", () => {
  it.each(PAGES)("%s", async (url, data) => {
    const { container, marked, recoverable, root } = await hydrate(url, data);

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
    const { container, marked, recoverable, root } = await hydrate("/", {});
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
    const { recoverable, root } = await hydrate("/blog", {});
    expect(recoverable).toEqual([]);
    expect(errors.filter((line) => HYDRATION_MESSAGE.test(line))).toEqual([]);
    await act(async () => root.unmount());
  });
});
