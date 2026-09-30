// Vitest setup for component tests (T-02, FE-22).
// Loaded via `test.setupFiles` in vite.config.js for every file under
// tests/frontend/**. Files that opt into `@vitest-environment node` have no
// window/document, so the DOM parts below are guarded.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const hasDom = typeof window !== "undefined";

if (hasDom) {
  // jsdom has no matchMedia. Default to "no match" so components that ask
  // for prefers-color-scheme / prefers-reduced-motion / pointer queries still
  // render. Tests that need a match stub window.matchMedia themselves.
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      }),
    });
  }

  // jsdom logs "Not implemented: window.scrollTo"; the app calls it on every
  // navigation (ScrollToTop, page transitions).
  window.scrollTo = () => {};
}

afterEach(() => {
  if (!hasDom) return;
  // Vitest runs without globals, so Testing Library cannot register its own
  // auto-cleanup.
  cleanup();
  // Global DOM/browser state that components mutate directly.
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.body.removeAttribute("class");
  document.body.removeAttribute("style");
});
