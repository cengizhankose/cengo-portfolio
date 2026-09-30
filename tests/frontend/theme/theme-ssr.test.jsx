// @vitest-environment node
// PERF-21 / PERF-03 prerequisite: the theme code is safe without a DOM. The
// server cannot know the visitor's theme, so it renders the default and the
// client corrects it after hydration (useSyncExternalStore server snapshot).
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Themetoggle from "../../../src/components/themetoggle";
import {
  DEFAULT_THEME,
  applyTheme,
  followSystemTheme,
  getTheme,
  readStoredTheme,
  setTheme,
  storeTheme,
  subscribe,
  systemTheme,
} from "../../../src/lib/theme";

describe("theme without window/document", () => {
  it("really runs without a DOM", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("resolves to the default theme and never throws", () => {
    expect(getTheme()).toBe(DEFAULT_THEME);
    expect(readStoredTheme()).toBeNull();
    expect(systemTheme()).toBe("dark");
    expect(storeTheme("light")).toBe(false);
    expect(() => applyTheme("light")).not.toThrow();
    expect(() => setTheme("light")).not.toThrow();
    const stop = followSystemTheme();
    expect(() => stop()).not.toThrow();
    const unsubscribe = subscribe(vi.fn());
    expect(() => unsubscribe()).not.toThrow();
  });

  it("server-renders the toggle with the default state", () => {
    const html = renderToString(<Themetoggle />);
    expect(html).toContain('aria-label="Dark theme"');
    expect(html).toContain('aria-pressed="true"');
  });
});
