// BE-19 + PERF-22 + T-12: the single 0001 migration, checked on PGlite
// (production Postgres checks stay with the owner: see the W2 report).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { posts } from "../../../src/db/schema";
import { createStrictTestDb, MIGRATIONS, REPO_ROOT } from "./pglite";

async function statements(file: string): Promise<string[]> {
  const sql = await Bun.file(join(MIGRATIONS, file)).text();
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function errorOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    // drizzle wraps driver errors ("Failed query: ..."); the constraint is in the cause.
    const cause = (error as { cause?: Error }).cause;
    return `${(error as Error).message} ${cause?.message ?? ""}`;
  }
  return "no error";
}

describe("schema after all migrations (fresh database)", () => {
  let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;

  beforeAll(async () => {
    ctx = await createStrictTestDb();
  });
  afterAll(async () => {
    await ctx.close();
  });

  test("nullability and time zone types (BE-19 criterion 1)", async () => {
    const { rows } = await ctx.client.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `select column_name, data_type, is_nullable from information_schema.columns
       where table_name = 'posts' and column_name in
       ('published','created_at','updated_at','published_at','lang','translation_key','seo_title')
       order by column_name`,
    );
    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    for (const name of ["published", "created_at", "updated_at", "lang"])
      expect(byName[name].is_nullable).toBe("NO");
    for (const name of ["published_at", "translation_key", "seo_title"])
      expect(byName[name].is_nullable).toBe("YES");
    for (const name of ["created_at", "updated_at", "published_at"])
      expect(byName[name].data_type).toBe("timestamp with time zone");
  });

  test("list indexes (BE-19 criterion 2, PERF-22 criterion 1)", async () => {
    const { rows } = await ctx.client.query<{
      indexname: string;
      indexdef: string;
    }>(`select indexname, indexdef from pg_indexes where tablename = 'posts'`);
    const def = Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));
    expect(def.posts_lang_published_created_at_idx).toContain(
      "(lang, published, created_at DESC)",
    );
    expect(def.posts_published_created_at_idx).toContain("(created_at DESC)");
    expect(def.posts_published_created_at_idx).toContain(
      "WHERE (published = true)",
    );
  });

  test("lang is mandatory: no default (T-12)", async () => {
    const message = await errorOf(() =>
      ctx.client.query(
        `insert into posts (slug, title, content) values ('no-lang', 't', 'c')`,
      ),
    );
    expect(message).toContain('null value in column "lang"');
  });

  test("lang = 'de' violates posts_lang_check (BE-19 criterion 5)", async () => {
    const message = await errorOf(() =>
      ctx.db
        .insert(posts)
        .values({ slug: "de", lang: "de" as "en", title: "t", content: "c" }),
    );
    expect(message).toContain("posts_lang_check");
  });

  test("one post per (translation_key, lang) (BE-19 criterion 6)", async () => {
    await ctx.db.insert(posts).values([
      {
        slug: "merhaba-dunya",
        lang: "tr",
        translationKey: "hello-world",
        title: "t",
        content: "c",
      },
      {
        slug: "hello-world",
        lang: "en",
        translationKey: "hello-world",
        title: "t",
        content: "c",
      },
    ]);
    const message = await errorOf(() =>
      ctx.db.insert(posts).values({
        slug: "hello-world-2",
        lang: "en",
        translationKey: "hello-world",
        title: "t",
        content: "c",
      }),
    );
    expect(message).toContain("posts_translation_key_lang_unique");
    // NULL keys never collide: any number of untranslated posts per language.
    await ctx.db.insert(posts).values([
      { slug: "solo-1", lang: "tr", title: "t", content: "c" },
      { slug: "solo-2", lang: "tr", title: "t", content: "c" },
    ]);
  });

  test("updated_at moves forward when a post is updated again (BE-19 criterion 4)", async () => {
    const created = new Date("2026-01-01T00:00:00Z");
    await ctx.db.insert(posts).values({
      slug: "republish",
      lang: "en",
      title: "v1",
      content: "c",
      createdAt: created,
      updatedAt: created,
    });
    await ctx.db
      .update(posts)
      .set({ title: "v2", published: true })
      .where(eq(posts.slug, "republish"));
    const [row] = await ctx.db
      .select()
      .from(posts)
      .where(eq(posts.slug, "republish"));
    expect(row.updatedAt.getTime()).toBeGreaterThan(row.createdAt.getTime());
  });
});

describe("upgrading a 0000 database with live-like rows", () => {
  let client: PGlite;

  beforeAll(async () => {
    client = new PGlite();
    for (const s of await statements("0000_nasty_mentor.sql"))
      await client.exec(s);
    // A non-UTC session must not shift instants: the USING clause fixes UTC.
    await client.exec(`SET TIME ZONE 'Europe/Istanbul'`);
    await client.exec(`
      insert into posts (slug, title, content, published, created_at, updated_at) values
        ('live-post', 'Live', 'c', true, '2026-09-01 10:00:00', '2026-09-02 11:30:00'),
        ('old-draft', 'Draft', 'c', false, '2026-08-01 08:00:00', '2026-08-01 08:00:00');
      insert into posts (slug, title, content, published, created_at, updated_at) values
        ('null-row', 'Nulls', 'c', null, null, null);
    `);
    for (const s of await statements("0001_posts_hardening_i18n.sql"))
      await client.exec(s);
  });
  afterAll(async () => {
    await client.close();
  });

  const row = async (slug: string) =>
    (
      await client.query<{
        created_at: Date;
        updated_at: Date;
        published_at: Date | null;
        published: boolean;
        lang: string;
      }>(`select * from posts where slug = $1`, [slug])
    ).rows[0];

  test("every existing row becomes 'tr' and none is lost (BE-19 criterion 5)", async () => {
    const { rows } = await client.query<{ total: number; not_tr: number }>(
      `select count(*)::int as total, count(*) filter (where lang is distinct from 'tr')::int as not_tr from posts`,
    );
    expect(rows[0]).toEqual({ total: 3, not_tr: 0 });
  });

  test("naive timestamps are read as UTC instants (BE-19 criterion 3)", async () => {
    const live = await row("live-post");
    expect(live.created_at.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    expect(live.updated_at.toISOString()).toBe("2026-09-02T11:30:00.000Z");
  });

  test("published_at is backfilled for published rows only", async () => {
    expect((await row("live-post")).published_at?.toISOString()).toBe(
      "2026-09-01T10:00:00.000Z",
    );
    expect((await row("old-draft")).published_at).toBeNull();
  });

  test("NULL flags and timestamps are backfilled before NOT NULL", async () => {
    const nulls = await row("null-row");
    expect(nulls.published).toBe(false);
    expect(nulls.created_at).toBeInstanceOf(Date);
    expect(nulls.updated_at.getTime()).toBe(nulls.created_at.getTime());
  });
});

describe("query plans with 1,000 posts (PERF-22 criterion 2)", () => {
  let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;

  beforeAll(async () => {
    ctx = await createStrictTestDb();
    // 1,000 posts: 90% published; 2% English, the rest Turkish.
    await ctx.client.exec(`
      insert into posts (slug, title, content, published, lang, created_at)
      select 'p' || g, 't', 'c', g % 10 <> 0,
             case when g % 50 = 0 then 'en' else 'tr' end,
             now() - (g || ' minutes')::interval
      from generate_series(1, 1000) g;
      analyze posts;
    `);
  });
  afterAll(async () => {
    await ctx.close();
  });

  const plan = async (sql: string) =>
    (await ctx.client.query<{ "QUERY PLAN": string }>(`EXPLAIN ${sql}`)).rows
      .map((r) => r["QUERY PLAN"])
      .join("\n");

  test("language-less list uses the partial index", async () => {
    expect(
      await plan(
        "SELECT id, slug, title, excerpt, cover_image, created_at FROM posts WHERE published = true ORDER BY created_at DESC LIMIT 20",
      ),
    ).toContain("Index Scan using posts_published_created_at_idx");
  });

  test("per-language list uses the (lang, published, created_at DESC) index", async () => {
    expect(
      await plan(
        "SELECT id, slug FROM posts WHERE lang = 'en' AND published = true ORDER BY created_at DESC LIMIT 20",
      ),
    ).toContain("posts_lang_published_created_at_idx");
  });
});

test("drizzle-kit check passes on the migration folder (PERF-22 criterion 1)", () => {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.PG_CONNECTION_URL; // `check` is offline; nothing may connect
  const proc = Bun.spawnSync([process.execPath, "x", "drizzle-kit", "check"], {
    cwd: REPO_ROOT,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = proc.stdout.toString() + proc.stderr.toString();
  expect(proc.exitCode).toBe(0);
  expect(output).toContain("Everything's fine");
}, 60_000);
