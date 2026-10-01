// GET /sitemap.xml (SEO-05): the bilingual sitemap, built from the published
// posts on each request (the list reads come from the shared post cache, and
// the answer is cacheable for an hour at the browser and the edge).
//
// createApp() calls mountSitemap() before the site handler (src/api/app.ts), so
// the static policy's extension-miss 404 never sees the route. The URL set is
// src/seo/sitemap.ts's; this file only reads the posts and answers.
//
// A database error is a 503 with Retry-After and no cache, never an empty
// sitemap: a sitemap without the posts tells Google they were deleted.
import type { Hono } from "hono";
import { errorFields, log } from "../api/log";
import { decodeCursor, LIST_MAX_LIMIT } from "../db/post-input";
import type { PostQueries } from "../db/queries/posts";
import { buildSitemap } from "../seo/sitemap";
import { LIVE } from "../seo/routes.js";

export const SITEMAP_PATH = "/sitemap.xml";
export const SITEMAP_CONTENT_TYPE = "application/xml; charset=utf-8";
export const SITEMAP_CACHE_CONTROL = "public, max-age=3600";
const RETRY_AFTER_SECONDS = "120";
/** Safety stop for the keyset loop: 100 pages x 50 posts per language. */
const MAX_PAGES = 100;

type Queries = Pick<PostQueries, "listPublishedPosts">;
type Row = Awaited<ReturnType<Queries["listPublishedPosts"]>>[number];
type Locale = Parameters<PostQueries["getPostForLocale"]>[1];

/**
 * Every published post of the languages open for posts. The first page of a
 * language is the cached one; later pages follow the keyset cursor.
 */
export async function listAllPublishedPosts(
  queries: Queries,
  langs: readonly string[] = LIVE.post,
): Promise<Row[]> {
  const out: Row[] = [];
  for (const lang of langs) {
    const seen = new Set<number | string>();
    let cursor: ReturnType<typeof decodeCursor> = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const rows: Row[] = await queries.listPublishedPosts({
        lang: lang as Locale,
        limit: LIST_MAX_LIMIT,
        ...(cursor ? { cursor } : {}),
      });
      const fresh = rows.filter((row) => !seen.has(row.id ?? row.slug));
      for (const row of fresh) {
        seen.add(row.id ?? row.slug);
        out.push(row);
      }
      const last = rows[rows.length - 1];
      cursor = last?.cursor ? decodeCursor(last.cursor) : null;
      if (rows.length < LIST_MAX_LIMIT || fresh.length === 0 || !cursor) break;
    }
  }
  return out;
}

/** The sitemap document for what the database holds now. */
export async function renderSitemap(queries: Queries): Promise<string> {
  return buildSitemap(undefined, await listAllPublishedPosts(queries), LIVE);
}

export interface MountSitemapOptions {
  queries: Queries;
}

/** GET /sitemap.xml (HEAD too): 200 `application/xml`, or 503 when the posts cannot be read. */
export function mountSitemap(
  app: Hono<any, any, any>,
  { queries }: MountSitemapOptions,
): void {
  app.get(SITEMAP_PATH, async (c) => {
    try {
      return c.body(await renderSitemap(queries), 200, {
        "Content-Type": SITEMAP_CONTENT_TYPE,
        "Cache-Control": SITEMAP_CACHE_CONTROL,
      });
    } catch (error) {
      log("error", "sitemap failed", {
        reqId: c.get("requestId"),
        path: SITEMAP_PATH,
        ...errorFields(error),
      });
      return c.text("The sitemap is unavailable right now.", 503, {
        "Retry-After": RETRY_AFTER_SECONDS,
        "Cache-Control": "no-store",
      });
    }
  });
}
