// Public blog API: read-only (K-01 = A). There are no write routes and no API
// key: content is published with the CLI, never through this router, so
// POST/PUT/PATCH/DELETE on /api/posts* fall through to the JSON 404 (BE-11).
// The only inputs are the path slug and the list query string (BE-05, SEC-07).
//
// The router never imports the database: createApp() (BE-09) injects the
// shared query object (T-06; in production its cached wrapper, BE-06) built
// on the read-only client `dbRead` (src/db/index.ts, SEC-14: the reader role
// can only SELECT), so tests run without Postgres.
//
//   GET /api/posts?limit=&cursor=&lang=&missingIn=   (BE-07 / PERF-15)
//     200 JSON array of card fields (never content), newest first; the next
//         page's cursor in X-Next-Cursor (absent on the last page).
//     400 BAD_PARAM (lang / missingIn, with issues) | BAD_CURSOR.
//   GET /api/posts/:slug
//     200 the post with its translations (T-12); 404 NOT_FOUND for a draft,
//     an unknown slug or a slug outside PostSlug (no query at all then).
//
// Cache-Control (BE-06 / PERF-06): 200s are public with s-maxage for the
// Cloudflare Cache Rule; every error (400/404/429/500) is no-store through
// errorHandler, so the edge never keeps a 404, a draft or a rate-limit answer.
import { Hono } from "hono";
import { validator } from "hono/validator";
import {
  encodeCursor,
  isPostSlug,
  ListQuery,
  toIssues,
} from "../../db/post-input";
import {
  CARD_FIELDS,
  type ListedPost,
  type PostCard,
  type PostQueries,
} from "../../db/queries/posts";
import {
  BadRequestError,
  errorHandler,
  NOT_FOUND_BODY,
  NotFoundError,
} from "../errors";
import type { AppEnv } from "../types";

// T-01 envelope for a draft or a missing slug; re-exported for callers and tests.
export { NOT_FOUND_BODY };

/** Successful reads: browser 60 s, edge 5 min, then served stale while revalidating for up to a day. */
export const PUBLIC_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";

export const NEXT_CURSOR_HEADER = "X-Next-Cursor";

// 400 BAD_PARAM for lang / missingIn (with issues), else BAD_CURSOR (T-01, BE-10).
const listQuery = validator("query", (value) => {
  const parsed = ListQuery.safeParse(value);
  if (parsed.success) return parsed.data;
  const issues = toIssues(parsed.error);
  const params = issues.filter((issue) => issue.path !== "cursor");
  if (params.length > 0) {
    throw new BadRequestError("BAD_PARAM", "Invalid query parameter", params);
  }
  throw new BadRequestError("BAD_CURSOR", "Invalid cursor");
});

/** Exactly the card fields, whatever the query object returned (PERF-15: never content). */
export function toCard(post: ListedPost): PostCard {
  const card = {} as Record<keyof PostCard, unknown>;
  for (const field of CARD_FIELDS) card[field] = post[field] ?? null;
  return card as PostCard;
}

// The keyset position after `post`: the query's own cursor, or one built
// from createdAt for a query object that does not provide it (test fakes).
const cursorAfter = (post: ListedPost): string =>
  post.cursor ??
  encodeCursor({ t: new Date(post.createdAt).toISOString(), id: post.id });

export function createPostsRouter(queries: PostQueries) {
  const router = new Hono<AppEnv>();

  // Same envelope when the router is mounted on its own (tests, tools).
  router.onError(errorHandler);

  // GET /api/posts - one page of published cards, newest first
  router.get("/", listQuery, async (c) => {
    const { limit, cursor, lang, missingIn } = c.req.valid("query");
    // One look-ahead row tells whether another page exists.
    const rows = await queries.listPublishedPosts({
      limit: limit + 1,
      cursor,
      lang,
      missingIn,
    });
    const page = rows.slice(0, limit);
    const headers: Record<string, string> = {
      "Cache-Control": PUBLIC_CACHE_CONTROL,
    };
    if (rows.length > limit && page.length > 0) {
      headers[NEXT_CURSOR_HEADER] = cursorAfter(page[page.length - 1]);
    }
    return c.json(page.map(toCard), 200, headers);
  });

  // GET /api/posts/:slug - one published post with its translations (T-12)
  router.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    // Browser and bot junk never reaches the database (BE-05, SEC-07).
    if (!isPostSlug(slug)) throw new NotFoundError();
    const post = await queries.getPublishedPostBySlug(slug);
    if (!post) throw new NotFoundError();
    return c.json(post, 200, { "Cache-Control": PUBLIC_CACHE_CONTROL });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Deprecated default export: the router over the process-wide read-only
// database (dbRead, SEC-14), resolved on first query so importing this module
// never loads src/db. Production code uses createApp(); only
// tests/server/security/write-surface.test.ts still mounts this (handoff:
// switch that test to createApp, then delete this block).
let processQueries: Promise<PostQueries> | undefined;

const loadProcessQueries = () =>
  (processQueries ??= (async () => {
    const { dbRead } = await import("../../db");
    const { createPostQueries } = await import("../../db/queries/posts");
    return createPostQueries(dbRead);
  })());

const lazyProcessQueries = new Proxy({} as PostQueries, {
  get:
    (_target, name) =>
    async (...args: unknown[]) => {
      const queries = await loadProcessQueries();
      const method = queries[name as keyof PostQueries] as (
        ...a: unknown[]
      ) => unknown;
      return method(...args);
    },
});

/** @deprecated Mount `createApp({ queries })` instead. */
export default createPostsRouter(lazyProcessQueries);
