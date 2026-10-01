// FE-06 / DSG-07: prefers-reduced-motion support.
// - src/lib/useMediaQuery.js is the only media query hook; the server
//   snapshot is false; usePrefersReducedMotion() follows the OS setting.
// - With "reduce motion" on, the app renders no cursor ring and never loads
//   its chunk; turning it on mid-session removes a mounted ring.
// - One global CSS block ends every animation and transition at once
//   (durations, not `animation: none`, so the page transition still gets
//   its animationend).
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { render, renderHook, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  REDUCED_MOTION_QUERY,
  useMediaQuery,
  usePrefersReducedMotion,
} from "../../../src/lib/useMediaQuery.js";
import { ROOT, pointer, read, rule, stubMedia } from "./support.js";

const loads = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../../src/components/Cursor.jsx", async (importOriginal) => {
  loads.count += 1;
  return importOriginal();
});

const { default: App } = await import("../../../src/app/App.jsx");

function sourceFiles(dir = "src") {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(jsx?|tsx?|css|scss)$/.test(entry.name) ? [path] : [];
    },
  );
}

describe("usePrefersReducedMotion / useMediaQuery (FE-06 step 2)", () => {
  it("asks the reduce query", () => {
    expect(REDUCED_MOTION_QUERY).toBe("(prefers-reduced-motion: reduce)");
  });

  it("is true while the OS asks for reduced motion and follows changes", () => {
    const media = stubMedia({ "prefers-reduced-motion": "reduce" });
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);

    media.set({ "prefers-reduced-motion": "no-preference" });
    expect(result.current).toBe(false);

    media.set({ "prefers-reduced-motion": "reduce" });
    expect(result.current).toBe(true);
  });

  it("removes its change listener on unmount", () => {
    const media = stubMedia();
    const { unmount } = renderHook(() => useMediaQuery("(pointer: fine)"));
    expect(media.listeners()).toBe(1);
    unmount();
    expect(media.listeners()).toBe(0);
  });

  it("is false on the server (no media there; PERF-03 hydration)", () => {
    stubMedia({ "prefers-reduced-motion": "reduce" });
    function Probe() {
      return <output>{String(usePrefersReducedMotion())}</output>;
    }
    expect(renderToString(<Probe />)).toBe("<output>false</output>");
  });

  it("is false when the browser has no matchMedia", () => {
    const original = window.matchMedia;
    try {
      delete window.matchMedia;
      const { result } = renderHook(() => usePrefersReducedMotion());
      expect(result.current).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });

  it("works with the old addListener API (Safari < 14)", () => {
    let matches = false;
    const listeners = new Set();
    vi.spyOn(window, "matchMedia").mockImplementation((media) => ({
      media,
      get matches() {
        return matches;
      },
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener),
    }));
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });
});

describe("the app under reduced motion (FE-06 criterion 4, DSG-07 step 5)", () => {
  it("renders no cursor ring after pointer moves and never imports it", async () => {
    stubMedia({ "prefers-reduced-motion": "reduce" });
    window.history.replaceState(null, "", "/");
    render(<App />);
    for (let i = 0; i < 20; i += 1) {
      window.dispatchEvent(
        pointer("pointermove", { clientX: i * 10, clientY: i * 5 }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(document.querySelector(".cursor-ring")).toBeNull();
    expect(loads.count).toBe(0);
  });

  it("removes a mounted ring when reduce motion is switched on", async () => {
    const media = stubMedia();
    window.history.replaceState(null, "", "/");
    render(<App />);
    await waitFor(() =>
      expect(document.querySelector(".cursor-ring")).not.toBeNull(),
    );

    media.set({ "prefers-reduced-motion": "reduce" });

    expect(document.querySelector(".cursor-ring")).toBeNull();
  });
});

describe("source guards (FE-06 criterion 1, DSG-07 criterion 1)", () => {
  const files = sourceFiles();

  it("mentions prefers-reduced-motion in the CSS block, the rotator rule and the hook", () => {
    const hits = files.filter((file) =>
      read(file).includes("prefers-reduced-motion"),
    );
    expect(hits).toEqual(
      expect.arrayContaining([
        "src/styles/base.css",
        "src/pages/home/home.module.css",
        "src/lib/useMediaQuery.js",
      ]),
    );
    const count = files
      .map((file) => read(file).match(/prefers-reduced-motion/g)?.length ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("calls matchMedia( only in the one hook file and the theme store", () => {
    const callers = files.filter((file) => read(file).includes("matchMedia("));
    expect(callers.sort()).toEqual([
      "src/lib/theme.js",
      "src/lib/useMediaQuery.js",
    ]);
  });
});

describe("global reduced-motion block in src/styles/base.css (FE-06 step 1)", () => {
  const css = read("src/styles/base.css");
  const block = rule(
    css,
    "*, *::before, *::after",
    "(prefers-reduced-motion: reduce)",
  );

  it("ends every animation and transition at once", () => {
    expect(block).toMatchObject({
      "animation-duration": "0.01ms !important",
      "animation-iteration-count": "1 !important",
      "transition-duration": "0.01ms !important",
      "scroll-behavior": "auto !important",
      "animation-delay": "0s !important",
      "transition-delay": "0s !important",
    });
  });

  it("does not switch animations off globally (routes.jsx waits for animationend)", () => {
    expect(block).not.toHaveProperty("animation");
    expect(block).not.toHaveProperty("animation-name");
  });
});
