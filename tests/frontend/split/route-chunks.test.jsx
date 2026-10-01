// PERF-04 / FE-05: BlogHome and BlogPost are lazy route chunks. The route
// table (src/app/pageRoutes.jsx) renders RouteFallback while a chunk loads,
// asks for a chunk only on its own route, and never loads one for a path the
// router answers with NotFound.
//
// The loaders (src/pages/blog/loaders.js) are replaced with spies around the
// real dynamic imports, so the tests see which chunk is requested and when.
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// A fresh copy of pageRoutes.jsx per test: React.lazy keeps its result, so a
// second test would otherwise find the chunk already loaded.
async function freshRoutes({ home, post } = {}) {
  vi.resetModules();
  const loadBlogHome = vi.fn(
    home ?? (() => import("../../../src/pages/blog/BlogHome")),
  );
  const loadBlogPost = vi.fn(
    post ?? (() => import("../../../src/pages/blog/BlogPost")),
  );
  vi.doMock("../../../src/pages/blog/loaders.js", () => ({
    loadBlogHome,
    loadBlogPost,
  }));
  const table = await import("../../../src/app/pageRoutes.jsx");
  return { ...table, loadBlogHome, loadBlogPost };
}

function renderAt(table, path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>{table.pageRoutes()}</Routes>
    </MemoryRouter>,
  );
}

const isLazy = (Page) => Page.$$typeof === Symbol.for("react.lazy");

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      const body = String(url).includes("/api/posts/") ? POST : [POST];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.doUnmock("../../../src/pages/blog/loaders.js");
});

describe("the page table", () => {
  it("makes BlogHome and BlogPost lazy, once, shared by both languages; the other pages stay eager", async () => {
    const { PAGE_ROUTES, LOCALIZED_ROUTES } = await freshRoutes();
    const byPath = Object.fromEntries(
      PAGE_ROUTES.map((route) => [route.path, route.Page]),
    );

    expect(isLazy(byPath["/blog"])).toBe(true);
    expect(isLazy(byPath["/blog/:slug"])).toBe(true);
    expect(byPath["/blog"]).not.toBe(byPath["/blog/:slug"]);
    for (const path of ["/", "/about", "/portfolio", "/contact"]) {
      expect(isLazy(byPath[path]), path).toBe(false);
    }

    // T-12: /tr/blog and /tr/blog/:slug use the very same components, so
    // there is one chunk per page, not one per language.
    for (const pagePath of ["/blog", "/blog/:slug"]) {
      const pages = LOCALIZED_ROUTES.filter(
        (route) => route.pagePath === pagePath,
      ).map((route) => route.Page);
      expect(pages).toHaveLength(2);
      expect(pages[0]).toBe(byPath[pagePath]);
      expect(pages[1]).toBe(byPath[pagePath]);
    }
  });
});

describe("route chunks are requested on their own route only", () => {
  it("/ asks for no blog chunk", async () => {
    const table = await freshRoutes();
    renderAt(table, "/");
    await screen.findByRole("heading", { level: 1 });
    await act(async () => {});

    expect(table.loadBlogHome).not.toHaveBeenCalled();
    expect(table.loadBlogPost).not.toHaveBeenCalled();
  });

  it("/about asks for no blog chunk", async () => {
    const table = await freshRoutes();
    renderAt(table, "/about");
    await screen.findByRole("heading", { level: 1 });
    await act(async () => {});

    expect(table.loadBlogHome).not.toHaveBeenCalled();
    expect(table.loadBlogPost).not.toHaveBeenCalled();
  });

  it("/blog: RouteFallback until BlogHome arrives, then the list; BlogPost is never asked for", async () => {
    const chunk = deferred();
    const table = await freshRoutes({ home: () => chunk.promise });
    const { container } = renderAt(table, "/blog");

    // The chunk is still loading: the route shows the fallback.
    const fallback = container.querySelector(`.${routeStyles.routeFallback}`);
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveAttribute("aria-busy", "true");
    expect(fallback).toHaveTextContent("Loading…");
    expect(table.loadBlogHome).toHaveBeenCalledTimes(1);
    expect(table.loadBlogPost).not.toHaveBeenCalled();

    const module = await import("../../../src/pages/blog/BlogHome");
    await act(async () => chunk.resolve(module));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Blog" }),
    ).toBeInTheDocument();
    expect(container.querySelector(`.${routeStyles.routeFallback}`)).toBeNull();
    expect(table.loadBlogHome).toHaveBeenCalledTimes(1);
    expect(table.loadBlogPost).not.toHaveBeenCalled();
  });

  it("/blog/<slug>: RouteFallback until BlogPost arrives, then the post; BlogHome is never asked for", async () => {
    const chunk = deferred();
    const table = await freshRoutes({ post: () => chunk.promise });
    const { container } = renderAt(table, "/blog/hello-world");

    expect(
      container.querySelector(`.${routeStyles.routeFallback}`),
    ).toBeInTheDocument();
    expect(table.loadBlogPost).toHaveBeenCalledTimes(1);
    expect(table.loadBlogHome).not.toHaveBeenCalled();

    const module = await import("../../../src/pages/blog/BlogPost");
    await act(async () => chunk.resolve(module));

    expect(
      await screen.findByRole("heading", { name: "Hello world" }),
    ).toBeInTheDocument();
    expect(container.querySelector(`.${routeStyles.routeFallback}`)).toBeNull();
    expect(table.loadBlogHome).not.toHaveBeenCalled();
  });

  it("/tr/blog/<slug> (TR posts are live) uses the same BlogPost loader", async () => {
    const table = await freshRoutes();
    renderAt(table, "/tr/blog/hello-world");

    expect(
      await screen.findByRole("heading", { name: "Hello world" }),
    ).toBeInTheDocument();
    expect(table.loadBlogPost).toHaveBeenCalledTimes(1);
    expect(table.loadBlogHome).not.toHaveBeenCalled();
  });

  it("a path the router answers with NotFound never loads a chunk (/tr/blog while the TR pages are closed)", async () => {
    const table = await freshRoutes();
    renderAt(table, "/tr/blog");

    expect(
      await screen.findByRole("heading", { name: /not found/i }),
    ).toBeInTheDocument();
    await act(async () => {});
    expect(table.loadBlogHome).not.toHaveBeenCalled();
    expect(table.loadBlogPost).not.toHaveBeenCalled();
  });
});

describe("RouteFallback", () => {
  it("holds a page of height for the layout and has a screen-reader label from the dictionary", async () => {
    vi.resetModules();
    const { RouteFallback } =
      await import("../../../src/components/routefallback");
    const { container } = render(
      <MemoryRouter initialEntries={["/blog"]}>
        <RouteFallback />
      </MemoryRouter>,
    );

    const fallback = container.querySelector(`.${routeStyles.routeFallback}`);
    expect(fallback).toHaveAttribute("aria-busy", "true");
    expect(fallback).toHaveAttribute("lang", "en");
    const label = fallback.querySelector(".visually-hidden");
    expect(label).toHaveTextContent("Loading…");
    // The text is for screen readers only: nothing else is drawn.
    expect(fallback.textContent).toBe(label.textContent);
  });
});
