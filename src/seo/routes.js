// Route table shared by the Bun server and the Vite client (T-03, T-11).
// Pure ESM: no React, no browser globals.
//
// This first version knows the EN static pages and the blog post pattern only.
// SEO-02 (W3) adds LOCALE_PREFIX ('/tr'), the LIVE table and slug validation;
// FE-14's useLocale() reads the same matchRoute().
import { DEFAULT_LOCALE } from "./site.js";

// Keys of the page registry in src/seo/pages.js (language-independent path
// segments, T-12: '/about' <-> '/tr/about').
export const STATIC_PATHS = Object.freeze([
  "/",
  "/about",
  "/portfolio",
  "/contact",
  "/blog",
]);

export const POST_PATH = "/blog/:slug";

const POST_PATTERN = /^\/blog\/([^/]+)$/;

// Drops the query string, the hash and one trailing slash ("/about/" and
// "/about" are the same page). The root stays "/".
function normalizePath(pathname) {
  let path = typeof pathname === "string" ? pathname : "/";
  path = path.split(/[?#]/, 1)[0] || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

// matchRoute(pathname) -> { type: 'static' | 'post' | 'notfound', locale,
// path, slug? }. `path` is the registry key for static pages, POST_PATH for
// posts and the normalised pathname for unknown paths.
export function matchRoute(pathname) {
  const path = normalizePath(pathname);
  const locale = DEFAULT_LOCALE;

  if (STATIC_PATHS.includes(path)) {
    return { type: "static", locale, path };
  }

  const post = POST_PATTERN.exec(path);
  if (post) {
    return { type: "post", locale, path: POST_PATH, slug: post[1] };
  }

  return { type: "notfound", locale, path };
}
