// PERF-05 step 6 / 8: posts.diagrams (migration 0002) and the single-post
// query that returns it. PGlite with the real migration files.
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
  setDefaultTimeout,
} from "bun:test";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { createPostQueries } from "../../../src/db/queries/posts";
import { posts, type PostDiagrams } from "../../../src/db/schema";
import { createStrictTestDb, MIGRATIONS } from "../db/pglite";

// Shared machines get loaded: the default 5 s per test is too tight for jsdom and PGlite.
setDefaultTimeout(30_000);

/** PGlite start + migrations can take seconds on a loaded machine. */
const SETUP_TIMEOUT_MS = 30_000;

const DIAGRAMS: PostDiagrams = {
  "0a1b2c3d": {
    label: "Diagram: Pipeline",
    light: '<svg id="m-0a1b2c3d-light"></svg>',
    dark: '<svg id="m-0a1b2c3d-dark"></svg>',
  },
};

describe("migration 0002 (posts.diagrams)", () => {
  let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;
  let queries: ReturnType<typeof createPostQueries>;

  beforeAll(async () => {
    ctx = await createStrictTestDb();
    queries = createPostQueries(ctx.db);
  }, SETUP_TIMEOUT_MS);
  afterAll(async () => {
    await ctx.close();
  });

  test("the file is one nullable jsonb column and nothing else", async () => {
    const text = await Bun.file(
      join(MIGRATIONS, "0002_posts_diagrams.sql"),
    ).text();
    const statements = text
      .split("\n")
      .filter((line) => !line.startsWith("--") && line.trim() !== "")
      .join(" ")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    expect(statements).toEqual([
      'ALTER TABLE "posts" ADD COLUMN "diagrams" jsonb',
    ]);
  });

  test("the column is jsonb, nullable, without a default", async () => {
    const { rows } = await ctx.client.query<{
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `select data_type, is_nullable, column_default from information_schema.columns
       where table_name = 'posts' and column_name = 'diagrams'`,
    );
    expect(rows).toEqual([
      { data_type: "jsonb", is_nullable: "YES", column_default: null },
    ]);
  });

  test("a post written before the column (or by a run without diagrams) reads as {}", async () => {
    await ctx.db.insert(posts).values({
      slug: "no-diagrams",
      lang: "en",
      title: "No diagrams",
      content: "text",
      published: true,
    });
    const [row] = await ctx.db
      .select({ diagrams: posts.diagrams })
      .from(posts)
      .where(eq(posts.slug, "no-diagrams"));
    expect(row.diagrams).toBeNull();
    const post = await queries.getPublishedPostBySlug("no-diagrams");
    expect(post?.diagrams).toEqual({});
  });

  test("stored diagrams come back unchanged from getPublishedPostBySlug", async () => {
    await ctx.db.insert(posts).values({
      slug: "with-diagrams",
      lang: "en",
      title: "With diagrams",
      content: "```mermaid\nflowchart TD\n  A-->B\n```",
      published: true,
      diagrams: DIAGRAMS,
    });
    const post = await queries.getPublishedPostBySlug("with-diagrams");
    expect(post?.diagrams).toEqual(DIAGRAMS);
  });

  test("a draft never exposes its diagrams", async () => {
    await ctx.db.insert(posts).values({
      slug: "draft-diagrams",
      lang: "en",
      title: "Draft",
      content: "x",
      published: false,
      diagrams: DIAGRAMS,
    });
    expect(await queries.getPublishedPostBySlug("draft-diagrams")).toBeNull();
  });

  test("lists carry cards only, never diagrams (PERF-15)", async () => {
    const list = await queries.listPublishedPosts({ limit: 10 });
    expect(list.length).toBeGreaterThan(0);
    for (const card of list) expect(card).not.toHaveProperty("diagrams");
  });
});
