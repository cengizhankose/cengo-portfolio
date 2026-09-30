// The blog's RSS 2.0 feeds (MKT-07): /rss.xml (EN) and /tr/rss.xml (TR).
//
// Each feed lists what that language's /blog lists, in the same order (T-12):
// the language's own posts first, then the other language's posts that have no
// translation among them. The lists are the ones the /blog snapshot reads
// (blogIndexLists + listPublishedPosts), grouped by groupPostsForLocale, so a
// draft never appears and the feed and the page cannot disagree. At most
// FEED_ITEM_LIMIT items.
//
// What a feed says comes from the page registry, not from text written here:
// the channel title and description are the /blog page's (getPageMeta), every
// link is canonicalUrl() (www, the post's own language path), so no value is
// read from the request. Text is XML-escaped; characters XML 1.0 cannot carry
// are dropped.
//
// A feed is a file, not a page: it is served for every language whatever
// LIVE.static says (the TR static pages may still be closed), and is not part
// of the route table (src/seo/routes.js). mountFeeds() registers the two
// routes; createApp() calls it before the site handler (src/api/app.ts).
import type { Hono } from "hono";
import { errorFields, log } from "../api/log";
import { LIST_DEFAULT_LIMIT } from "../db/post-input";
import type { PostQueries } from "../db/queries/posts";
import { blogIndexLists } from "../lib/swrFallback.js";
import {
  groupPostsForLocale,
  mergePostLists,
  postLanguage,
} from "../lib/postGroups.js";
import {
  canonicalUrl,
  getPageMeta,
  localePath,
  staticLocale,
} from "../seo/pages.js";
import { FEED_PATH } from "../seo/pages/post.js";
import { LOCALES } from "../seo/site.js";

export const FEED_ITEM_LIMIT = 20;

export const FEED_CONTENT_TYPE = "application/rss+xml; charset=utf-8";
/** 15 minutes at the browser and at the edge (the post cache behind it is 60 s). */
export const FEED_CACHE_CONTROL = "public, max-age=900";
const RETRY_AFTER_SECONDS = "120";

/** A post as listPublishedPosts() returns it (card fields; loose on purpose). */
type Row = Record<string, any>;
type Locale = Parameters<PostQueries["getPostForLocale"]>[1];

// XML 1.0 forbids most control characters; lone surrogates are not valid text.
const XML_ILLEGAL = new RegExp(
  [
    "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]",
    "[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])",
    "(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]",
  ].join("|"),
  "g",
);

/** Text for an XML element or a double-quoted attribute value. */
export function xmlEscape(value: unknown): string {
  const text = String(value ?? "").replace(XML_ILLEGAL, "");
  return text
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

/** The day a post counts as published: publishedAt, else createdAt (BE-07). */
const publishedOf = (post: Row): Date | null =>
  toDate(post.publishedAt) ?? toDate(post.createdAt);

/** The posts one language's feed lists, in /blog order, capped at the item limit. */
export function feedPosts(lists: Row[][], locale: string): Row[] {
  const { own, other } = groupPostsForLocale(mergePostLists(lists), locale);
  return [...own, ...other].slice(0, FEED_ITEM_LIMIT);
}

function itemXml(post: Row, locale: string): string {
  const lang = postLanguage(post);
  const link = canonicalUrl(`/blog/${post.slug}`, lang);
  const published = publishedOf(post);
  const parts = [
    `<title>${xmlEscape(post.title)}</title>`,
    `<link>${xmlEscape(link)}</link>`,
    `<guid isPermaLink="true">${xmlEscape(link)}</guid>`,
  ];
  if (published) parts.push(`<pubDate>${published.toUTCString()}</pubDate>`);
  if (typeof post.excerpt === "string" && post.excerpt.trim() !== "") {
    parts.push(`<description>${xmlEscape(post.excerpt)}</description>`);
  }
  // A post in the other language than the channel says so (T-12 grouping).
  if (lang !== locale) parts.push(`<dc:language>${lang}</dc:language>`);
  return `<item>${parts.join("")}</item>`;
}

/**
 * The RSS 2.0 document of `locale` for these lists of posts (the two lists of
 * blogIndexLists(locale), in that order). `now` is only the lastBuildDate of a
 * feed with no posts; otherwise it is the newest change among the items.
 */
export function buildRss(
  locale: string,
  lists: Row[][],
  now: Date = new Date(),
): string {
  const lang = LOCALES.includes(locale) ? locale : "en";
  const posts = feedPosts(lists, lang);
  const meta = getPageMeta("/blog", lang);
  const newest = posts
    .flatMap((post) => [
      toDate(post.updatedAt),
      toDate(post.publishedAt),
      toDate(post.createdAt),
    ])
    .filter((date): date is Date => date !== null)
    .reduce<Date | null>(
      (latest, date) => (latest && latest > date ? latest : date),
      null,
    );
  const channel = [
    `<title>${xmlEscape(meta.title)}</title>`,
    // The /blog page of the feed's language, or the EN one while that
    // language's static pages are closed (nothing points at a 404).
    `<link>${xmlEscape(canonicalUrl("/blog", staticLocale(lang)))}</link>`,
    `<description>${xmlEscape(meta.description)}</description>`,
    `<language>${lang}</language>`,
    `<lastBuildDate>${(newest ?? now).toUTCString()}</lastBuildDate>`,
    `<atom:link href="${xmlEscape(canonicalUrl(FEED_PATH, lang))}" rel="self" type="application/rss+xml"/>`,
    ...posts.map((post) => itemXml(post, lang)),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `<channel>${channel.join("")}</channel>`,
    "</rss>",
    "",
  ].join("\n");
}

/** The feed of `locale`, read from the database (the same lists as /blog). */
export async function renderRss(
  locale: string,
  queries: Pick<PostQueries, "listPublishedPosts">,
  now: Date = new Date(),
): Promise<string> {
  const lists = await Promise.all(
    blogIndexLists(locale).map((entry) =>
      queries.listPublishedPosts({
        lang: entry.lang as Locale,
        missingIn: (entry as { missingIn?: Locale }).missingIn,
        limit: LIST_DEFAULT_LIMIT,
      }),
    ),
  );
  return buildRss(locale, lists, now);
}

export interface MountFeedsOptions {
  queries: Pick<PostQueries, "listPublishedPosts">;
  /** Clock (tests pass a fake one). */
  now?: () => Date;
}

/**
 * GET /rss.xml and GET /tr/rss.xml (HEAD too): 200 `application/rss+xml`,
 * cacheable for 15 minutes; a database error is a 503 with Retry-After and no
 * cache, never an empty feed a reader would take for "no posts".
 */
export function mountFeeds(
  app: Hono<any, any, any>,
  { queries, now = () => new Date() }: MountFeedsOptions,
): void {
  for (const locale of LOCALES) {
    const path = localePath(locale, FEED_PATH);
    app.get(path, async (c) => {
      try {
        const body = await renderRss(locale, queries, now());
        return c.body(body, 200, {
          "Content-Type": FEED_CONTENT_TYPE,
          "Cache-Control": FEED_CACHE_CONTROL,
        });
      } catch (error) {
        log("error", "rss feed failed", {
          reqId: c.get("requestId"),
          path,
          ...errorFields(error),
        });
        return c.text("The feed is unavailable right now.", 503, {
          "Retry-After": RETRY_AFTER_SECONDS,
          "Cache-Control": "no-store",
        });
      }
    });
  }
}
