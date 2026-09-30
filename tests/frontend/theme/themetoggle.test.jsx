// FE-08, FE-09, DSG-15, DSG-16, PERF-21 (K-10): the toggle reads the theme the
// head script applied, stores only on click, keeps aria-pressed, color-scheme
// and theme-color in sync, and survives blocked storage.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Themetoggle from "../../../src/components/themetoggle";
import { THEME_COLORS } from "../../../src/lib/theme";
import {
  addThemeColorMetas,
  blockStorage,
  resetThemeDom,
  stubSystemTheme,
} from "./support";

beforeEach(() => addThemeColorMetas());
afterEach(() => resetThemeDom());

const root = () => document.documentElement;
const toggle = () => screen.getByRole("button", { name: "Dark theme" });
const metaColors = () =>
  [...document.querySelectorAll('meta[name="theme-color"]')].map((m) =>
    m.getAttribute("content"),
  );

function expectTheme(theme) {
  expect(root().dataset.theme).toBe(theme);
  expect(root().style.colorScheme).toBe(theme);
  expect(metaColors()).toEqual([THEME_COLORS[theme], THEME_COLORS[theme]]);
  expect(toggle()).toHaveAttribute("aria-pressed", String(theme === "dark"));
}

describe("first visit, nothing stored (FE-08, DSG-15)", () => {
  it("dark OS: dark theme, dark theme-color, nothing stored", () => {
    stubSystemTheme(false);
    render(<Themetoggle />);

    expectTheme("dark");
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("light OS: light theme, light theme-color, nothing stored", () => {
    stubSystemTheme(true);
    render(<Themetoggle />);

    expectTheme("light");
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it.each([
    [false, "light"],
    [true, "dark"],
  ])(
    "OS light=%s: the first click visibly switches to %s and stores it",
    async (osLight, next) => {
      const user = userEvent.setup();
      stubSystemTheme(osLight);
      render(<Themetoggle />);

      await user.click(toggle());

      expectTheme(next);
      expect(window.localStorage.getItem("theme")).toBe(next);
    },
  );

  it('a stored "null" from old visits never reaches data-theme', () => {
    stubSystemTheme(true);
    window.localStorage.setItem("theme", "null");
    render(<Themetoggle />);

    expectTheme("light");
    expect(window.localStorage.getItem("theme")).not.toBe("light");
  });
});

describe("theme-color and color-scheme follow every click (DSG-16, FE-09)", () => {
  it("dark -> light -> dark", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("theme", "dark");
    render(<Themetoggle />);
    expectTheme("dark");

    await user.click(toggle());
    expectTheme("light");

    await user.click(toggle());
    expectTheme("dark");
  });
});

describe("head script already ran (PERF-21)", () => {
  it("takes the theme from <html> without reading storage", () => {
    stubSystemTheme(false);
    window.localStorage.setItem("theme", "light");
    root().setAttribute("data-theme", "light");
    const getItem = vi.spyOn(Storage.prototype, "getItem");

    render(<Themetoggle />);

    expect(getItem).not.toHaveBeenCalled();
    expectTheme("light");
  });

  it("does not replace the head script's theme with the system one", () => {
    stubSystemTheme(false);
    root().setAttribute("data-theme", "light");

    render(<Themetoggle />);

    expect(root().dataset.theme).toBe("light");
    expect(window.localStorage.getItem("theme")).toBeNull();
  });
});

describe("blocked storage (FE-09)", () => {
  it("renders, follows the system and still toggles", async () => {
    const user = userEvent.setup();
    stubSystemTheme(true);
    blockStorage();

    expect(() => render(<Themetoggle />)).not.toThrow();
    expectTheme("light");

    await user.click(toggle());
    expectTheme("dark");
  });
});

describe("system changes (K-10)", () => {
  it("are followed while nothing is stored, ignored after a click", async () => {
    const user = userEvent.setup();
    const os = stubSystemTheme(false);
    render(<Themetoggle />);
    expectTheme("dark");

    act(() => os.set(true));
    expectTheme("light");
    expect(window.localStorage.getItem("theme")).toBeNull();

    await user.click(toggle());
    expectTheme("dark");
    act(() => os.set(false));
    act(() => os.set(true));
    expectTheme("dark");
  });

  it("the OS listener is removed on unmount", () => {
    const os = stubSystemTheme(false);
    const { unmount } = render(<Themetoggle />);
    expect(os.listenerCount()).toBe(1);

    unmount();
    expect(os.listenerCount()).toBe(0);
  });
});
