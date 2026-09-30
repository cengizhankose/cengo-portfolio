// BE-04 / SEC-06 / BE-19 (T-12): dev seed is idempotent, contains the hidden
// draft and an EN/TR translation pair, and the optional live import only
// accepts well-formed public data.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { posts } from "../../../src/db/schema";
import { createPostQueries } from "../../../src/db/queries/posts";
import {
  DEV_SEED_POSTS,
  DRAFT_SLUG,
  LIVE_POSTS_URL,
  TRANSLATION_KEY,
  fetchLivePosts,
  parseLivePosts,
  seedDevPosts,
} from "../../../scripts/seed-dev";
import { createStrictTestDb } from "./pglite";

describe("seedDevPosts (PGlite, production schema)", () => {
  let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;

  beforeAll(async () => {
    ctx = await createStrictTestDb();
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

  test("T-12 fixtures: EN/TR pair, a TR post without translation, a TR draft", async () => {
    const rows = await ctx.db.select().from(posts);
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
    expect(bySlug["hello-world"]).toMatchObject({
      lang: "en",
      translationKey: TRANSLATION_KEY,
      published: true,
    });
    expect(bySlug["merhaba-dunya"]).toMatchObject({
      lang: "tr",
      translationKey: TRANSLATION_KEY,
      published: true,
    });
    expect(bySlug["sadece-turkce"]).toMatchObject({
      lang: "tr",
      translationKey: null,
      published: true,
    });
    expect(bySlug[DRAFT_SLUG]).toMatchObject({ lang: "tr", publishedAt: null });
    for (const row of rows.filter((r) => r.published))
      expect(row.publishedAt).toBeInstanceOf(Date);
  });

  test("second run is a no-op (ON CONFLICT DO NOTHING) and keeps edited rows", async () => {
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

  test("BE-03 (T-12): the TR post reports its EN translation", async () => {
    const queries = createPostQueries(ctx.db);
    const post = await queries.getPublishedPostBySlug("merhaba-dunya");
    expect([post?.lang, post?.translations.map((t) => t.lang)]).toEqual([
      "tr",
      ["en"],
    ]);
    expect(post?.translations).toEqual([{ lang: "en", slug: "hello-world" }]);
    expect(
      (await queries.getPublishedPostBySlug("sadece-turkce"))?.translations,
    ).toEqual([]);
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

  test("maps public rows to published TR inserts without ids (pre-T-12 payload)", () => {
    const [row] = parseLivePosts(sample);
    expect(row).toEqual({
      slug: "a-live-post",
      title: "A live post",
      content: "body",
      excerpt: null,
      coverImage: null,
      seoTitle: null,
      lang: "tr",
      translationKey: null,
      published: true,
      createdAt: new Date("2026-09-01T10:00:00.000Z"),
      updatedAt: new Date("2026-09-02T10:00:00.000Z"),
      publishedAt: new Date("2026-09-01T10:00:00.000Z"),
    });
    expect(row).not.toHaveProperty("id");
  });

  test("keeps lang, translationKey and publishedAt from a T-12 payload", () => {
    const [row] = parseLivePosts([
      {
        ...sample[0],
        lang: "en",
        translationKey: "a-live-post",
        publishedAt: "2026-09-03T10:00:00.000Z",
        seoTitle: "A live post | test",
      },
    ]);
    expect(row).toMatchObject({
      lang: "en",
      translationKey: "a-live-post",
      publishedAt: new Date("2026-09-03T10:00:00.000Z"),
      seoTitle: "A live post | test",
    });
  });

  test.each([
    ["not an array", { posts: [] }],
    ["bad slug", [{ ...sample[0], slug: "../../etc" }]],
    ["missing title", [{ ...sample[0], title: "" }]],
    ["non-string content", [{ ...sample[0], content: 42 }]],
    ["non-string excerpt", [{ ...sample[0], excerpt: {} }]],
    ["unknown lang", [{ ...sample[0], lang: "de" }]],
    ["bad translationKey", [{ ...sample[0], translationKey: "a b" }]],
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

  test("fetchLivePosts stops reading once the body exceeds the cap (W1 review)", async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024).fill(32));
      },
    });
    const fakeFetch = (async () =>
      new Response(endless, { status: 200 })) as unknown as typeof fetch;
    await expect(fetchLivePosts(fakeFetch, 4096)).rejects.toThrow(
      "unexpectedly large",
    );
    expect(pulled).toBeLessThan(10);
  });

  test("fetchLivePosts refuses a declared Content-Length above the cap", async () => {
    const fakeFetch = (async () =>
      new Response("[]", {
        headers: { "content-length": "999999" },
      })) as unknown as typeof fetch;
    await expect(fetchLivePosts(fakeFetch, 4096)).rejects.toThrow(
      "unexpectedly large",
    );
  });
});
