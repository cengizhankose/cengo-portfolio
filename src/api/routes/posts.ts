// Public blog API: read-only (K-01 = A). There are no write routes and no API
// key: content is published with the CLI, never through this router, so
// POST/PUT/PATCH/DELETE on /api/posts* fall through to 404.
import { Hono } from "hono";
import { db } from "../../db";
import { createPostQueries, type PostQueries } from "../../db/queries/posts";

// T-01 error envelope. A draft and a missing slug get this exact body, so the
// response never reveals that an unpublished post exists (SEC-08).
export const NOT_FOUND_BODY = {
  error: "Not found",
  code: "NOT_FOUND",
} as const;

export function createPostsRouter(queries: PostQueries) {
  const app = new Hono();

  // GET /api/posts - published posts, newest first
  app.get("/", async (c) => {
    try {
      return c.json(await queries.listPublishedPosts());
    } catch (error) {
      console.error("Error fetching posts:", error);
      return c.json({ error: "Failed to fetch posts" }, 500);
    }
  });

  // GET /api/posts/:slug - a single published post
  app.get("/:slug", async (c) => {
    try {
      const post = await queries.getPublishedPostBySlug(c.req.param("slug"));
      if (!post) return c.json(NOT_FOUND_BODY, 404);
      return c.json(post);
    } catch (error) {
      console.error("Error fetching post:", error);
      return c.json({ error: "Failed to fetch post" }, 500);
    }
  });

  return app;
}

export default createPostsRouter(createPostQueries(db));
