// FE-08 / FE-09 / DSG-15 / DSG-16 (K-10): src/lib/theme.js resolves, applies
// and stores the theme; every storage access is guarded.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THEME,
  THEME_COLORS,
  applyTheme,
  followSystemTheme,
  getInitialTheme,
  getTheme,
  isTheme,
  readStoredTheme,
  setTheme,
  storeTheme,
  subscribe,
  systemTheme,
  useTheme,
} from "../../../src/lib/theme";
import {
  addThemeColorMetas,
  blockStorage,
  resetThemeDom,
  stubSystemTheme,
} from "./support";

beforeEach(() => addThemeColorMetas());
afterEach(() => resetThemeDom());

describe("isTheme / readStoredTheme", () => {
  it("accepts only light and dark", () => {
    expect(["light", "dark"].every(isTheme)).toBe(true);
    for (const value of [null, undefined, "", "null", "Dark", "system", 1])
      expect(isTheme(value)).toBe(false);
  });

  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["null", null],
    ["", null],
    ["blue", null],
  ])("stored %j reads as %j", (stored, expected) => {
    window.localStorage.setItem("theme", stored);
    expect(readStoredTheme()).toBe(expected);
  });

  it("reads null when there is no key", () => {
    expect(readStoredTheme()).toBeNull();
  });

  it("reads null instead of throwing when storage is blocked", () => {
    blockStorage();
    expect(() => readStoredTheme()).not.toThrow();
    expect(readStoredTheme()).toBeNull();
  });
});

describe("systemTheme (K-10)", () => {
  it.each([
    [true, "light"],
    [false, "dark"],
  ])("OS light=%s gives %s", (osLight, expected) => {
    stubSystemTheme(osLight);
    expect(systemTheme()).toBe(expected);
  });

  it("falls back to dark when matchMedia throws", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(() => {
      throw new Error("no media queries");
    });
    expect(systemTheme()).toBe(DEFAULT_THEME);
  });
});

describe("getInitialTheme (FE-08 criterion: four storage states)", () => {
  it.each([
    ["light", false, "light"],
    ["dark", true, "dark"],
    ["null", true, "light"],
    ["null", false, "dark"],
  ])("stored %j with OS light=%s gives %s", (stored, osLight, expected) => {
    stubSystemTheme(osLight);
    window.localStorage.setItem("theme", stored);
    expect(getInitialTheme()).toBe(expected);
  });

  it.each([
    [true, "light"],
    [false, "dark"],
  ])(
    "localStorage throwing does not propagate; OS light=%s gives %s",
    (osLight, expected) => {
      stubSystemTheme(osLight);
      blockStorage();
      expect(() => getInitialTheme()).not.toThrow();
      expect(getInitialTheme()).toBe(expected);
    },
  );

  it("prefers a valid data-theme set by the head script", () => {
    stubSystemTheme(false);
    window.localStorage.setItem("theme", "dark");
    document.documentElement.setAttribute("data-theme", "light");
    expect(getTheme()).toBe("light");
  });

  it('ignores an invalid data-theme such as the old "null"', () => {
    stubSystemTheme(true);
    document.documentElement.setAttribute("data-theme", "null");
    expect(getTheme()).toBe("light");
  });
});

describe("applyTheme (FE-09, DSG-16)", () => {
  it.each(["light", "dark"])(
    "%s sets data-theme, color-scheme and both theme-color metas",
    (theme) => {
      applyTheme(theme);

      const root = document.documentElement;
      expect(root.dataset.theme).toBe(theme);
      expect(root.style.colorScheme).toBe(theme);
      const metas = document.querySelectorAll('meta[name="theme-color"]');
      expect(metas).toHaveLength(2);
      for (const meta of metas)
        expect(meta.getAttribute("content")).toBe(THEME_COLORS[theme]);
    },
  );

  it("does not persist anything (K-10: the system keeps winning)", () => {
    applyTheme("light");
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it.each([null, "null", "", "blue"])("ignores %j", (value) => {
    applyTheme("dark");
    applyTheme(value);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("setTheme / storeTheme", () => {
  it("applies and persists the visitor's choice", () => {
    setTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("theme")).toBe("light");

    setTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  it('never writes an invalid value such as "null"', () => {
    setTheme(null);
    setTheme("null");
    expect(storeTheme(undefined)).toBe(false);
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("still switches the page when storage is blocked", () => {
    blockStorage();
    expect(() => setTheme("light")).not.toThrow();
    expect(storeTheme("light")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("subscribe / useTheme (FE-35, DSG-06 reuse)", () => {
  it("notifies on applyTheme and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    applyTheme("light");
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    listener.mockClear();
    applyTheme("dark");
    expect(listener).not.toHaveBeenCalled();
  });

  it("follows setTheme and writes to data-theme made elsewhere", async () => {
    stubSystemTheme(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current).toBe("dark");

    act(() => setTheme("light"));
    expect(result.current).toBe("light");

    // e.g. another tab or a devtools edit: picked up by the MutationObserver.
    await act(async () => {
      document.documentElement.setAttribute("data-theme", "dark");
      await Promise.resolve();
    });
    expect(result.current).toBe("dark");
  });
});

describe("followSystemTheme (K-10: follow OS changes until a choice exists)", () => {
  it("applies OS changes while nothing is stored", () => {
    const os = stubSystemTheme(false);
    applyTheme(getTheme());
    const stop = followSystemTheme();

    os.set(true);
    expect(document.documentElement.dataset.theme).toBe("light");
    os.set(false);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("theme")).toBeNull();

    stop();
    os.set(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("ignores OS changes once the visitor picked a theme", () => {
    const os = stubSystemTheme(false);
    const stop = followSystemTheme();
    setTheme("dark");

    os.set(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    stop();
  });

  it("uses addListener where addEventListener is missing (Safari < 14)", () => {
    const os = stubSystemTheme(false, { legacy: true });
    const stop = followSystemTheme();

    os.set(true);
    expect(document.documentElement.dataset.theme).toBe("light");
    stop();
    expect(os.listenerCount()).toBe(0);
  });
});
