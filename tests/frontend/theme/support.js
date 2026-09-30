// Shared helpers for tests/frontend/theme/** (not a test file itself).
import { vi } from "vitest";
import { THEME_COLORS } from "../../../src/lib/theme";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

/** The two theme-color metas index.html ships (DSG-16), with their defaults. */
export function addThemeColorMetas() {
  for (const [scheme, color] of [
    ["dark", THEME_COLORS.dark],
    ["light", THEME_COLORS.light],
  ]) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    meta.setAttribute("media", `(prefers-color-scheme: ${scheme})`);
    document.head.append(meta);
  }
}

const storageSpies = [];

/**
 * Global state tests/frontend/setup.js does not reset. Call it from an
 * afterEach: it runs before the setup file's afterEach, which needs a working
 * localStorage again.
 */
export function resetThemeDom() {
  while (storageSpies.length) storageSpies.pop().mockRestore();
  for (const meta of document.querySelectorAll('meta[name="theme-color"]'))
    meta.remove();
  document.documentElement.style.removeProperty("color-scheme");
  document.documentElement.removeAttribute("data-theme");
}

/**
 * Chrome with "Not allowed to save data": reading window.localStorage throws
 * a SecurityError. Undone by resetThemeDom().
 */
export function blockStorage() {
  storageSpies.push(
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    }),
  );
}

/**
 * Controllable prefers-color-scheme. `set(osLight)` flips the OS setting and
 * fires "change" like a browser does. `legacy` gives a MediaQueryList with
 * only addListener/removeListener (Safari < 14).
 */
export function stubSystemTheme(osLight, { legacy = false } = {}) {
  let light = osLight;
  const listeners = new Set();
  const list = (query) => {
    const isLight = query === LIGHT_QUERY;
    const mql = {
      media: query,
      get matches() {
        return isLight ? light : !light;
      },
    };
    if (!isLight) return Object.assign(mql, noopListeners());
    const add = (a, b) => listeners.add(typeof a === "function" ? a : b);
    const remove = (a, b) => listeners.delete(typeof a === "function" ? a : b);
    return legacy
      ? Object.assign(mql, { addListener: add, removeListener: remove })
      : Object.assign(mql, {
          addEventListener: add,
          removeEventListener: remove,
        });
  };
  vi.spyOn(window, "matchMedia").mockImplementation(list);
  return {
    set(next) {
      light = next;
      for (const listener of [...listeners])
        listener({ matches: next, media: LIGHT_QUERY });
    },
    listenerCount: () => listeners.size,
  };
}

function noopListeners() {
  return {
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  };
}
