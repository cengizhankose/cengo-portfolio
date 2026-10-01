// FE-03 acceptance criteria on the real app shell (App -> header + routes):
// a failing blog API is an error state and never a white page, a page that
// throws only takes down the route content, and the next page renders again.
// The portfolio page is replaced with one that throws while rendering.
import { lazy, Suspense } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../../src/app/App";
import { ErrorBoundary } from "../../../src/components/ErrorBoundary";
import { translate } from "../../../src/i18n/translate.js";
import { finishPageTransition, json } from "./support.jsx";
import headerStyles from "../../../src/header/header.module.css";

vi.mock("../../../src/pages/portfolio", () => ({
  Portfolio: () => {
    throw new Error("render failure in a test page");
  },
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  document.head.innerHTML = "<title>x</title>";
  // React reports caught render errors through console.error.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function renderAppAt(path) {
  window.history.replaceState(null, "", path);
  return render(<App />);
}

describe("blog API failures inside the app (FE-03 criteria 1 and 4)", () => {
  it("500 {error}: 'Posts couldn't be loaded' + 'Try again', no TypeError", async () => {
    const pageErrors = [];
    const onError = (event) => pageErrors.push(event.error);
    window.addEventListener("error", onError);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "Failed to fetch posts" }, 500)),
    );
    try {
      renderAppAt("/blog");
      expect(
        await screen.findByText("Posts couldn't be loaded"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
      expect(screen.queryByText(/No posts yet/)).toBeNull();
      expect(document.querySelector(".route-error")).toBeNull();
      expect(pageErrors).toEqual([]);
    } finally {
      window.removeEventListener("error", onError);
    }
  });

  it("request blocked (network error): header and the error message stay", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    renderAppAt("/blog");
    await screen.findByText("Posts couldn't be loaded");
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(
      document.querySelector(`button.${headerStyles.menuButton}`),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent(
      /couldn't reach the server/,
    );
  });
});

describe("a page that throws (FE-03 criteria 2 and 3)", () => {
  it("shows the fallback in <main>; the menu button stays", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json([])),
    );
    renderAppAt("/portfolio");

    const fallback = await screen.findByRole("alert");
    expect(fallback).toHaveClass("route-error");
    expect(
      within(fallback).getByRole("heading", {
        level: 1,
        name: "Something went wrong on this page",
      }),
    ).toBeInTheDocument();
    expect(
      within(fallback).getByRole("link", { name: "Home" }),
    ).toHaveAttribute("href", "/");
    expect(
      within(fallback).getByRole("button", { name: "Reload the page" }),
    ).toBeVisible();
    expect(screen.getByRole("main")).toContainElement(fallback);
    expect(
      document.querySelector(`.${headerStyles.menuButton}`),
    ).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("moving to /about renders About's h1 (the boundary starts clean)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json([])),
    );
    renderAppAt("/portfolio");
    await screen.findByRole("alert");

    const header = screen.getByRole("banner");
    await user.click(
      within(header).getByRole("link", { name: "About", hidden: true }),
    );
    await finishPageTransition();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: translate("en", "about.title"),
      }),
    ).toBeInTheDocument();
    expect(document.querySelector(".route-error")).toBeNull();
    expect(window.location.pathname).toBe("/about");
  });

  it("'Reload the page' reloads the document", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const original = window.location;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json([])),
    );
    renderAppAt("/portfolio");
    const button = await screen.findByRole("button", {
      name: "Reload the page",
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload },
    });
    try {
      await user.click(button);
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    }
  });
});

describe("chunk-load failures (FE-05 readiness)", () => {
  it("a lazy page whose chunk fails to load shows the fallback", async () => {
    const Broken = lazy(() =>
      Promise.reject(
        new TypeError("Failed to fetch dynamically imported module"),
      ),
    );
    const onError = vi.fn();
    render(
      <MemoryRouter>
        <main>
          <ErrorBoundary onError={onError}>
            <Suspense fallback={null}>
              <Broken />
            </Suspense>
          </ErrorBoundary>
        </main>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Something went wrong on this page",
      }),
    ).toBeInTheDocument();
    await act(async () => {});
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ name: "TypeError" }),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });
});
