// Intent preload for the blog (PERF-14, T-04).
//
// ONE delegated listener pair on the document (pointerover + focusin; touch
// and pen fire pointerover too) instead of handlers on every link: when a
// pointer or the keyboard reaches a link into the blog, its data request
// starts before the click, so the page usually has its data by the time it
// mounts and skips "Loading...".
//   /blog, /tr/blog           the two list keys of that blog index
//   /blog/<slug>, /tr/...     the post key
// Only same-origin links whose path matchRoute() knows as live are used, so
// a link to a closed language or a 404 never costs a request. Nothing runs
// on a Save-Data connection.
//
// Extension point: W6-PERF-code-split adds the page chunk preload to
// prefetchRoute() below (loadBlogHome / loadBlogPost from
// src/pages/blog/loaders.js), next to the data keys.
import { matchRoute } from "../seo/routes.js";
import { prefetchKey } from "../hooks/usePosts.js";
import { blogIndexKeys, postKey } from "./swr.js";

export const PREFETCH_SELECTOR = "a[href*='/blog']";

// keysForRoute(matchRoute('/tr/blog/x')) -> ['/api/posts/x']
export function keysForRoute(route) {
  if (route?.type === "post") return [postKey(route.slug)];
  if (route?.type === "static" && route.path === "/blog") {
    return blogIndexKeys(route.locale);
  }
  return [];
}

// Starts everything the page at `route` needs. `swr` is { cache, mutate,
// fallback } from the app's <SWRConfig> (useSWRConfig()).
export function prefetchRoute(route, swr) {
  for (const key of keysForRoute(route)) prefetchKey(key, swr);
}

function saveData() {
  try {
    return Boolean(globalThis.navigator?.connection?.saveData);
  } catch {
    return false;
  }
}

// The path of a same-origin link, or null.
function linkPath(link, origin) {
  try {
    const url = new URL(link.href, origin);
    return url.origin === origin ? url.pathname : null;
  } catch {
    return null;
  }
}

// installIntentPrefetch({ cache, mutate, fallback }) -> uninstall()
// `target` (default: document) is where the listeners go; tests pass their
// own container.
export function installIntentPrefetch(swr, { target } = {}) {
  const root = target ?? globalThis.document;
  if (!root?.addEventListener) return () => {};
  const origin = globalThis.location?.origin;

  const onIntent = (event) => {
    const link = event.target?.closest?.(PREFETCH_SELECTOR);
    if (!link || !origin || saveData()) return;
    const path = linkPath(link, origin);
    if (path) prefetchRoute(matchRoute(path), swr);
  };

  root.addEventListener("pointerover", onIntent, { passive: true });
  root.addEventListener("focusin", onIntent);
  return () => {
    root.removeEventListener("pointerover", onIntent, { passive: true });
    root.removeEventListener("focusin", onIntent);
  };
}
