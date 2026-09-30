// BE-04 / SEC-06: dev seed is idempotent, contains the hidden draft, and the
// optional live import only accepts well-formed public data.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { posts } from "../../../src/db/schema";
import { createPostQueries } from "../../../src/db/queries/posts";
import {
  DEV_SEED_POSTS,
  DRAFT_SLUG,
  LIVE_POSTS_URL,
  fetchLivePosts,
  parseLivePosts,
  seedDevPosts,
} from "../../../scripts/seed-dev";
import { createTestDb } from "./pglite";

describe("seedDevPosts (PGlite)", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  test("first run inserts 3 published posts and 1 draft", async () => {
    expect(await seedDevPosts(ctx.db)).toBe(4);
    const rows = await ctx.db.select().from(posts);
    expect(rows.filter((r) => r.published).length).toBe(3);
    expect(rows.find((r) => r.slug === DRAFT_SLUG)?.published).toBe(false);
  });

  test("second run is a no-op (ON CONFLICT DO NOTHING) and keeps edited rows", async () => {
    const { eq } = await import("drizzle-orm");
    await ctx.db
      .update(posts)
      .set({ title: "edited locally" })
      .where(eq(posts.slug, DEV_SEED_POSTS[0].slug));
    expect(await seedDevPosts(ctx.db)).toBe(0);
    const rows = await ctx.db.select().from(posts);
    expect(rows.length).toBe(4);
    expect(rows.find((r) => r.slug === DEV_SEED_POSTS[0].slug)?.title).toBe(
      "edited locally",
    );
  });

  test("the public API view of the seed hides the draft", async () => {
    const queries = createPostQueries(ctx.db);
    expect(await queries.getPublishedPostBySlug(DRAFT_SLUG)).toBeNull();
    const list = await queries.listPublishedPosts();
    expect(list.length).toBe(3);
    expect(list.map((p) => p.slug)).not.toContain(DRAFT_SLUG);
  });

  test("an empty batch inserts nothing", async () => {
    expect(await seedDevPosts(ctx.db, [])).toBe(0);
  });
});

describe("live import (public API, no credentials)", () => {
  const sample = [
    {
      id: 7,
      slug: "a-live-post",
      title: "A live post",
      content: "body",
      excerpt: null,
      coverImage: null,
      published: true,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-02T10:00:00.000Z",
    },
  ];

  test("maps public rows to published inserts without ids", () => {
    const [row] = parseLivePosts(sample);
    expect(row).toEqual({
      slug: "a-live-post",
      title: "A live post",
      content: "body",
      excerpt: null,
      coverImage: null,
      published: true,
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
      updatedAt: new Date("2026-09-02T10:00:00.000Z"),
    });
    expect(row).not.toHaveProperty("id");
  });

  test.each([
    ["not an array", { posts: [] }],
    ["bad slug", [{ ...sample[0], slug: "../../etc" }]],
    ["missing title", [{ ...sample[0], title: "" }]],
    ["non-string content", [{ ...sample[0], content: 42 }]],
    ["non-string excerpt", [{ ...sample[0], excerpt: {} }]],
  ])("rejects %s", (_label, data) => {
    expect(() => parseLivePosts(data)).toThrow();
  });

  test("fetchLivePosts reads only the fixed public URL", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify(sample), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const rows = await fetchLivePosts(fakeFetch);
    expect(calls).toEqual([LIVE_POSTS_URL]);
    expect(rows.map((r) => r.slug)).toEqual(["a-live-post"]);
  });

  test("fetchLivePosts fails on a non-2xx response", async () => {
    const fakeFetch = (async () =>
      new Response("nope", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchLivePosts(fakeFetch)).rejects.toThrow("returned 503");
  });
});
