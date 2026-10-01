// Theme store (FE-08, FE-09, DSG-15, DSG-16, PERF-21; K-10 = follow the
// system preference until the visitor picks a theme).
//
// The source of truth is <html data-theme>. The inline script in index.html
// sets it before the first paint (together with style.colorScheme and the
// theme-color metas); this module keeps it in sync afterwards. Every
// localStorage access lives here, inside try/catch, so a browser that blocks
// storage (SecurityError on the getter) still renders.
//
// Keep THEME_COLORS equal to --bg-color in src/styles/tokens.css and to the colors in
// the index.html script; tests/frontend/theme/inline-script.test.js checks it.
import { useSyncExternalStore } from "react";

export const STORAGE_KEY = "theme";
export const THEME_COLORS = Object.freeze({
  dark: "#0c0c0c",
  light: "#ffffff",
});

// Used when nothing else can decide: on the server (no DOM) and in browsers
// without matchMedia. Matches the :root (dark) tokens in src/styles/tokens.css.
export const DEFAULT_THEME = "dark";

const LIGHT_QUERY = "(prefers-color-scheme: light)";
const hasDom = () => typeof document !== "undefined";

/** Only "light" and "dark" are themes; null, "null" or junk are not. */
export const isTheme = (value) => value === "light" || value === "dark";

/** The visitor's explicit choice, or null when there is none (or no storage). */
export function readStoredTheme() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

/** Persists an explicit choice. Returns false when storage is unavailable. */
export function storeTheme(theme) {
  if (!isTheme(theme)) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

/** Operating-system preference (K-10). "dark" unless the OS asks for light. */
export function systemTheme() {
  try {
    return typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(LIGHT_QUERY).matches
      ? "light"
      : "dark";
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * The theme on screen: <html data-theme> when the head script (or an earlier
 * applyTheme) set it, otherwise the stored choice, otherwise the system theme.
 * Never returns anything but "light" or "dark".
 */
export function getTheme() {
  if (!hasDom()) return DEFAULT_THEME;
  const current = document.documentElement.getAttribute("data-theme");
  if (isTheme(current)) return current;
  return readStoredTheme() ?? systemTheme();
}

/** FE-08 name for the same resolution order. */
export const getInitialTheme = getTheme;

const listeners = new Set();
let observer = null;

function notify() {
  for (const listener of [...listeners]) listener();
}

/**
 * Puts a theme on the page without persisting it: data-theme, the inline
 * color-scheme (scrollbars and form controls follow it) and every
 * <meta name="theme-color"> (browser UI color = page background, DSG-16).
 */
export function applyTheme(theme) {
  if (!hasDom() || !isTheme(theme)) return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", THEME_COLORS[theme]);
  }
  notify();
}

/** The visitor picked a theme: show it and remember it. */
export function setTheme(theme) {
  if (!isTheme(theme)) return;
  storeTheme(theme);
  applyTheme(theme);
}

/**
 * Subscribes to theme changes, including writes to data-theme made outside
 * this module (MutationObserver). Returns the unsubscribe function.
 */
export function subscribe(listener) {
  listeners.add(listener);
  if (!observer && hasDom() && typeof MutationObserver === "function") {
    observer = new MutationObserver(notify);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

// The server cannot know the visitor's theme; hydration starts from the
// default and React re-renders with the client value (no mismatch error).
const getServerTheme = () => DEFAULT_THEME;

/** Current theme as React state; re-renders on every change (FE-35, DSG-06). */
export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, getServerTheme);
}

/**
 * While the visitor has no stored choice, follow OS theme changes (K-10).
 * Returns the cleanup function.
 */
export function followSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => {};
  let query;
  try {
    query = window.matchMedia(LIGHT_QUERY);
  } catch {
    return () => {};
  }
  const onChange = () => {
    if (readStoredTheme() === null) applyTheme(systemTheme());
  };
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }
  // Safari < 14 only has the deprecated MediaQueryList listener API.
  if (typeof query.addListener === "function") {
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }
  return () => {};
}
