// Public blog API: read-only (K-01 = A). There are no write routes and no API
// key: content is published with the CLI, never through this router, so
// POST/PUT/PATCH/DELETE on /api/posts* fall through to the JSON 404 (BE-11).
//
// The router never imports the database: createApp() (BE-09) injects the
// shared query object (T-06), so tests run without Postgres.
import { Hono } from "hono";
import type { PostQueries } from "../../db/queries/posts";
import { errorHandler, NOT_FOUND_BODY, NotFoundError } from "../errors";
import type { AppEnv } from "../types";

// T-01 envelope for a draft or a missing slug; re-exported for callers and tests.
export { NOT_FOUND_BODY };

export function createPostsRouter(queries: PostQueries) {
  const router = new Hono<AppEnv>();

  // Same envelope when the router is mounted on its own (tests, tools).
  router.onError(errorHandler);

  // GET /api/posts - published posts, newest first
  router.get("/", async (c) => c.json(await queries.listPublishedPosts()));

  // GET /api/posts/:slug - one published post with its translations (T-12)
  router.get("/:slug", async (c) => {
    const post = await queries.getPublishedPostBySlug(c.req.param("slug"));
    if (!post) throw new NotFoundError();
    return c.json(post);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Deprecated default export: the router over the process-wide database,
// resolved on first query so importing this module never loads src/db.
// Production code uses createApp(); only
// tests/server/security/write-surface.test.ts still mounts this (handoff:
// switch that test to createApp, then delete this block).
let processQueries: Promise<PostQueries> | undefined;

const loadProcessQueries = () =>
  (processQueries ??= (async () => {
    const { db } = await import("../../db");
    const { createPostQueries } = await import("../../db/queries/posts");
    return createPostQueries(db);
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
