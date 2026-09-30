// JSON-LD producers (SEO-07, T-03): Person, WebSite and BlogPosting. Pure ESM
// with no React and no browser globals, like the rest of the head modules: the
// Bun server prints the result into the first HTML (W7) and usePageMeta
// writes the very same object client-side, so both always agree.
//
// pages.js decides which graph a page gets (getPageMeta(...).jsonLd):
//   "/" in every language   Person + WebSite
//   a published post        BlogPosting
//   everything else         none
// Only facts that are also visible on the site are printed (SEO-07 risk): a
// property without a source value is left out, never guessed.
import {
  absoluteUrl,
  AUTHOR,
  DEFAULT_OG_IMAGE,
  HERO_IMAGE,
  LOCALES,
  SITE_NAME,
  SITE_URL,
  SOCIAL_PROFILES,
} from "./site.js";

// One identity per person and per site, the same in both languages. The
// canonical URLs of the pages can change language; these ids never do.
export const PERSON_ID = `${SITE_URL}/#person`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

// SEO-07 step 3: Google shows at most 110 characters of an Article headline.
export const HEADLINE_MAX_LENGTH = 110;

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// Keeps only properties that carry a value: no undefined, null, empty string
// or empty array reaches the page.
function compact(object) {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

// ISO 8601 instant for a Date, an ISO string or epoch milliseconds; undefined
// for anything that is not a date.
export function isoDate(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// At most `max` characters, cut at a word boundary with an ellipsis.
function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// Person (SEO-07 step 1). `sameAs` is the six K-11 profiles in order; the
// facts come from AUTHOR (00-icerik-girdileri.md) unless `author` (same shape,
// for tests) replaces it. `locale` picks the job title text of the page
// language. A fact the source does not have is not printed.
export function personSchema(locale, author = AUTHOR) {
  const employers = (author.worksFor ?? []).map((employer) =>
    compact({
      "@type": "Organization",
      name: employer.name,
      url: employer.url,
    }),
  );
  return compact({
    "@type": "Person",
    "@id": PERSON_ID,
    name: author.name,
    url: `${SITE_URL}/`,
    image: absoluteUrl(HERO_IMAGE),
    jobTitle: author.jobTitles?.[locale] ?? author.jobTitle,
    worksFor: employers.length > 1 ? employers : employers[0],
    award: [...(author.awards ?? [])],
    sameAs: SOCIAL_PROFILES.map((profile) => profile.url),
  });
}

// WebSite (SEO-07 step 2). inLanguage lists both site languages (T-12).
export function websiteSchema() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    inLanguage: [...LOCALES],
    publisher: { "@id": PERSON_ID },
  };
}

// BlogPosting (SEO-07 step 3).
//   post:    the API payload ({ title, seoTitle, excerpt, coverImage, lang,
//            publishedAt, createdAt, updatedAt })
//   options: values pages.js derives from the route table, so this module does
//            not import it:
//     url         canonical URL of the post (its own language path)
//     authorUrl   the About page in the post's language
//     description postDescription(post)
// The translation relationship is left to hreflang (SEO-11): the schema only
// marks up what the page shows.
export function blogPostingSchema(post, { url, authorUrl, description } = {}) {
  const datePublished = isoDate(post?.publishedAt) ?? isoDate(post?.createdAt);
  const headline = truncate(
    clean(post?.seoTitle) || clean(post?.title),
    HEADLINE_MAX_LENGTH,
  );
  return compact({
    "@type": "BlogPosting",
    headline,
    description: clean(description),
    datePublished,
    dateModified: isoDate(post?.updatedAt) ?? datePublished,
    author: compact({
      "@type": "Person",
      "@id": PERSON_ID,
      name: AUTHOR.name,
      url: authorUrl,
    }),
    publisher: { "@id": PERSON_ID },
    mainEntityOfPage: url,
    inLanguage: LOCALES.includes(post?.lang) ? post.lang : undefined,
    image: absoluteUrl(post?.coverImage) || absoluteUrl(DEFAULT_OG_IMAGE),
  });
}

// One @graph block with the nodes of a page (SEO-07 step 4).
export function jsonLdGraph(nodes) {
  return { "@context": "https://schema.org", "@graph": nodes };
}

// The graph of the home page in `locale`: Person + WebSite.
export function homeJsonLd(locale) {
  return jsonLdGraph([personSchema(locale), websiteSchema()]);
}

// Text for <script type="application/ld+json">. `<`, `>` and `&` are escaped
// so a value can never close the script element or start a comment, and the
// two line separators that break older JavaScript parsers are escaped too. The
// result is still valid JSON with identical content.
export function serializeJsonLd(data) {
  return JSON.stringify(data).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
