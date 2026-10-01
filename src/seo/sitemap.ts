// The bilingual XML sitemap (SEO-05, T-12): one file, both languages.
//
// buildSitemap(pages, posts, live) is pure: it reads no request, database or
// clock. Every URL comes from the same functions the page head uses, so the
// sitemap and the <link rel="canonical"> / hreflang tags cannot disagree:
//   - static pages: STATIC_PATHS (src/seo/routes.js) x the languages in
//     live.static, so the TR pages (SEO-11 Adım B) and /privacy enter the
//     sitemap when the route table opens them, with no edit here. A page whose
//     registry entry says `noindex` in a language is left out of that language
//     (T-10: Portfolio while it has no case to show);
//   - posts: one URL per published post in a language open for posts
//     (live.post), at the post's own language path, with <lastmod>;
//   - every URL that has a version in another language lists all versions,
//     itself included, plus x-default (= the EN URL), as xhtml:link
//     alternates: alternatesFor(), the function behind the head's hreflang.
//     A URL with no other language version has no alternates.
// No changefreq and no priority: Google ignores them.
import {
  alternatesFor,
  canonicalUrl,
  localePath,
  pages as pageRegistry,
} from "./pages.js";
import { LIVE, SLUG_PATTERN, STATIC_PATHS } from "./routes.js";
import { LOCALES } from "./site.js";
import {
  groupPostsForLocale,
  mergePostLists,
  postLanguage,
} from "../lib/postGroups.js";

/** Sitemaps.org limit per file; the site is far below it. */
export const SITEMAP_MAX_URLS = 50_000;

/** A published post as listPublishedPosts() returns it (card fields; loose on purpose). */
type Row = Record<string, any>;
type Live = { static: readonly string[]; post: readonly string[] };
type Alternate = { hreflang: string; href: string };
interface Entry {
  loc: string;
  lastmod: Date | null;
  alternates: Alternate[];
}

// Characters XML 1.0 cannot carry, dropped before escaping.
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(XML_ILLEGAL, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const toDate = (value: unknown): Date | null => {
  if (value === undefined || value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** When a post last changed: updatedAt, else publishedAt, else createdAt. */
export const postLastModified = (post: Row): Date | null =>
  toDate(post.updatedAt) ?? toDate(post.publishedAt) ?? toDate(post.createdAt);

const newest = (dates: (Date | null)[]): Date | null =>
  dates.reduce<Date | null>(
    (latest, date) => (date && (!latest || date > latest) ? date : latest),
    null,
  );

const isNoindex = (robots: unknown): boolean =>
  typeof robots === "string" && /\bnoindex\b/i.test(robots);

function staticEntries(
  pages: Record<string, any>,
  posts: Row[],
  live: Live,
): Entry[] {
  const entries: Entry[] = [];
  for (const path of STATIC_PATHS) {
    for (const locale of LOCALES) {
      if (!live.static.includes(locale)) continue;
      const meta = pages[path]?.[locale];
      if (!meta || isNoindex(meta.robots)) continue;
      // The blog list changes when a post it lists does: the newest of the
      // posts that page shows (its own language, then the untranslated rest).
      let lastmod: Date | null = null;
      if (path === "/blog") {
        const { own, other } = groupPostsForLocale(posts, locale);
        lastmod = newest([...own, ...other].map(postLastModified));
      }
      entries.push({
        loc: canonicalUrl(path, locale),
        lastmod,
        alternates: alternatesFor(localePath(locale, path), {}, live),
      });
    }
  }
  return entries;
}

function postEntries(posts: Row[], live: Live): Entry[] {
  // Published translations share a translationKey (T-12).
  const byKey = new Map<string, Row[]>();
  for (const post of posts) {
    if (!post.translationKey) continue;
    const group = byKey.get(post.translationKey) ?? [];
    group.push(post);
    byKey.set(post.translationKey, group);
  }
  return posts.map((post) => {
    const lang = postLanguage(post);
    const translations = (byKey.get(post.translationKey) ?? [])
      .filter((other) => other !== post && postLanguage(other) !== lang)
      .map((other) => ({ lang: postLanguage(other), slug: other.slug }));
    return {
      loc: canonicalUrl(`/blog/${post.slug}`, lang),
      lastmod: postLastModified(post),
      alternates: alternatesFor(
        localePath(lang, `/blog/${post.slug}`),
        { post: { lang, slug: post.slug, translations } },
        live,
      ),
    };
  });
}

function entryXml({ loc, lastmod, alternates }: Entry): string {
  const lines = [`    <loc>${xmlEscape(loc)}</loc>`];
  if (lastmod) lines.push(`    <lastmod>${lastmod.toISOString()}</lastmod>`);
  for (const { hreflang, href } of alternates) {
    lines.push(
      `    <xhtml:link rel="alternate" hreflang="${xmlEscape(hreflang)}" href="${xmlEscape(href)}"/>`,
    );
  }
  return `  <url>\n${lines.join("\n")}\n  </url>`;
}

/**
 * The sitemap document.
 * @param pages  page registry (`pages` of src/seo/pages.js): only `robots` is read
 * @param posts  published posts (card rows; drafts must already be left out)
 * @param live   route table's language openness (LIVE)
 */
export function buildSitemap(
  pages: Record<string, any> = pageRegistry,
  posts: Row[] = [],
  live: Live = LIVE,
): string {
  const usable = mergePostLists([posts]).filter(
    (post) =>
      post &&
      typeof post.slug === "string" &&
      SLUG_PATTERN.test(post.slug) &&
      live.post.includes(postLanguage(post)),
  );
  const entries = [
    ...staticEntries(pages, usable, live),
    ...postEntries(usable, live),
  ].slice(0, SITEMAP_MAX_URLS);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries.map(entryXml),
    "</urlset>",
    "",
  ].join("\n");
}
