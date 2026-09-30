// Smoke: the whole app mounts at "/" (FE-22). W2-SEO-head-module added the
// head checks (T-03 usePageMeta, no head-manager provider);
// W5-DSG-motion-cursor-hero updates the shell/hero parts of this file.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../../src/app/App";

const count = (selector) => document.head.querySelectorAll(selector).length;

beforeEach(() => {
  // BrowserRouter reads the real jsdom URL; a test that navigates must not
  // leak its path into the next one.
  window.history.replaceState(null, "", "/");
  // Keep React's own <link rel="preload"> (it dedupes per document); only the
  // tags usePageMeta manages are reset.
  document.head
    .querySelectorAll("title, meta[name]")
    .forEach((element) => element.remove());
});

// The page transition swaps routes on animationend, which jsdom never fires.
// React listens for the prefixed name in jsdom (no AnimationEvent there) and
// for the standard one in browsers, so both are sent.
async function finishPageTransition() {
  const transition = document.querySelector(".page-transition");
  if (!transition) return;
  await act(async () => {
    for (const type of ["animationend", "webkitAnimationEnd"]) {
      transition.dispatchEvent(new Event(type, { bubbles: true }));
    }
  });
}

describe("App (smoke)", () => {
  it("renders the home page at / with a level-1 heading", () => {
    render(<App />);

    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("opens with one static h1, name and role, and the rotating line outside it (K-06b)", () => {
    render(<App />);

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(h1.textContent.replace(/\s+/g, " ").trim()).toBe(
      "Cengizhan Köse Senior Fullstack Engineer",
    );
    expect(document.querySelectorAll("#home h2")).toHaveLength(0);
    const rotator = document.querySelector(".rotator");
    expect(rotator).toHaveAttribute("aria-hidden", "true");
    expect(rotator.closest("h1")).toBeNull();
  });

  it("draws no cursor ring without a fine pointer and keeps the system cursor (T-14)", async () => {
    // tests/frontend/setup.js: matchMedia matches nothing (no mouse).
    render(<App />);
    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 5, clientY: 5 }),
    );
    await act(async () => {});

    expect(document.querySelector(".cursor-ring")).toBeNull();
    expect(document.body.style.cursor).toBe("");
    expect(document.querySelectorAll('[style*="cursor"]')).toHaveLength(0);
  });

  it("renders the site header with a home link and the menu button", () => {
    const { container } = render(<App />);

    const header = screen.getByRole("banner");
    const homeLinks = within(header)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/");
    expect(homeLinks.length).toBeGreaterThan(0);
    expect(container.querySelector("button.menu__button")).toBeInTheDocument();
  });

  it("writes the home meta without a head-manager provider (T-03)", async () => {
    render(<App />);

    await waitFor(() =>
      expect(document.title).toBe("Cengizhan Köse | Senior Fullstack Engineer"),
    );
    expect(count("title")).toBe(1);
    expect(count('meta[name="description"]')).toBe(1);
    expect(count('meta[name="robots"]')).toBe(0);
    expect(count("meta[charset]")).toBe(0);
    expect(document.documentElement.lang).toBe("en");
  });

  it("preloads the hero image through react-dom preload()", async () => {
    render(<App />);

    await waitFor(() =>
      expect(
        document.head.querySelector('link[rel="preload"][as="image"]'),
      ).toBeInTheDocument(),
    );
    const link = document.head.querySelector('link[rel="preload"][as="image"]');
    // W6-DSG-hero-image-lcp (PERF-02): the AVIF srcset of the <picture>, so
    // the browser preloads the same variant the page then uses.
    expect(link.getAttribute("imagesrcset")).toContain(
      "/img/hero/cengizhan-kose-v1-768.avif 768w",
    );
    expect(link.getAttribute("type")).toBe("image/avif");
    expect(link.getAttribute("fetchpriority")).toBe("high");
  });

  it("menu -> Blog updates the title and keeps one description (SEO-25)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[]", { status: 200 })),
    );
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(count('meta[name="description"]')).toBe(1));

    const header = screen.getByRole("banner");
    await user.click(
      within(header).getByRole("link", { name: "Blog", hidden: true }),
    );
    await finishPageTransition();

    await waitFor(() => expect(document.title).toBe("Blog | Cengizhan Köse"));
    expect(count('meta[name="description"]')).toBe(1);
    expect(count("title")).toBe(1);
    expect(window.location.pathname).toBe("/blog");
  });
});
