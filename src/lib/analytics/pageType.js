// What kind of page a URL is, for analytics (ANL-07, ANL-05, ANL-06, T-12).
//
// One place derives the page type, the interface language, the post slug, the
// title and the coarse path group of a pathname, from the same route table the
// server and the router use (src/seo/routes.js, src/seo/pages.js). The page
// view hook, the Web Vitals reporter and the 404 page all read it; nothing
// else keeps a route list of its own.
//
// Pure ESM, no React and no browser globals.
//
// The functions describe a URL, not what is on screen today:
//   - page_type does not depend on the language prefix (T-12): '/tr/about' is
//     an `about` page in `tr`, whether or not the TR pages are open yet. The
//     page view hook asks matchRoute() with the live table as well and
//     reports `not_found` for a route that is closed (what <LiveGate> shows);
//   - matching is case-sensitive, like the server (SEO-02): '/About' is a
//     `not_found`.
import { displayLocale, getPageMeta } from "../../seo/pages.js";
import { ALL_LIVE, matchRoute } from "../../seo/routes.js";
import { LOCALES } from "../../seo/site.js";

// Values are the PAGE_TYPES of events.js.
const PAGE_TYPE_BY_PATH = Object.freeze({
  "/": "home",
  "/about": "about",
  "/portfolio": "portfolio",
  "/contact": "contact",
  "/privacy": "privacy",
  "/blog": "blog_index",
});

// /privacy (ANL-04) joins the route table with the privacy page (W9). Until
// then matchRoute() does not list it; its page type exists already, so the
// analytics vocabulary does not change the day the page does.
const PRIVACY_PATH = "/privacy";

// The URL against every language open: the question is which page the URL
// names, not which languages are live.
const nominalRoute = (pathname) => matchRoute(pathname, ALL_LIVE);

/**
 * getPageType('/') -> 'home'; '/tr/blog' -> 'blog_index';
 * '/blog/atlas-steward' -> 'blog_post'; anything else -> 'not_found'.
 */
export function getPageType(pathname) {
  const route = nominalRoute(pathname);
  if (route.type === "post") return "blog_post";
  if (route.type === "static") {
    return PAGE_TYPE_BY_PATH[route.path] ?? "not_found";
  }
  return route.path === PRIVACY_PATH
    ? PAGE_TYPE_BY_PATH[PRIVACY_PATH]
    : "not_found";
}

/** The language of the URL prefix: '/tr/about' -> 'tr', '/about' -> 'en'. */
export function getUiLocale(pathname) {
  return nominalRoute(pathname).locale;
}

/** The slug of a post URL ('/tr/blog/atlas-steward' -> 'atlas-steward'), else null. */
export function getPostSlug(pathname) {
  const route = nominalRoute(pathname);
  return route.type === "post" ? route.slug : null;
}

/**
 * content_language: the language the content is written in. A post carries
 * its own (`post.lang`, 'unknown' when it has none or it is not loaded); every
 * other page is written in the interface language.
 */
export function getContentLanguage(pageType, uiLocale, post) {
  if (pageType === "blog_post") {
    return LOCALES.includes(post?.lang) ? post.lang : "unknown";
  }
  return LOCALES.includes(uiLocale) ? uiLocale : "unknown";
}

/**
 * The page title of a URL, read from the one title source (getPageMeta,
 * T-03/T-07): '/about' -> 'About | Cengizhan Köse'. A post URL answers the
 * blog title (the post's own title needs the post).
 */
export function getPageTitle(pathname) {
  const route = nominalRoute(pathname);
  return getPageMeta(route, displayLocale(route, ALL_LIVE), {}, ALL_LIVE).title;
}

// Lower-case path without query, hash or a trailing slash ('/Wp-Login.php?x'
// -> '/wp-login.php').
function cleanPathname(value) {
  const text = typeof value === "string" ? value : "";
  const path = text.split(/[?#]/, 1)[0].toLowerCase();
  if (path === "") return "/";
  const rooted = path.startsWith("/") ? path : `/${path}`;
  return rooted.length > 1 ? rooted.replace(/\/+$/, "") || "/" : rooted;
}

const hasDotSegment = (path) =>
  path.split("/").some((segment) => segment.startsWith("."));
const hasExtension = (path) => /\.[a-z0-9]{1,10}$/.test(path.split("/").pop());
const isUnder = (path, prefix) =>
  path === prefix || path.startsWith(`${prefix}/`);

// Files every site is expected to serve; checked before the probe rules so
// '/.well-known/…' is not counted as a dotfile probe.
const META_PATHS = Object.freeze([
  "/robots.txt",
  "/favicon.ico",
  "/manifest.json",
  "/sitemap.xml",
]);

// Paths scanners ask for: hidden files, PHP, WordPress, admin consoles.
const PROBE_PREFIX =
  /^\/(?:wp-|wordpress|xmlrpc|cgi-bin|phpmyadmin|admin|login|graphql|actuator)/;

function isProbe(path) {
  return (
    hasDotSegment(path) || /\.php\d?$/.test(path) || PROBE_PREFIX.test(path)
  );
}

/**
 * The kind of request a path is, for request statistics (ANL-05):
 * 'page' (a known site page), 'asset', 'api', 'meta' (robots, manifest,
 * favicon, sitemap, /.well-known), 'probe' (scanner traffic) or 'other'.
 */
export function classifyPath(pathname) {
  const path = cleanPathname(pathname);
  if (META_PATHS.includes(path) || isUnder(path, "/.well-known")) return "meta";
  if (isProbe(path)) return "probe";
  if (isUnder(path, "/api")) return "api";
  if (getPageType(pathname) !== "not_found") return "page";
  if (path.startsWith("/assets/") || hasExtension(path)) return "asset";
  return "other";
}

/**
 * The coarse group of a requested path, for `not_found_viewed`
 * (requested_path_group, ANL-05): 'dotfile' | 'php' | 'wp' | 'blog' | 'api'
 * | 'other'. Never the path itself.
 */
export function pathGroup(pathname) {
  const path = cleanPathname(pathname);
  if (hasDotSegment(path)) return "dotfile";
  if (/^\/(?:wp-|wordpress)/.test(path)) return "wp";
  if (/\.php\d?$/.test(path) || path.startsWith("/xmlrpc")) return "php";
  if (isUnder(path, "/blog") || isUnder(path, "/tr/blog")) return "blog";
  if (isUnder(path, "/api")) return "api";
  return "other";
}
