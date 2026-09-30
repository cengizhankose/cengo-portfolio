// Single source of page metadata (T-03, T-07, T-12).
//
// Pure ESM with no React and no browser globals: the Bun server (404 shell
// now, head injection with SEO-01) and the Vite client (usePageMeta) import
// this file, so both print the same title, description, robots, lang and
// hreflang alternates. Rendering modules (usePageMeta.js, src/server/static.ts,
// later head.ts / snapshot.ts / sitemap.ts) hold no metadata values of their
// own; they only print getPageMeta()'s output.
//
// Per-route values live in src/seo/pages/<route>.js as
// { en: { title, description, robots? }, tr: { ... } } so later waves can edit
// one route without touching this builder. canonical (SEO-04), og (SEO-06)
// and jsonLd (SEO-07) are added here by later packages.
import {
  buildTitle,
  DEFAULT_LOCALE,
  LOCALES,
  SITE_NAME,
  SITE_URL,
} from "./site.js";
import {
  LIVE,
  LOCALE_PREFIX,
  matchRoute,
  SLUG_PATTERN,
  STATIC_PATHS,
} from "./routes.js";
import home from "./pages/home.js";
import about from "./pages/about.js";
import portfolio from "./pages/portfolio.js";
import contact from "./pages/contact.js";
import blog from "./pages/blog.js";
import post from "./pages/post.js";
import notFound from "./pages/notFound.js";

// Site constants stay defined once in site.js; re-exported so callers that
// follow the plan text (`import { LOCALES } from "src/seo/pages.js"`) work.
export {
  AUTHOR,
  buildHomeTitle,
  buildTitle,
  DEFAULT_LOCALE,
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_SIZE,
  LOCALES,
  SITE_NAME,
  SITE_URL,
  SOCIAL_PROFILES,
} from "./site.js";

// Language-dimensioned registry. Static keys are the language-independent
// paths from routes.js (T-12: '/about' <-> '/tr/about').
export const pages = Object.freeze({
  "/": home,
  "/about": about,
  "/portfolio": portfolio,
  "/contact": contact,
  "/blog": blog,
  notFound,
  postNotFound: post,
});

// SEO-10: longer titles are cut off in search results. Every static title
// stays within it (tests/server/seo/meta.test.ts).
export const TITLE_MAX_LENGTH = 60;

// SEO-10: room left for a post's own words once " | Cengizhan Köse" is added
// (60 - 17 = 43). A post whose title is longer needs a seoTitle of at most
// this length; the publish CLI (BE-16) checks it before writing.
export const POST_TOPIC_MAX_LENGTH =
  TITLE_MAX_LENGTH - ` | ${SITE_NAME}`.length;

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function resolveLocale(locale) {
  return LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}

function toRoute(route) {
  return typeof route === "string" ? matchRoute(route) : route;
}

function isNoindex(robots) {
  return typeof robots === "string" && /\bnoindex\b/i.test(robots);
}

// localePath('tr', '/about') -> '/tr/about'; localePath('tr', '/') -> '/tr';
// localePath('en', '/about') -> '/about' (T-12: EN has no prefix).
export function localePath(locale, path = "/") {
  const prefix = LOCALE_PREFIX[resolveLocale(locale)] ?? "";
  const target =
    typeof path === "string" && path.startsWith("/") ? path : `/${path ?? ""}`;
  if (!prefix) return target;
  return target === "/" ? prefix : `${prefix}${target}`;
}

// The language static pages are served in for `locale`: itself once its
// static pages are live (LIVE.static), DEFAULT_LOCALE until then. Links to
// static pages (home, blog list, back links) use it, so nothing points at a
// page that is still a 404 (SEO-11 step 4). `live` defaults to the route
// table's LIVE; tests pass ALL_LIVE to check the state after a language opens.
export function staticLocale(locale, live = LIVE) {
  const lang = resolveLocale(locale);
  return live.static.includes(lang) ? lang : DEFAULT_LOCALE;
}

// The language a route is rendered in. A matched route is live in its own
// language. A path that matches nothing (or a page whose language is not open
// yet) is shown in the language of its prefix once that language's static
// pages are live, in DEFAULT_LOCALE until then (SEO-02 step 4: the 404 shell
// is EN until SEO-11 Adım B).
export function displayLocale(route, live = LIVE) {
  const match = typeof route === "string" ? matchRoute(route, live) : route;
  if (!match) return DEFAULT_LOCALE;
  if (match.type === "notfound") return staticLocale(match.locale, live);
  return resolveLocale(match.locale);
}

// The one canonical pathname of a matched route (no trailing slash, lower
// case, language prefix), or null for 'notfound'. The server redirects every
// other spelling of a known route here (SEO-02 step 3d).
export function routePathname(route) {
  const match = toRoute(route);
  if (match?.type === "static") return localePath(match.locale, match.path);
  if (match?.type === "post") {
    return localePath(match.locale, `/blog/${match.slug}`);
  }
  return null;
}

function alternatesFrom(versions) {
  // One entry per language, in LOCALES order, so both pages of a pair print
  // the same set (hreflang must be reciprocal and include the page itself).
  const byLang = new Map();
  for (const version of versions) {
    if (!byLang.has(version.lang)) byLang.set(version.lang, version.path);
  }
  const list = LOCALES.filter((lang) => byLang.has(lang)).map((lang) => ({
    hreflang: lang,
    href: `${SITE_URL}${byLang.get(lang)}`,
  }));
  if (list.length < 2) return [];
  const fallback = list.find((entry) => entry.hreflang === DEFAULT_LOCALE);
  if (fallback) list.push({ hreflang: "x-default", href: fallback.href });
  return list;
}

// alternatesFor(route, data) -> [{ hreflang, href }] (SEO-11, T-12)
// hreflang only where the page exists in more than one live language:
//   static page: every language in LIVE.static, unless the page is noindex
//                (T-10 portfolio) - so none until the TR pages open;
//   post:        the post plus its published translations (same
//                translation_key) in languages open for posts;
//   anything else (404s, a post that is loading or missing): none.
// Entries: en, tr, then x-default = the EN URL. Absolute www URLs (K-03).
export function alternatesFor(route, data = {}, live = LIVE) {
  const match = typeof route === "string" ? matchRoute(route, live) : route;
  if (!match || data?.notFound) return [];

  if (match.type === "static" && STATIC_PATHS.includes(match.path)) {
    const entry = pages[match.path];
    const langs = LOCALES.filter((lang) => live.static.includes(lang));
    if (langs.some((lang) => isNoindex(entry[lang]?.robots))) return [];
    return alternatesFrom(
      langs.map((lang) => ({ lang, path: localePath(lang, match.path) })),
    );
  }

  if (match.type === "post" && data?.post) {
    const own = {
      lang: data.post.lang,
      slug: data.post.slug ?? match.slug,
    };
    const translations = Array.isArray(data.post.translations)
      ? data.post.translations
      : [];
    const versions = [own, ...translations]
      .filter(
        (version) =>
          LOCALES.includes(version?.lang) &&
          live.post.includes(version.lang) &&
          typeof version.slug === "string" &&
          SLUG_PATTERN.test(version.slug),
      )
      .map((version) => ({
        lang: version.lang,
        path: localePath(version.lang, `/blog/${version.slug}`),
      }));
    return alternatesFrom(versions);
  }

  return [];
}

function fromEntry(entry, lang) {
  const values = entry[lang] ?? entry[DEFAULT_LOCALE];
  return {
    title: values.title,
    description: values.description,
    robots: values.robots ?? null,
    lang,
    alternates: [],
  };
}

// DSG-33 / MKT-21 / T-07 / SEO-10: "<seoTitle ?? title> | Cengizhan Köse" in
// the post's own language. The suffix is never dropped (T-07 wins over the
// SEO-10 step 4 fallback); a post keeps within TITLE_MAX_LENGTH through its
// seoTitle (at most POST_TOPIC_MAX_LENGTH characters).
export function postTitle(postData) {
  return buildTitle(clean(postData?.seoTitle) || clean(postData?.title));
}

// SEO-09 / MKT-21: the post's excerpt, or its title when there is none.
export function postDescription(postData) {
  return clean(postData?.excerpt) || clean(postData?.title);
}

// getPageMeta(route, locale, data)
//   -> { title, description, robots, lang, alternates }
//   route:  matchRoute(pathname) output ({ type, locale, path, slug? }) or a
//           pathname string
//   locale: 'en' | 'tr' (anything else falls back to DEFAULT_LOCALE); pass
//           displayLocale(route) for 404 pages
//   data:   { post?, notFound? }
// Pure: no DOM access. `robots` is null when the page is indexable;
// `alternates` is alternatesFor()'s list (empty when there is no pair). A
// loaded post speaks its own language (post.lang), whatever the URL says.
export function getPageMeta(route, locale, data = {}) {
  const match = toRoute(route);
  const lang = resolveLocale(locale ?? match?.locale);
  const type = match?.type;

  if (data?.notFound) {
    return fromEntry(type === "post" ? post : notFound, lang);
  }

  if (type === "static" && STATIC_PATHS.includes(match.path)) {
    return {
      ...fromEntry(pages[match.path], lang),
      alternates: alternatesFor(match, data),
    };
  }

  if (type === "post") {
    if (data?.post) {
      return {
        title: postTitle(data.post),
        description: postDescription(data.post),
        robots: null,
        lang: LOCALES.includes(data.post.lang) ? data.post.lang : lang,
        alternates: alternatesFor(match, data),
      };
    }
    // Still loading: describe the blog rather than keep the previous page's
    // meta. Not noindex, so a slow render never de-indexes a real post.
    return fromEntry(blog, lang);
  }

  return fromEntry(notFound, lang);
}
