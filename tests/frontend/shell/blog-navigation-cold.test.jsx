// PERF-13 / FE-17, the cold half of blog-navigation.test.jsx: with the Blog
// page chunk still loading, the new page's wrapper is mounted at once and
// shows RouteFallback inside <main> (the old page is gone, the header stays);
// the page replaces it when the chunk arrives. This is the trade-off of
// rendering the new route immediately (W6-PERF-code-split review): an
// uncached chunk is an empty, page-high block for the moment it takes to load
// (intent preload usually makes it zero), not a stale page on screen.
// The chunk is gated here by mocking the loader; a lazy component stays
// resolved for the rest of its file, so this is a file of its own.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { swrConfig } from "../../../src/lib/swr.js";

function stubPage(name) {
  const Page = () => <h1>{name}</h1>;
  Page.displayName = name.replace(/\s+/g, "");
  return Page;
}
vi.mock("../../../src/pages/home", () => ({ Home: stubPage("Home page") }));
vi.mock("../../../src/pages/about", () => ({ About: stubPage("About page") }));
vi.mock("../../../src/pages/portfolio", () => ({
  Portfolio: stubPage("Portfolio page"),
}));
vi.mock("../../../src/pages/contact", () => ({
  ContactUs: stubPage("Contact page"),
}));
vi.mock("../../../src/lib/analytics/usePageViewTracking.js", () => ({
  usePageViewTracking: () => {},
}));

const chunk = vi.hoisted(() => ({ release: null }));
vi.mock("../../../src/pages/blog/loaders.js", async (importOriginal) => {
  const actual = await importOriginal();
  const gate = new Promise((resolve) => {
    chunk.release = () => resolve(actual.loadBlogHome());
  });
  return { ...actual, loadBlogHome: () => gate };
});

const { default: AppRoutes } = await import("../../../src/app/routes.jsx");

// Warm the real module behind the gate, so releasing it is instant even on a
// busy machine (the gate, not the import, is what the test controls).
beforeAll(async () => {
  await import("../../../src/pages/blog/BlogHome");
}, 60_000);

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
});

describe("/ -> /blog with the chunk still loading", () => {
  it("shows RouteFallback inside the new page's wrapper, keeps the header, then the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[]", { status: 200 })),
    );
    const { container } = render(
      <SWRConfig
        value={{
          ...swrConfig,
          provider: () => new Map(),
          onErrorRetry: () => {},
        }}
      >
        <MemoryRouter initialEntries={["/"]}>
          <header>
            <Link to="/blog">to blog</Link>
          </header>
          <AppRoutes />
        </MemoryRouter>
      </SWRConfig>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "to blog" }));
    });

    const page = container.querySelector('[data-route="/blog"]');
    expect(page).not.toBeNull();
    expect(screen.getByRole("main")).toContainElement(page);
    expect(page).toHaveClass("page-enter");
    const fallback = page.querySelector(".route-fallback");
    expect(fallback).not.toBeNull();
    expect(fallback).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Home page")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "to blog" })).toBeInTheDocument();

    await act(async () => chunk.release());

    expect(
      await screen.findByRole("heading", { level: 1, name: "Blog" }),
    ).toBeInTheDocument();
    expect(page.querySelector(".route-fallback")).toBeNull();
  });
});
