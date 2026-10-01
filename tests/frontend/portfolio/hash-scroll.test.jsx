// W11 handoff: /portfolio#project-<id> (home work cards, service proof links)
// scrolls to the case after a client-side navigation, as About does for
// #awards. Reduced motion jumps instead of scrolling smoothly.
import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
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
vi.mock("../../../src/lib/analytics/index.js", () => ({ track: vi.fn() }));

const { Portfolio } = await import("../../../src/pages/portfolio");

let scrollIntoView;
let reduced;

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView; // jsdom has none
  reduced = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query) => ({
      matches: reduced && query.includes("prefers-reduced-motion: reduce"),
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete Element.prototype.scrollIntoView;
});

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/"
          element={
            <Link to="/portfolio#project-farmin">Farmin case</Link>
          }
        />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/tr/portfolio" element={<Portfolio />} />
      </Routes>
    </MemoryRouter>,
  );

describe("portfolio hash scroll", () => {
  it("scrolls the case into view after a client-side navigation from another page", () => {
    renderAt("/");
    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: "Farmin case" }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0].id).toBe("project-farmin");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth" });
  });

  it("scrolls when the page is opened with the hash, in Turkish too", () => {
    renderAt("/tr/portfolio#project-salesgym");

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0].id).toBe("project-salesgym");
  });

  it("jumps instead of scrolling smoothly when the visitor prefers reduced motion", () => {
    reduced = true;
    renderAt("/portfolio#project-effort_lab");

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto" });
  });

  it("does nothing without a hash, with an unknown id or with a malformed escape", () => {
    renderAt("/portfolio");
    renderAt("/portfolio#no-such-case");
    renderAt("/portfolio#%E0%A4%A");

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
