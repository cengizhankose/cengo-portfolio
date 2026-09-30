// BE-07 / PERF-15 / BE-05 (T-12) against Postgres: GET /api/posts through
// createApp() over createPostQueries(PGlite) with the BE-04 dev seed, the
// production schema and no port (T-02). Also the keyset SQL (.toSQL()).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { createApp } from "../../../src/api/app";
import { decodeCursor } from "../../../src/db/post-input";
import {
  buildListPublishedPosts,
  CARD_FIELDS,
  createPostQueries,
} from "../../../src/db/queries/posts";
import { posts } from "../../../src/db/schema";
import { DEV_SEED_POSTS, seedDevPosts } from "../../../scripts/seed-dev";
import { createStrictTestDb, REPO_ROOT } from "../db/pglite";
import { silenceLogs } from "../helpers";

silenceLogs();

const CARD_KEYS_SORTED = [
  "coverImage",
  "createdAt",
  "excerpt",
  "id",
  "lang",
  "publishedAt",
  "slug",
  "title",
  "translationKey",
  "updatedAt",
];

type Card = Record<string, unknown> & { slug: string; lang: string };

let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;
let app: ReturnType<typeof createApp>;

const get = (path: string) => app.request(path);
const list = async (path: string) => {
  const res = await get(path);
  expect(res.status).toBe(200);
  return { res, body: (await res.json()) as Card[] };
};

beforeAll(async () => {
  ctx = await createStrictTestDb();
  await seedDevPosts(ctx.db); // 3 published (EN/TR pair + TR only) + 1 draft
  app = createApp({
    queries: createPostQueries(ctx.db),
    env: { RATE_LIMIT_DISABLED: "1" },
  });
});

afterAll(async () => {
  await ctx.close();
});

describe("card fields only (BE-07 criterion 1, PERF-15 criterion 1)", () => {
  test("every item has exactly the card keys; no content, no diagrams", async () => {
    const { body } = await list("/api/posts");
    expect(body.length).toBe(3);
    for (const item of body) {
      expect(Object.keys(item).sort()).toEqual(CARD_KEYS_SORTED);
      expect(item).not.toHaveProperty("content");
      expect(item).not.toHaveProperty("diagrams");
      expect(item).not.toHaveProperty("cursor");
    }
    expect<string[]>([...CARD_FIELDS].sort()).toEqual(CARD_KEYS_SORTED);
  });

  test("one published post -> response <= 1024 bytes (BE-07 criterion 2; PERF-15 <= 1500)", async () => {
    const one = await createStrictTestDb();
    try {
      const longPost = DEV_SEED_POSTS[0];
      await one.db.insert(posts).values({
        ...longPost,
        content: "x".repeat(15_000), // the live post's body is ~15 KB
      });
      const res = await createApp({
        queries: createPostQueries(one.db),
        env: { RATE_LIMIT_DISABLED: "1" },
      }).request("/api/posts");
      const text = await res.text();
      expect(JSON.parse(text)).toHaveLength(1);
      expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(
        1024,
      );
    } finally {
      await one.close();
    }
  });

  test("the list never contains drafts", async () => {
    const { body } = await list("/api/posts?limit=50");
    expect(body.map((p) => p.slug)).not.toContain("taslak-ornek");
  });
});

describe("keyset pagination (BE-07 criterion 3)", () => {
  test("?limit=2 -> 2 items + X-Next-Cursor; that cursor -> 1 item, no header", async () => {
    const first = await list("/api/posts?limit=2");
    expect(first.body.map((p) => p.slug)).toEqual([
      "hello-world",
      "merhaba-dunya",
    ]);
    const cursor = first.res.headers.get("x-next-cursor");
    expect(cursor).toBeTruthy();
    expect(decodeCursor(cursor!)).not.toBeNull();

    const second = await list(`/api/posts?limit=2&cursor=${cursor}`);
    expect(second.body.map((p) => p.slug)).toEqual(["sadece-turkce"]);
    expect(second.res.headers.get("x-next-cursor")).toBeNull();
  });

  test("an exact page boundary has no next cursor", async () => {
    const { res, body } = await list("/api/posts?limit=3");
    expect(body).toHaveLength(3);
    expect(res.headers.get("x-next-cursor")).toBeNull();
  });

  test("?limit=500 -> 200 and at most 50 items", async () => {
    const { body } = await list("/api/posts?limit=500");
    expect(body.length).toBeLessThanOrEqual(50);
  });

  test("?cursor=bozuk -> 400 BAD_CURSOR, T-01 envelope, no-store", async () => {
    const res = await get("/api/posts?cursor=bozuk");
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe("BAD_CURSOR");
    expect(
      Object.keys(body).filter((k) => !["error", "code", "issues"].includes(k)),
    ).toEqual([]);
  });

  test("a cursor for an instant Postgres cannot store is a 400, never a 500", async () => {
    const forged = Buffer.from(
      JSON.stringify({ t: "2026-02-30T00:00:00Z", id: 1 }),
    ).toString("base64url");
    expect((await get(`/api/posts?cursor=${forged}`)).status).toBe(400);
  });
});

describe("?lang / missingIn (BE-07 criterion 4, T-12)", () => {
  test("?lang=en -> only EN posts (and at least one)", async () => {
    const { body } = await list("/api/posts?lang=en");
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((p) => p.lang === "en")).toBe(true);
  });

  test("?lang=tr -> only TR posts; all TR items come first trivially (PERF-15 criterion 2)", async () => {
    const { body } = await list("/api/posts?lang=tr");
    expect(body.map((p) => p.slug)).toEqual(["merhaba-dunya", "sadece-turkce"]);
  });

  test("?lang=tr&missingIn=en -> the TR post without an EN translation only", async () => {
    const { body } = await list("/api/posts?lang=tr&missingIn=en");
    const slugs = body.map((p) => p.slug);
    expect(slugs).toContain("sadece-turkce");
    expect(slugs).not.toContain("merhaba-dunya");
  });

  test("?lang=en&missingIn=tr -> empty (hello-world has a TR translation)", async () => {
    const { body } = await list("/api/posts?lang=en&missingIn=tr");
    expect(body).toEqual([]);
  });

  test("no lang -> every language (today's client keeps working)", async () => {
    const { body } = await list("/api/posts");
    expect(new Set(body.map((p) => p.lang))).toEqual(new Set(["en", "tr"]));
  });

  test.each([
    ["/api/posts?lang=de", "lang"],
    ["/api/posts?missingIn=en", "missingIn"],
    ["/api/posts?lang=en&missingIn=en", "missingIn"],
  ])("%s -> 400 BAD_PARAM, issues[0].path %p", async (path, issuePath) => {
    const res = await get(path);
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as {
      code: string;
      issues: { path: string }[];
    };
    expect(body.code).toBe("BAD_PARAM");
    expect(body.issues[0].path).toBe(issuePath);
    expect(Object.keys(body).sort()).toEqual(["code", "error", "issues"]);
  });

  test("a draft translation does not count as a translation", async () => {
    // taslak-ornek is a TR draft; give an EN post a draft TR twin.
    const db = await createStrictTestDb();
    try {
      await db.db.insert(posts).values([
        {
          slug: "only-draft-twin",
          lang: "en",
          translationKey: "twin",
          title: "EN",
          content: "x",
          published: true,
        },
        {
          slug: "taslak-ikiz",
          lang: "tr",
          translationKey: "twin",
          title: "TR",
          content: "x",
          published: false,
        },
      ]);
      const rows = await createPostQueries(db.db).listPublishedPosts({
        lang: "en",
        missingIn: "tr",
      });
      expect(rows.map((p) => p.slug)).toEqual(["only-draft-twin"]);
    } finally {
      await db.close();
    }
  });
});

describe("keyset exactness (microsecond timestamps)", () => {
  test("rows sharing a millisecond, or an identical instant, are each listed once", async () => {
    const db = await createStrictTestDb();
    try {
      const at = (iso: string) => sql`${iso}::timestamptz`;
      await db.db.insert(posts).values(
        [
          // same millisecond, different microseconds
          { slug: "us-900", createdAt: at("2026-05-01T10:00:00.123900Z") },
          { slug: "us-500", createdAt: at("2026-05-01T10:00:00.123500Z") },
          { slug: "us-100", createdAt: at("2026-05-01T10:00:00.123100Z") },
          // identical instant: the id breaks the tie
          { slug: "tie-a", createdAt: at("2026-04-01T00:00:00.000001Z") },
          { slug: "tie-b", createdAt: at("2026-04-01T00:00:00.000001Z") },
          { slug: "tie-c", createdAt: at("2026-04-01T00:00:00.000001Z") },
        ].map((row) => ({
          ...row,
          lang: "en" as const,
          title: row.slug,
          content: "x",
          published: true,
        })),
      );

      const pages = createApp({
        queries: createPostQueries(db.db),
        env: { RATE_LIMIT_DISABLED: "1" },
      });
      const seen: string[] = [];
      let path = "/api/posts?limit=1";
      for (let i = 0; i < 10; i++) {
        const res = await pages.request(path);
        seen.push(...((await res.json()) as Card[]).map((p) => p.slug));
        const next = res.headers.get("x-next-cursor");
        if (!next) break;
        path = `/api/posts?limit=1&cursor=${next}`;
      }
      expect(seen).toEqual([
        "us-900",
        "us-500",
        "us-100",
        "tie-c",
        "tie-b",
        "tie-a",
      ]);
    } finally {
      await db.close();
    }
  });
});

describe("keyset SQL (BE-07 step 3, .toSQL())", () => {
  const mockDb = drizzle.mock();

  test("card columns only, published filter, newest first with id tiebreak", () => {
    const { sql: text, params } = buildListPublishedPosts(mockDb, {
      limit: 21,
    }).toSQL();
    expect(text).not.toMatch(/"content"|"seo_title"|"published", /);
    expect(text).toContain('"posts"."published" = $1');
    expect(text).toContain(
      'order by "posts"."created_at" desc, "posts"."id" desc',
    );
    expect(params).toEqual([true, 21]);
  });

  test("lang, missingIn (not exists on p2) and the row-value cursor are bound parameters", () => {
    const { sql: text, params } = buildListPublishedPosts(mockDb, {
      lang: "tr",
      missingIn: "en",
      cursor: { t: "2026-01-01T00:00:00.000001Z", id: 9 },
      limit: 3,
    }).toSQL();
    expect(text).toContain('"posts"."lang" = $2');
    expect(text).toContain('"posts"."translation_key" is null or not exists');
    expect(text).toContain('from "posts" "p2"');
    expect(text).toContain('"p2"."published" = $4');
    expect(text).toContain(
      '("posts"."created_at", "posts"."id") < ($5::timestamptz, $6)',
    );
    expect(params).toEqual([
      true,
      "tr",
      "en",
      true,
      "2026-01-01T00:00:00.000001Z",
      9,
      3,
    ]);
  });
});

test("posts are selected from the table only in the shared module (BE-07 criterion 5, T-06)", async () => {
  const hits = new Set<string>();
  for (const pattern of ["src/**/*.{ts,tsx,js,jsx}", "server.ts"]) {
    for await (const file of new Glob(pattern).scan({ cwd: REPO_ROOT })) {
      const text = await Bun.file(`${REPO_ROOT}/${file}`).text();
      if (/from\((posts|p2)\)/.test(text)) hits.add(file);
    }
  }
  expect([...hits]).toEqual(["src/db/queries/posts.ts"]);
});
