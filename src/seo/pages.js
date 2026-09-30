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
// one route without touching this builder. getPageMeta() also returns the
// canonical URL (SEO-04), the Open Graph and Twitter card values (SEO-06,
// MKT-06) and the JSON-LD graph (SEO-07); socialTags() flattens og + twitter
// into the tag list that the server and usePageMeta print.
import {
  absoluteUrl,
  buildTitle,
  DEFAULT_LOCALE,
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_SIZE,
  LOCALES,
  OG_LOCALE,
  SITE_NAME,
  SITE_URL,
  TWITTER_HANDLE,
} from "./site.js";
import {
  blogPostingSchema,
  homeJsonLd,
  isoDate,
  jsonLdGraph,
} from "./jsonld.js";
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
import privacy from "./pages/privacy.js";
import post from "./pages/post.js";
import notFound from "./pages/notFound.js";
import ogImage from "./pages/ogImage.js";

// Site constants stay defined once in site.js; re-exported so callers that
// follow the plan text (`import { LOCALES } from "src/seo/pages.js"`) work.
export {
  absoluteUrl,
  AUTHOR,
  buildHomeTitle,
  buildTitle,
  DEFAULT_LOCALE,
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_SIZE,
  HERO_IMAGE,
  LOCALES,
  OG_LOCALE,
  SITE_NAME,
  SITE_URL,
  SOCIAL_PROFILES,
  TWITTER_HANDLE,
} from "./site.js";

// Language-dimensioned registry. Static keys are the language-independent
// paths from routes.js (T-12: '/about' <-> '/tr/about').
export const pages = Object.freeze({
  "/": home,
  "/about": about,
  "/portfolio": portfolio,
  "/contact": contact,
  "/blog": blog,
  "/privacy": privacy,
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

function toRoute(route, live = LIVE) {
  return typeof route === "string" ? matchRoute(route, live) : route;
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

// canonicalUrl('/about/', 'en') -> 'https://www.cengizhankose.com/about'
// canonicalUrl('/', 'en')       -> 'https://www.cengizhankose.com/'
// canonicalUrl('/', 'tr')       -> 'https://www.cengizhankose.com/tr'
// canonicalUrl('/about', 'tr')  -> 'https://www.cengizhankose.com/tr/about'
// SEO-04: absolute, www (K-03), no query or hash, no trailing slash (the EN
// root keeps its one), lower case. `path` is language-independent ('/about',
// '/blog/<slug>'), the language prefix is added here. This is the same
// normal form the server redirects every other spelling to (SEO-02), and the
// host and path of every hreflang alternate.
export function canonicalUrl(path, locale) {
  const bare = (typeof path === "string" ? path : "/").split(/[?#]/, 1)[0];
  const full = localePath(locale, bare || "/").replace(/\/+$/, "");
  return `${SITE_URL}${(full || "/").toLowerCase()}`;
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

// The fields a page that search engines must not index (404, noindex) or that
// has no data yet (a post still loading) does not get: no canonical, no Open
// Graph or Twitter tags, no JSON-LD. usePageMeta removes any such tag left by
// the previous page.
function withoutRichFields() {
  return { canonical: null, og: null, twitter: null, jsonLd: null };
}

function fromEntry(entry, lang) {
  const values = entry[lang] ?? entry[DEFAULT_LOCALE];
  return {
    title: values.title,
    description: values.description,
    robots: values.robots ?? null,
    lang,
    alternates: [],
    ...withoutRichFields(),
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

// SEO-06: og:image for the pages without a cover, in the page language.
function defaultOgImage(lang) {
  return {
    url: absoluteUrl(DEFAULT_OG_IMAGE),
    width: DEFAULT_OG_IMAGE_SIZE.width,
    height: DEFAULT_OG_IMAGE_SIZE.height,
    type: DEFAULT_OG_IMAGE_SIZE.type,
    alt: (ogImage[lang] ?? ogImage[DEFAULT_LOCALE]).alt,
  };
}

// SEO-06 step 3: the Twitter card is the same on every page.
function twitterCard() {
  return {
    card: "summary_large_image",
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
  };
}

// SEO-06 step 2. `alternates` (hreflang entries, SEO-11) gives the other
// languages of the page: og:locale:alternate exists only where a counterpart
// does. og:url is the canonical URL, the image is absolute.
function openGraph({
  type,
  title,
  description,
  canonical,
  lang,
  alternates,
  image,
  article,
}) {
  return {
    type,
    siteName: SITE_NAME,
    locale: OG_LOCALE[lang],
    localeAlternate: alternates
      .filter((entry) => entry.hreflang !== lang && OG_LOCALE[entry.hreflang])
      .map((entry) => OG_LOCALE[entry.hreflang]),
    title,
    description,
    url: canonical,
    image,
    ...(article ? { article } : {}),
  };
}

// Canonical, Open Graph, Twitter and JSON-LD of a static page. A noindex page
// (T-10 /portfolio) gets none of them: a canonical on a noindex page sends
// mixed signals, and a share card for a page kept out of the index has no use.
function staticRichFields(meta, path, lang) {
  if (isNoindex(meta.robots)) return withoutRichFields();
  const canonical = canonicalUrl(path, lang);
  return {
    canonical,
    og: openGraph({
      type: "website",
      title: meta.title,
      description: meta.description,
      canonical,
      lang,
      alternates: meta.alternates,
      image: defaultOgImage(lang),
    }),
    twitter: twitterCard(),
    // The home page (every language) carries Person + WebSite (SEO-07).
    jsonLd: path === "/" ? homeJsonLd(lang) : null,
  };
}

// Canonical, Open Graph, Twitter and BlogPosting of a loaded post, in the
// post's own language and path (SEO-04 step 2, SEO-06 step 4, SEO-07 step 3).
function postRichFields(meta, slug, post, lang, live) {
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
    return withoutRichFields();
  }
  const canonical = canonicalUrl(`/blog/${slug}`, lang);
  // The author is the About page of the post's language (the EN one until
  // the TR static pages open).
  const authorUrl = canonicalUrl("/about", staticLocale(lang, live));
  const published = isoDate(post.publishedAt) ?? isoDate(post.createdAt);
  const modified = isoDate(post.updatedAt) ?? published;
  const cover = clean(post.coverImage);
  const article = {};
  if (published) article.publishedTime = published;
  if (modified) article.modifiedTime = modified;
  article.author = authorUrl;
  return {
    canonical,
    og: openGraph({
      type: "article",
      title: meta.title,
      description: meta.description,
      canonical,
      lang,
      alternates: meta.alternates,
      image: cover
        ? { url: absoluteUrl(cover), alt: clean(post.title) }
        : defaultOgImage(lang),
      article,
    }),
    twitter: twitterCard(),
    jsonLd: jsonLdGraph([
      blogPostingSchema(post, {
        url: canonical,
        authorUrl,
        description: meta.description,
      }),
    ]),
  };
}

// socialTags(meta) -> [{ attribute, key, content }]
// The Open Graph and Twitter values of getPageMeta() as the flat, ordered list
// of <meta> tags to print (attribute 'property' for og:* and article:*, 'name'
// for twitter:*). The server (head injection) and usePageMeta both print this
// list, so the raw HTML and the rendered DOM carry the same tags. og:locale:
// alternate repeats, once per other language; an empty value is skipped.
export function socialTags(meta) {
  const tags = [];
  const add = (attribute, key, content) => {
    if (content === undefined || content === null || content === "") return;
    tags.push({ attribute, key, content: String(content) });
  };

  const og = meta?.og;
  if (og) {
    add("property", "og:type", og.type);
    add("property", "og:site_name", og.siteName);
    add("property", "og:locale", og.locale);
    for (const alternate of og.localeAlternate ?? []) {
      add("property", "og:locale:alternate", alternate);
    }
    add("property", "og:title", og.title);
    add("property", "og:description", og.description);
    add("property", "og:url", og.url);
    add("property", "og:image", og.image?.url);
    add("property", "og:image:width", og.image?.width);
    add("property", "og:image:height", og.image?.height);
    add("property", "og:image:type", og.image?.type);
    add("property", "og:image:alt", og.image?.alt);
    add("property", "article:published_time", og.article?.publishedTime);
    add("property", "article:modified_time", og.article?.modifiedTime);
    add("property", "article:author", og.article?.author);
  }

  const twitter = meta?.twitter;
  if (twitter) {
    add("name", "twitter:card", twitter.card);
    add("name", "twitter:site", twitter.site);
    add("name", "twitter:creator", twitter.creator);
  }
  return tags;
}

// getPageMeta(route, locale, data, live?)
//   -> { title, description, robots, lang, alternates,
//        canonical, og, twitter, jsonLd }
//   route:  matchRoute(pathname) output ({ type, locale, path, slug? }) or a
//           pathname string
//   locale: 'en' | 'tr' (anything else falls back to DEFAULT_LOCALE); pass
//           displayLocale(route) for 404 pages
//   data:   { post?, notFound? }
//   live:   the route table's LIVE by default; tests pass ALL_LIVE to check
//           the state after the TR pages open (hreflang, og:locale:alternate)
// Pure: no DOM access. `robots` is null when the page is indexable;
// `alternates` is alternatesFor()'s list (empty when there is no pair). A
// loaded post speaks its own language (post.lang), whatever the URL says.
// canonical, og, twitter and jsonLd are null for 404s, noindex pages and a
// post that has not loaded (the blog meta stands in for it); see
// staticRichFields() and postRichFields() for the rest.
export function getPageMeta(route, locale, data = {}, live = LIVE) {
  const match = toRoute(route, live);
  const lang = resolveLocale(locale ?? match?.locale);
  const type = match?.type;

  if (data?.notFound) {
    return fromEntry(type === "post" ? post : notFound, lang);
  }

  if (type === "static" && STATIC_PATHS.includes(match.path)) {
    const meta = {
      ...fromEntry(pages[match.path], lang),
      alternates: alternatesFor(match, data, live),
    };
    return { ...meta, ...staticRichFields(meta, match.path, lang) };
  }

  if (type === "post") {
    if (data?.post) {
      const postLang = LOCALES.includes(data.post.lang) ? data.post.lang : lang;
      const slug =
        typeof data.post.slug === "string" ? data.post.slug : match.slug;
      const meta = {
        title: postTitle(data.post),
        description: postDescription(data.post),
        robots: null,
        lang: postLang,
        alternates: alternatesFor(match, data, live),
      };
      return {
        ...meta,
        ...postRichFields(meta, slug, data.post, postLang, live),
      };
    }
    // Still loading: describe the blog rather than keep the previous page's
    // meta. Not noindex, so a slow render never de-indexes a real post.
    return fromEntry(blog, lang);
  }

  return fromEntry(notFound, lang);
}
