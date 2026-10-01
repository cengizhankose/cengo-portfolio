// Route table shared by the Bun server and the Vite client (T-03, T-11, T-12).
// Pure ESM: no React, no browser globals. This is the one list of known
// routes: the server's 200/404 decision (src/server/static.ts), the client's
// NotFound fallback (src/app/routes.jsx) and the page meta (src/seo/pages.js)
// all read matchRoute(); FE-14's useLocale() reads it as well.
import { DEFAULT_LOCALE } from "./site.js";

// Keys of the page registry in src/seo/pages.js. The segments are the same in
// every language (T-12: '/about' <-> '/tr/about'). /privacy (ANL-04/SEC-25)
// is one page in both languages; /tr/privacy opens with the other TR pages.
export const STATIC_PATHS = Object.freeze([
  "/",
  "/about",
  "/portfolio",
  "/contact",
  "/blog",
  "/privacy",
]);

export const POST_PATH = "/blog/:slug";

// Blog slugs: lower-case ASCII words joined by single hyphens, as the publish
// tool writes them. Anything else under /blog/ is not a post.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const POST_PATTERN = /^\/blog\/([^/]+)$/;

// T-12: EN is the default language and has no prefix; TR lives under /tr.
export const LOCALE_PREFIX = Object.freeze({ en: "", tr: "/tr" });

// Which language is open for which kind of route. A route in a language that
// is not listed here is a 404 on the server and NotFound on the client.
//   post:   /tr/blog/:slug is open (SEO-11 Adım A), the TR post lives there.
//   static: both languages are open since W11 (SEO-11 Adım B, FE-14 Adım B,
//           MKT-14): the TR dictionary, content and meta are complete and the
//           parity test (tests/frontend/i18n) is strict.
export const LIVE = Object.freeze({
  static: Object.freeze(["en", "tr"]),
  post: Object.freeze(["en", "tr"]),
});

// Every language open: the shape of the table once all languages are live.
// Tests use it to check that routes.jsx and this table agree before a
// language opens.
export const ALL_LIVE = Object.freeze({
  static: Object.freeze(Object.keys(LOCALE_PREFIX)),
  post: Object.freeze(Object.keys(LOCALE_PREFIX)),
});

// Drops the query string, the hash and one trailing slash ("/about/" and
// "/about" are the same page). The root stays "/".
function normalizePath(pathname) {
  let path = typeof pathname === "string" ? pathname : "/";
  path = path.split(/[?#]/, 1)[0] || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

// "/tr/about" -> { locale: 'tr', rest: '/about' }; "/tr" -> rest "/".
// Unprefixed paths belong to DEFAULT_LOCALE.
function splitLocale(path) {
  for (const [locale, prefix] of Object.entries(LOCALE_PREFIX)) {
    if (!prefix) continue;
    if (path === prefix) return { locale, rest: "/" };
    if (path.startsWith(`${prefix}/`)) {
      return { locale, rest: path.slice(prefix.length) };
    }
  }
  return { locale: DEFAULT_LOCALE, rest: path };
}

// matchRoute(pathname, live?) -> { type: 'static' | 'post' | 'notfound',
// locale, path, slug? }
//   locale: the language of the URL prefix ('tr' for /tr/..., else 'en'),
//           for 'notfound' results too.
//   path:   the registry key for static pages, POST_PATH for posts and the
//           prefix-free normalised path for everything else.
// A known route whose language is not open in `live` is 'notfound'.
// Matching is case-sensitive; the server redirects /About to /about.
export function matchRoute(pathname, live = LIVE) {
  const { locale, rest } = splitLocale(normalizePath(pathname));

  if (STATIC_PATHS.includes(rest)) {
    return live.static.includes(locale)
      ? { type: "static", locale, path: rest }
      : { type: "notfound", locale, path: rest };
  }

  const post = POST_PATTERN.exec(rest);
  if (post && SLUG_PATTERN.test(post[1])) {
    return live.post.includes(locale)
      ? { type: "post", locale, path: POST_PATH, slug: post[1] }
      : { type: "notfound", locale, path: rest };
  }

  return { type: "notfound", locale, path: rest };
}
