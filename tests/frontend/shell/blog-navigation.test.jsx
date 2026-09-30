// FE-17 criterion 2 / PERF-13: moving to /blog mounts the Blog page in the
// same commit as the click, so its data request starts at once; nothing waits
// for a fade. With the page chunk already loaded the h1 is in the DOM right
// after the click (no timer advanced, no animationend). Real BlogHome, real
// swr cache; `fetch` and the static pages are stubs. The chunk that is still
// loading is in blog-navigation-cold.test.jsx (a lazy component stays
// resolved for the rest of its file).
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const { default: AppRoutes } = await import("../../../src/app/routes.jsx");

function renderAt(path) {
  const value = {
    ...swrConfig,
    provider: () => new Map(),
    onErrorRetry: () => {},
  };
  return render(
    <SWRConfig value={value}>
      <MemoryRouter initialEntries={[path]}>
        <header>
          <Link to="/blog">to blog</Link>
        </header>
        <AppRoutes />
      </MemoryRouter>
    </SWRConfig>,
  );
}

const postListRequests = (fetchMock) =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/posts"));

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
});

describe("/ -> /blog", () => {
  it("has the Blog h1 in the DOM and the posts request started right after the click", async () => {
    // The chunk is loaded before the click, as a hover or focus preload
    // (PERF-14) usually leaves it.
    await import("../../../src/pages/blog/BlogHome");
    const pending = new Promise(() => {});
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/");
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "to blog" }));
    });

    // No timer advanced, no animationend dispatched.
    expect(
      screen.getByRole("heading", { level: 1, name: "Blog" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Home page")).not.toBeInTheDocument();
    expect(postListRequests(fetchMock).length).toBeGreaterThan(0);
    expect(String(postListRequests(fetchMock)[0][0])).toBe(
      "/api/posts?lang=en",
    );
  });
});
