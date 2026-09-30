// The one media query hook (FE-06, PERF-12, DSG-07, T-14). Every component
// that reacts to a media query in JS uses this file; there is no second
// matchMedia hook (src/lib/theme.js keeps its own listener for the theme
// store, which is not a React hook).
//
//   useMediaQuery(query)       true while `query` matches; re-renders when the
//                              answer changes in the session (the user turns
//                              on "reduce motion", plugs a mouse into a tablet)
//   usePrefersReducedMotion()  the OS "reduce motion" setting
//
// The server snapshot is `false` (no media on the server), so SSR output and
// the hydration render never contain what the hook gates (PERF-03). Without
// matchMedia (old browsers, some test environments) every query is false.
import { useCallback, useSyncExternalStore } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const canMatch = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

const serverSnapshot = () => false;

export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      if (!canMatch()) return () => {};
      const list = window.matchMedia(query);
      if (typeof list.addEventListener === "function") {
        list.addEventListener("change", onChange);
        return () => list.removeEventListener("change", onChange);
      }
      // Safari < 14 only has the deprecated listener API.
      list.addListener?.(onChange);
      return () => list.removeListener?.(onChange);
    },
    [query],
  );
  const getSnapshot = () => canMatch() && window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}

export const usePrefersReducedMotion = () =>
  useMediaQuery(REDUCED_MOTION_QUERY);
