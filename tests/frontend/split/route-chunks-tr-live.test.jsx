// PERF-04 criterion 4 (T-12), TR half: with the route table mocked as it will
// be after SEO-11 Adım B (every language open), /blog and /tr/blog are the
// same lazy BlogHome chunk, asked for once; the fallback speaks the route's
// language.
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import routeStyles from "../../../src/components/routefallback/routefallback.module.css";

// Each test re-imports the route table (and a blog chunk) cold.
vi.setConfig({ testTimeout: 30_000 });

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// A fresh pageRoutes.jsx (React.lazy keeps its result) whose BlogHome loader
// waits for the test.
async function freshRoutes() {
  vi.resetModules();
  const chunk = deferred();
  const loadBlogHome = vi.fn(() => chunk.promise);
  const loadBlogPost = vi.fn(() => import("../../../src/pages/blog/BlogPost"));
  vi.doMock("../../../src/pages/blog/loaders.js", () => ({
    loadBlogHome,
    loadBlogPost,
  }));
  const { pageRoutes } = await import("../../../src/app/pageRoutes.jsx");
  const { DICTIONARIES } = await import("../../../src/i18n/translate.js");
  const home = await import("../../../src/pages/blog/BlogHome");
  return {
    pageRoutes,
    DICTIONARIES,
    loadBlogHome,
    loadBlogPost,
    arrive: () => act(async () => chunk.resolve(home)),
  };
}

const navigation = { navigate: null };
function Navigator() {
  navigation.navigate = useNavigate();
  return null;
}

function renderAt(table, path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navigator />
      <Routes>{table.pageRoutes()}</Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { status: 200 })),
  );
});

afterEach(() => {
  vi.doUnmock("../../../src/pages/blog/loaders.js");
});

describe("with the TR pages live", () => {
  it("/tr/blog: a Turkish fallback, then BlogHome from the same loader; /blog after it does not ask for the chunk again", async () => {
    const table = await freshRoutes();
    const { container } = renderAt(table, "/tr/blog");

    const fallback = container.querySelector(`.${routeStyles.routeFallback}`);
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveAttribute("lang", "tr");
    expect(fallback).toHaveTextContent(table.DICTIONARIES.tr["status.loading"]);

    await table.arrive();
    await screen.findByRole("heading", { level: 1, name: "Blog" });
    expect(container.querySelector(`.${routeStyles.routeFallback}`)).toBeNull();
    expect(table.loadBlogHome).toHaveBeenCalledTimes(1);
    expect(table.loadBlogPost).not.toHaveBeenCalled();

    await act(async () => navigation.navigate("/blog"));
    await screen.findByRole("heading", { level: 1, name: "Blog" });
    // One lazy component serves both languages: still a single request.
    expect(table.loadBlogHome).toHaveBeenCalledTimes(1);
  });

  it("/blog: the fallback stays English", async () => {
    const table = await freshRoutes();
    const { container } = renderAt(table, "/blog");

    const fallback = container.querySelector(`.${routeStyles.routeFallback}`);
    expect(fallback).toHaveAttribute("lang", "en");
    expect(fallback).toHaveTextContent(table.DICTIONARIES.en["status.loading"]);
    await table.arrive();
    await screen.findByRole("heading", { level: 1, name: "Blog" });
  });
});
