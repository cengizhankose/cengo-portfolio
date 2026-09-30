// BE-03 / SEC-08 / T-06 / T-12 / BE-20: the shared post query module.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { drizzle } from "drizzle-orm/postgres-js";
import { posts } from "../../../src/db/schema";
import {
  buildGetPublishedPostBySlug,
  buildListPublishedPosts,
  buildListTranslations,
  createPostQueries,
  resolveForLocale,
  type PostsDb,
  type PostWithTranslations,
} from "../../../src/db/queries/posts";
import { createStrictTestDb, REPO_ROOT } from "./pglite";

describe("generated SQL (drizzle.mock, no database)", () => {
  const mockDb = drizzle.mock();

  test("single-post lookup filters on published", () => {
    const { sql, params } = buildGetPublishedPostBySlug(mockDb, "x").toSQL();
    expect(sql).toContain('"posts"."slug" = $');
    expect(sql).toContain('"posts"."published" = $');
    expect(params).toEqual(["x", true, 1]);
  });

  test("list filters on published and orders newest first", () => {
    const { sql } = buildListPublishedPosts(mockDb).toSQL();
    expect(sql).toContain('"posts"."published" = $');
    expect(sql).toContain('order by "posts"."created_at" desc');
  });

  test("translations: same key, published, not the post itself", () => {
    const { sql, params } = buildListTranslations(mockDb, {
      id: 3,
      translationKey: "k",
    }).toSQL();
    expect(sql).toContain('"posts"."translation_key" = $');
    expect(sql).toContain('"posts"."published" = $');
    expect(sql).toContain('"posts"."id" <> $');
    expect(params).toEqual(["k", true, 3]);
  });
});

describe("createPostQueries against Postgres (PGlite, production schema)", () => {
  let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;
  let queries: ReturnType<typeof createPostQueries>;

  beforeAll(async () => {
    ctx = await createStrictTestDb();
    queries = createPostQueries(ctx.db);
    await ctx.db.insert(posts).values([
      {
        slug: "older",
        lang: "tr",
        title: "Older",
        content: "a",
        published: true,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        slug: "newer",
        lang: "en",
        translationKey: "pair",
        title: "Newer",
        content: "b",
        published: true,
        createdAt: new Date("2026-02-01T00:00:00Z"),
      },
      {
        slug: "newer-tr",
        lang: "tr",
        translationKey: "pair",
        title: "Daha yeni",
        content: "b-tr",
        published: true,
        createdAt: new Date("2026-02-02T00:00:00Z"),
      },
      {
        slug: "draft",
        lang: "tr",
        translationKey: "draft-pair",
        title: "Draft",
        content: "c",
        published: false,
        createdAt: new Date("2026-03-01T00:00:00Z"),
      },
      {
        slug: "published-with-draft-translation",
        lang: "en",
        translationKey: "draft-pair",
        title: "Has a draft translation",
        content: "e",
        published: true,
        createdAt: new Date("2026-01-15T00:00:00Z"),
      },
      // published defaults to false in the schema: a row without the flag is a draft too
      { slug: "implicit-draft", lang: "en", title: "Implicit", content: "d" },
    ]);
  });

  afterAll(async () => {
    await ctx.close();
  });

  test("getPublishedPostBySlug returns a published post", async () => {
    const post = await queries.getPublishedPostBySlug("newer");
    expect(post?.slug).toBe("newer");
    expect(post?.published).toBe(true);
  });

  test("drafts and unknown slugs are both null", async () => {
    expect(await queries.getPublishedPostBySlug("draft")).toBeNull();
    expect(await queries.getPublishedPostBySlug("implicit-draft")).toBeNull();
    expect(await queries.getPublishedPostBySlug("does-not-exist")).toBeNull();
  });

  test("slug input is a bound parameter, not SQL", async () => {
    expect(await queries.getPublishedPostBySlug("x' OR '1'='1")).toBeNull();
  });

  test("listPublishedPosts hides drafts and sorts newest first", async () => {
    const list = await queries.listPublishedPosts();
    expect(list.map((p) => p.slug)).toEqual([
      "newer-tr",
      "newer",
      "published-with-draft-translation",
      "older",
    ]);
  });

  test("post payload carries lang, translationKey, publishedAt, seoTitle and translations", async () => {
    const post = await queries.getPublishedPostBySlug("newer");
    expect(post).toMatchObject({
      lang: "en",
      translationKey: "pair",
      publishedAt: null,
      seoTitle: null,
      translations: [{ lang: "tr", slug: "newer-tr" }],
    });
    // JSON shape the API sends (T-12 field names).
    const json = JSON.parse(JSON.stringify(post));
    for (const key of [
      "lang",
      "translationKey",
      "publishedAt",
      "seoTitle",
      "translations",
    ])
      expect(json).toHaveProperty(key);
  });

  test("a post without translation_key has no translations", async () => {
    expect((await queries.getPublishedPostBySlug("older"))?.translations).toEqual(
      [],
    );
  });

  test("a draft translation is never listed (SEC-08)", async () => {
    expect(
      (await queries.getPublishedPostBySlug("published-with-draft-translation"))
        ?.translations,
    ).toEqual([]);
  });

  test("getPostForLocale: ok / moved / missing", async () => {
    expect(await queries.getPostForLocale("newer", "en")).toMatchObject({
      status: "ok",
      post: { slug: "newer" },
    });
    expect(await queries.getPostForLocale("newer-tr", "en")).toEqual({
      status: "moved",
      locale: "tr",
    });
    expect(await queries.getPostForLocale("draft", "tr")).toEqual({
      status: "missing",
    });
  });

  test("ping resolves against a live database", async () => {
    await expect(queries.ping()).resolves.toBeUndefined();
  });
});

describe("resolveForLocale (pure, BE-03 T-12 criterion)", () => {
  const trPost = {
    slug: "yazi",
    lang: "tr",
    translations: [],
  } as unknown as PostWithTranslations;

  test("null -> missing", () => {
    expect(resolveForLocale(null, "en")).toEqual({ status: "missing" });
  });
  test("same language -> ok", () => {
    expect(resolveForLocale(trPost, "tr")).toEqual({
      status: "ok",
      post: trPost,
    });
  });
  test("other language -> moved to the post's language", () => {
    expect(resolveForLocale(trPost, "en")).toEqual({
      status: "moved",
      locale: "tr",
    });
  });
});

describe("ping timeout (BE-20)", () => {
  test("a database that never answers is reported within the budget", async () => {
    const hanging = {
      execute: () => new Promise(() => {}),
    } as unknown as PostsDb;
    const started = performance.now();
    await expect(createPostQueries(hanging).ping(50)).rejects.toThrow(
      "database ping timed out after 50 ms",
    );
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("a failing database rejects ping", async () => {
    const failing = {
      execute: () => Promise.reject(new Error("connection refused")),
    } as unknown as PostsDb;
    await expect(createPostQueries(failing).ping()).rejects.toThrow(
      "connection refused",
    );
  });
});

test("single-post slug query exists only in the shared module (T-06)", async () => {
  const hits: string[] = [];
  for (const pattern of ["src/**/*.{ts,tsx,js,jsx}", "server.ts"]) {
    for await (const file of new Glob(pattern).scan({ cwd: REPO_ROOT })) {
      const text = await Bun.file(`${REPO_ROOT}/${file}`).text();
      if (text.includes("eq(posts.slug")) hits.push(file);
    }
  }
  expect(hits).toEqual(["src/db/queries/posts.ts"]);
});
