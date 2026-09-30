// Single source of page metadata (T-03, T-07, T-12).
//
// Pure ESM with no React and no browser globals: the Bun server (head
// injection, SEO-01) and the Vite client (usePageMeta) import this file, so
// both print the same title, description, robots and lang. Rendering modules
// (usePageMeta.js, later head.ts / snapshot.ts / sitemap.ts) hold no metadata
// values of their own; they only print getPageMeta()'s output.
//
// Per-route values live in src/seo/pages/<route>.js as
// { en: { title, description, robots? }, tr: { ... } } so later waves can edit
// one route without touching this builder. canonical (SEO-04), og (SEO-06),
// jsonLd (SEO-07) and alternates (SEO-11) are added here by later packages.
import { buildTitle, DEFAULT_LOCALE, LOCALES } from "./site.js";
import { matchRoute, STATIC_PATHS } from "./routes.js";
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

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function resolveLocale(locale) {
  return LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}

function fromEntry(entry, lang) {
  const values = entry[lang] ?? entry[DEFAULT_LOCALE];
  return {
    title: values.title,
    description: values.description,
    robots: values.robots ?? null,
    lang,
  };
}

// DSG-33 / MKT-21 / T-07: "<seoTitle ?? title> | Cengizhan Köse" in the
// post's own language. Keeping titles within TITLE_MAX_LENGTH is the job of
// the post's seoTitle (SEO-10, W3); the suffix is never dropped here.
export function postTitle(postData) {
  return buildTitle(clean(postData?.seoTitle) || clean(postData?.title));
}

// SEO-09 / MKT-21: the post's excerpt, or its title when there is none.
export function postDescription(postData) {
  return clean(postData?.excerpt) || clean(postData?.title);
}

// getPageMeta(route, locale, data) -> { title, description, robots, lang }
//   route:  matchRoute(pathname) output ({ type, locale, path, slug? }) or a
//           pathname string
//   locale: 'en' | 'tr' (anything else falls back to DEFAULT_LOCALE)
//   data:   { post?, notFound? }
// Pure: no DOM access. `robots` is null when the page is indexable.
export function getPageMeta(route, locale, data = {}) {
  const match = typeof route === "string" ? matchRoute(route) : route;
  const lang = resolveLocale(locale ?? match?.locale);
  const type = match?.type;

  if (data?.notFound) {
    return fromEntry(type === "post" ? post : notFound, lang);
  }

  if (type === "static" && STATIC_PATHS.includes(match.path)) {
    return fromEntry(pages[match.path], lang);
  }

  if (type === "post") {
    if (data?.post) {
      return {
        title: postTitle(data.post),
        description: postDescription(data.post),
        robots: null,
        lang,
      };
    }
    // Still loading: describe the blog rather than keep the previous page's
    // meta. Not noindex, so a slow render never de-indexes a real post.
    return fromEntry(blog, lang);
  }

  return fromEntry(notFound, lang);
}
