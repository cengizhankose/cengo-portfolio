// PERF-04 / FE-05 (and the chunk half of PERF-14): reaching a blog link with a
// pointer or the keyboard starts the page chunk before the click, through the
// one delegated listener in src/lib/prefetch.js and the same loaders the lazy
// routes use.
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Routes } from "react-router-dom";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntentPrefetch } from "../../../src/hooks/useIntentPrefetch";
import {
  chunkLoaderForRoute,
  prefetchChunk,
  prefetchRoute,
} from "../../../src/lib/prefetch.js";
import { swrConfig } from "../../../src/lib/swr.js";
import { ALL_LIVE, matchRoute } from "../../../src/seo/routes.js";
import routeStyles from "../../../src/components/routefallback/routefallback.module.css";

// Each test re-imports the route table (and a blog chunk) cold.
vi.setConfig({ testTimeout: 30_000 });

const POST = {
  id: 1,
  slug: "hello-world",
  title: "Hello world",
  excerpt: "An EN post.",
  content: "EN body",
  lang: "en",
  translationKey: null,
  translations: [],
  createdAt: "2026-01-15T12:00:00.000Z",
};

// The spies stand in for the two loaders of src/pages/blog/loaders.js and
// return the real modules, like the real import() would.
const loaders = vi.hoisted(() => ({
  loadBlogHome: vi.fn(),
  loadBlogPost: vi.fn(),
}));
vi.mock("../../../src/pages/blog/loaders.js", () => loaders);

let fetchMock;
beforeEach(() => {
  loaders.loadBlogHome.mockReset();
  loaders.loadBlogPost.mockReset();
  loaders.loadBlogHome.mockImplementation(
    () => import("../../../src/pages/blog/BlogHome"),
  );
  loaders.loadBlogPost.mockImplementation(
    () => import("../../../src/pages/blog/BlogPost"),
  );
  document.head.innerHTML = "<title>x</title>";
  fetchMock = vi.fn(async (url) => {
    const body = String(url).includes("/api/posts/") ? POST : [POST];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("which chunk a route needs (chunkLoaderForRoute)", () => {
  it("the blog list -> BlogHome, a post -> BlogPost, both for /tr posts", () => {
    expect(chunkLoaderForRoute(matchRoute("/blog"))).toBe(loaders.loadBlogHome);
    expect(chunkLoaderForRoute(matchRoute("/blog/hello-world"))).toBe(
      loaders.loadBlogPost,
    );
    expect(chunkLoaderForRoute(matchRoute("/tr/blog/merhaba-dunya"))).toBe(
      loaders.loadBlogPost,
    );
  });

  it("/tr/blog is the same chunk once the TR pages are open; closed, it costs nothing", () => {
    expect(chunkLoaderForRoute(matchRoute("/tr/blog"))).toBeNull();
    expect(chunkLoaderForRoute(matchRoute("/tr/blog", ALL_LIVE))).toBe(
      loaders.loadBlogHome,
    );
  });

  it("other pages, 404s and nothing need no chunk", () => {
    for (const path of ["/", "/about", "/contact", "/blog/Bad_Slug", "/x"]) {
      expect(chunkLoaderForRoute(matchRoute(path)), path).toBeNull();
    }
    expect(chunkLoaderForRoute(null)).toBeNull();
    expect(chunkLoaderForRoute(undefined)).toBeNull();
  });
});

describe("prefetchChunk / prefetchRoute", () => {
  it("prefetchChunk calls the route's loader and nothing else", () => {
    prefetchChunk(matchRoute("/blog"));
    expect(loaders.loadBlogHome).toHaveBeenCalledTimes(1);
    expect(loaders.loadBlogPost).not.toHaveBeenCalled();

    prefetchChunk(matchRoute("/about"));
    expect(loaders.loadBlogHome).toHaveBeenCalledTimes(1);
  });

  it("a failed preload (rejected or thrown) is swallowed", async () => {
    loaders.loadBlogHome.mockRejectedValue(new TypeError("Failed to fetch"));
    loaders.loadBlogPost.mockImplementation(() => {
      throw new Error("sync failure");
    });

    expect(() => prefetchChunk(matchRoute("/blog"))).not.toThrow();
    expect(() => prefetchChunk(matchRoute("/blog/hello-world"))).not.toThrow();
    // A rejection nobody handles would fail the run as an unhandled rejection.
    await act(async () => {});
  });

  it("prefetchRoute starts the chunk together with the data", async () => {
    const cache = new Map();
    prefetchRoute(matchRoute("/blog/hello-world"), {
      cache,
      mutate: vi.fn(),
      fallback: {},
    });

    expect(loaders.loadBlogPost).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/posts/hello-world",
    ]);
    await act(async () => {});
  });
});

const Links = () => (
  <nav>
    <Link to="/blog">Blog</Link>
    <Link to="/blog/hello-world">Hello link</Link>
    <Link to="/tr/blog">TR blog (closed)</Link>
    <Link to="/about">About</Link>
    <a href="https://example.org/blog/x">Elsewhere</a>
  </nav>
);

const swrValue = () => ({
  ...swrConfig,
  provider: () => new Map(),
  onErrorRetry: () => {},
});

function renderLinks(extra = null) {
  return render(
    <SWRConfig value={swrValue()}>
      <MemoryRouter initialEntries={["/about"]}>
        <IntentPrefetch />
        <Links />
        {extra}
      </MemoryRouter>
    </SWRConfig>,
  );
}

describe("the delegated listener (pointerover / focusin)", () => {
  it("hovering the Blog link loads BlogHome before any click", async () => {
    renderLinks();
    fireEvent.pointerOver(screen.getByRole("link", { name: "Blog" }));

    expect(loaders.loadBlogHome).toHaveBeenCalledTimes(1);
    expect(loaders.loadBlogPost).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it("keyboard focus on a post link loads BlogPost", async () => {
    renderLinks();
    fireEvent.focusIn(screen.getByRole("link", { name: "Hello link" }));

    expect(loaders.loadBlogPost).toHaveBeenCalledTimes(1);
    expect(loaders.loadBlogHome).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it("touch and pen reach the link through pointerover too", async () => {
    renderLinks();
    fireEvent.pointerOver(screen.getByRole("link", { name: "Hello link" }), {
      pointerType: "touch",
    });
    expect(loaders.loadBlogPost).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });

  it("a closed-language link, another page and another site cost no chunk", async () => {
    renderLinks();
    for (const name of ["TR blog (closed)", "About", "Elsewhere"]) {
      fireEvent.pointerOver(screen.getByRole("link", { name }));
      fireEvent.focusIn(screen.getByRole("link", { name }));
    }

    expect(loaders.loadBlogHome).not.toHaveBeenCalled();
    expect(loaders.loadBlogPost).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it("does nothing on a Save-Data connection", async () => {
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      connection: { saveData: true },
    });
    renderLinks();
    fireEvent.pointerOver(screen.getByRole("link", { name: "Blog" }));

    expect(loaders.loadBlogHome).not.toHaveBeenCalled();
    await act(async () => {});
  });

  it("the click after a hover renders the page from the chunk the hover started", async () => {
    vi.resetModules();
    const user = userEvent.setup();
    const { pageRoutes } = await import("../../../src/app/pageRoutes.jsx");
    const { container } = renderLinks(<Routes>{pageRoutes()}</Routes>);
    await screen.findByRole("heading", { level: 1 });

    const link = screen.getByRole("link", { name: "Hello link" });
    fireEvent.pointerOver(link);
    // The request starts on the hover, before the click ...
    expect(loaders.loadBlogPost).toHaveBeenCalledTimes(1);
    await act(async () => {});

    await user.click(link);
    // ... and the page is there after it.
    expect(
      await screen.findByRole("heading", { name: "Hello world" }),
    ).toBeInTheDocument();
    expect(container.querySelector(`.${routeStyles.routeFallback}`)).toBeNull();
  });
});
