// FE-07 / PERF-12 / DSG-21 (T-14): the mount gate in src/app/App.jsx.
// The ring (and its lazy chunk) exists only for a fine, hovering pointer with
// "reduce motion" off, and follows changes of that answer in the session.
// Test order matters: the first test must run before anything loads the
// Cursor module (it checks the chunk is never requested).
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pointer, spyPointerListeners, stubMedia } from "./support.js";

// Counts real loads of the lazy Cursor module (the dynamic import in App).
const loads = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../../src/components/Cursor.jsx", async (importOriginal) => {
  loads.count += 1;
  return importOriginal();
});

const { default: App, CURSOR_QUERY } = await import("../../../src/app/App.jsx");

const ring = () => document.querySelector(".cursor-ring");
const move = () =>
  window.dispatchEvent(pointer("pointermove", { clientX: 40, clientY: 40 }));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  // Let a pending lazy load settle inside this test's act scope.
  return new Promise((resolve) => setTimeout(resolve, 0));
});

describe("cursor gate (T-14)", () => {
  it("uses one query: fine hovering pointer and no reduced motion", () => {
    expect(CURSOR_QUERY).toBe(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
  });

  it.each([
    ["a touch phone", { hover: "none", pointer: "coarse" }],
    ["a stylus tablet", { hover: "none", pointer: "fine" }],
    ["a mouse with reduce motion on", { "prefers-reduced-motion": "reduce" }],
  ])(
    "%s: no ring after moving and the chunk is never loaded",
    async (_name, media) => {
      stubMedia(media);
      render(<App />);
      move();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(ring()).toBeNull();
      expect(loads.count).toBe(0);
    },
  );

  it("a mouse: the ring mounts, shows on the first move and is aria-hidden", async () => {
    stubMedia();
    render(<App />);

    await waitFor(() => expect(ring()).not.toBeNull());
    expect(loads.count).toBe(1);
    move();
    expect(ring()).toHaveAttribute("data-visible");
    expect(ring()).toHaveAttribute("aria-hidden", "true");
    // Outside <main> and the page content.
    expect(ring().closest("main")).toBeNull();
  });

  it("turning reduce motion on mid-session unmounts the ring and removes the same 3 listeners", async () => {
    const media = stubMedia();
    const listeners = spyPointerListeners();
    render(<App />);
    await waitFor(() => expect(ring()).not.toBeNull());
    move();
    const added = listeners.added();
    expect(added).toHaveLength(3);

    media.set({ "prefers-reduced-motion": "reduce" });

    expect(ring()).toBeNull();
    const removed = listeners.removed();
    expect(removed).toHaveLength(3);
    for (const call of added) expect(removed).toContainEqual(call);
  });

  it("plugging a mouse into a touch device mounts it; unplugging removes it", async () => {
    const media = stubMedia({ hover: "none", pointer: "coarse" });
    render(<App />);
    expect(ring()).toBeNull();

    media.set({ hover: "hover", pointer: "fine" });
    await waitFor(() => expect(ring()).not.toBeNull());

    media.set({ hover: "none", pointer: "coarse" });
    expect(ring()).toBeNull();
  });

  it("unmounting the app leaves no media listener behind", async () => {
    const media = stubMedia();
    const { unmount } = render(<App />);
    await waitFor(() => expect(ring()).not.toBeNull());
    expect(media.listeners()).toBeGreaterThan(0);

    unmount();

    expect(media.listeners()).toBe(0);
  });
});
