// Intent preload for the blog (PERF-14, T-04).
//
// ONE delegated listener pair on the document (pointerover + focusin; touch
// and pen fire pointerover too) instead of handlers on every link: when a
// pointer or the keyboard reaches a link into the blog, its data request
// starts before the click, so the page usually has its data by the time it
// mounts and skips "Loading…".
//   /blog, /tr/blog           the two list keys of that blog index
//   /blog/<slug>, /tr/...     the post key
// Only same-origin links whose path matchRoute() knows as live are used, so
// a link to a closed language or a 404 never costs a request. Nothing runs
// on a Save-Data connection.
//
// The page chunk is preloaded next to the data (PERF-04/FE-05): BlogHome for
// the list, BlogPost (with the markdown chain) for a post, through the same
// loaders the lazy routes use (src/pages/blog/loaders.js), so a hover and the
// click after it share one request per chunk.
import { matchRoute } from "../seo/routes.js";
import { prefetchKey } from "../hooks/usePosts.js";
import { loadBlogHome, loadBlogPost } from "../pages/blog/loaders.js";
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

// chunkLoaderForRoute(matchRoute('/blog/x')) -> loadBlogPost
export function chunkLoaderForRoute(route) {
  if (route?.type === "post") return loadBlogPost;
  if (route?.type === "static" && route.path === "/blog") return loadBlogHome;
  return null;
}

// Starts the page chunk of `route`. A failed preload is ignored: the page
// asks for its chunk again when it renders (and lazyPage handles that).
export function prefetchChunk(route) {
  const load = chunkLoaderForRoute(route);
  if (!load) return;
  try {
    Promise.resolve(load()).catch(() => {});
  } catch {
    // A loader that throws synchronously is treated like a failed preload.
  }
}

// Starts everything the page at `route` needs: its chunk and its data. `swr`
// is { cache, mutate, fallback } from the app's <SWRConfig> (useSWRConfig()).
export function prefetchRoute(route, swr) {
  prefetchChunk(route);
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
