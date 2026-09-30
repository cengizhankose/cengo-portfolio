// W4 rows of the BE-17 endpoint matrix (handoff H3) and the BE-05 / BE-06 /
// SEC-07 route criteria: createApp().request() over fake / spied query
// objects (no database, no port, T-02).
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { createApp } from "../../../src/api/app";
import { readBucketStore } from "../../../src/api/middleware/rate-limit";
import {
  NEXT_CURSOR_HEADER,
  PUBLIC_CACHE_CONTROL,
  toCard,
} from "../../../src/api/routes/posts";
import { decodeCursor, encodeCursor } from "../../../src/db/post-input";
import type {
  ListedPost,
  ListOptions,
  PostQueries,
} from "../../../src/db/queries/posts";
import {
  failingQueries,
  fakeQueries,
  REPO_ROOT,
  SAMPLE_POST,
  silenceLogs,
  spyQueries,
} from "../helpers";

silenceLogs();

const NO_LIMIT = { RATE_LIMIT_DISABLED: "1" };

const app = (queries: PostQueries = fakeQueries()) =>
  createApp({ queries, env: NO_LIMIT });

const { translations: _t, ...SAMPLE_ROW } = SAMPLE_POST;
const TR_ROW = {
  ...SAMPLE_ROW,
  id: 2,
  slug: "merhaba-dunya",
  lang: "tr" as const,
  createdAt: new Date("2025-12-01T00:00:00Z"),
};

/** A list query that honours `lang` and `limit` over two rows (EN, TR); rows keep `content`. */
function languageQueries(calls: ListOptions[] = []): PostQueries {
  return fakeQueries({
    listPublishedPosts: async (options: ListOptions = {}) => {
      calls.push(options);
      return [SAMPLE_ROW, TR_ROW]
        .filter((row) => !options.lang || row.lang === options.lang)
        .slice(0, options.limit ?? 20) as ListedPost[];
    },
  });
}

async function expectEnvelope(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.code).toBe(code);
  // T-01 envelope: nothing but error, code and (optionally) issues.
  expect(
    Object.keys(body).filter((k) => !["error", "code", "issues"].includes(k)),
  ).toEqual([]);
  return body as { code: string; issues?: { path: string }[] };
}

describe("W4 row: GET /api/posts?lang=en", () => {
  test("happy: only EN items; the query gets lang 'en' and limit + 1", async () => {
    const calls: ListOptions[] = [];
    const res = await app(languageQueries(calls)).request("/api/posts?lang=en");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lang: string }[];
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((p) => p.lang === "en")).toBe(true);
    expect(calls).toEqual([
      {
        limit: 21,
        cursor: undefined,
        lang: "en",
        missingIn: undefined,
      },
    ]);
  });

  test("error: ?lang=de -> 400 BAD_PARAM, issues[0].path 'lang', query never called", async () => {
    const { queries, calls } = spyQueries(languageQueries());
    const body = await expectEnvelope(
      await app(queries).request("/api/posts?lang=de"),
      400,
      "BAD_PARAM",
    );
    expect(body.issues?.[0].path).toBe("lang");
    expect(calls).toEqual([]);
  });

  test("error: ?missingIn=en without lang -> 400 BAD_PARAM", async () => {
    const { queries, calls } = spyQueries();
    const body = await expectEnvelope(
      await app(queries).request("/api/posts?missingIn=en"),
      400,
      "BAD_PARAM",
    );
    expect(body.issues?.[0].path).toBe("missingIn");
    expect(calls).toEqual([]);
  });
});

describe("W4 row: GET /api/posts?cursor=", () => {
  test("error: undecodable cursor -> 400 BAD_CURSOR without issues, query never called", async () => {
    const { queries, calls } = spyQueries();
    const body = await expectEnvelope(
      await app(queries).request("/api/posts?cursor=bozuk"),
      400,
      "BAD_CURSOR",
    );
    expect(body.issues).toBeUndefined();
    expect(calls).toEqual([]);
  });

  test("a bad lang and a bad cursor together -> BAD_PARAM (fix the parameters first)", async () => {
    await expectEnvelope(
      await app().request("/api/posts?lang=de&cursor=bozuk"),
      400,
      "BAD_PARAM",
    );
  });

  test("happy: the cursor is decoded and handed to the query", async () => {
    const calls: ListOptions[] = [];
    const cursor = { t: "2026-01-01T00:00:00.000001Z", id: 5 };
    const res = await app(languageQueries(calls)).request(
      `/api/posts?limit=1&cursor=${encodeCursor(cursor)}`,
    );
    expect(res.status).toBe(200);
    expect(calls[0]).toMatchObject({ limit: 2, cursor });
  });

  test("X-Next-Cursor: set when a look-ahead row exists, built from createdAt/id when the query gives none", async () => {
    const res = await app(languageQueries()).request("/api/posts?limit=1");
    const next = res.headers.get(NEXT_CURSOR_HEADER);
    expect(decodeCursor(next!)).toEqual({
      t: SAMPLE_ROW.createdAt.toISOString(),
      id: SAMPLE_ROW.id,
    });
    const last = await app(languageQueries()).request("/api/posts?limit=2");
    expect(last.headers.get(NEXT_CURSOR_HEADER)).toBeNull();
  });
});

describe("W4 row: card fields only (PERF-15)", () => {
  test("the response drops content, seoTitle, published and cursor even if the query returns them", async () => {
    const res = await app(
      fakeQueries({
        listPublishedPosts: async () => [
          { ...SAMPLE_ROW, cursor: "abc" } as ListedPost,
        ],
      }),
    ).request("/api/posts");
    const [item] = (await res.json()) as Record<string, unknown>[];
    expect(Object.keys(item).sort()).toEqual([
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
    ]);
    expect(JSON.stringify(item)).not.toContain(SAMPLE_POST.content);
  });

  test("toCard fills a missing card field with null (stable key set)", () => {
    const { excerpt: _e, ...partial } = SAMPLE_ROW;
    expect(toCard(partial as unknown as ListedPost).excerpt).toBeNull();
  });
});

describe("W4 row: GET /api/posts/:slug outside PostSlug -> 404, no query (BE-05, SEC-07)", () => {
  test.each([
    "/api/posts/Hello%20World",
    "/api/posts/..%2fx",
    "/api/posts/Bad_Slug",
    "/api/posts/HELLO-WORLD",
    "/api/posts/ab",
    `/api/posts/${"a".repeat(121)}`,
    "/api/posts/%E0%A4%A",
  ])("%s -> 404 NOT_FOUND, query never called", async (path) => {
    const { queries, calls } = spyQueries();
    await expectEnvelope(await app(queries).request(path), 404, "NOT_FOUND");
    expect(calls).toEqual([]);
  });

  test("control: a well-formed unknown slug does reach the query once", async () => {
    const { queries, calls } = spyQueries();
    await expectEnvelope(
      await app(queries).request("/api/posts/no-such-post"),
      404,
      "NOT_FOUND",
    );
    expect(calls).toEqual(["getPublishedPostBySlug"]);
  });
});

describe("Cache-Control (BE-06 step 3, PERF-06 step 4)", () => {
  test("200 list and 200 post: public, max-age=60, s-maxage=300, stale-while-revalidate=86400", async () => {
    expect(PUBLIC_CACHE_CONTROL).toBe(
      "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
    );
    for (const path of [
      "/api/posts",
      "/api/posts?lang=tr",
      `/api/posts/${SAMPLE_POST.slug}`,
    ]) {
      const res = await app().request(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe(PUBLIC_CACHE_CONTROL);
    }
    const head = await app().request("/api/posts", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("cache-control")).toBe(PUBLIC_CACHE_CONTROL);
  });

  test("404 (draft / unknown), 400 and 500 are no-store: the edge never keeps them", async () => {
    for (const path of [
      "/api/posts/taslak-ornek",
      "/api/posts/Bad_Slug",
      "/api/posts?lang=xx",
      "/api/posts?cursor=bozuk",
    ]) {
      const res = await app().request(path);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    const failed = await app(failingQueries()).request("/api/posts");
    expect(failed.status).toBe(500);
    expect(failed.headers.get("cache-control")).toBe("no-store");
  });

  test("429 stays no-store, never s-maxage (W3 handoff)", async () => {
    const limited = createApp({
      queries: fakeQueries(),
      env: {},
      rateLimitStore: readBucketStore(1, () => 0),
    });
    expect((await limited.request("/api/posts")).status).toBe(200);
    const res = await limited.request("/api/posts");
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get(NEXT_CURSOR_HEADER)).toBeNull();
  });
});

test("the single-post payload keeps translations (T-12)", async () => {
  const res = await app().request(`/api/posts/${SAMPLE_POST.slug}`);
  expect(await res.json()).toMatchObject({
    translations: [{ lang: "tr", slug: "merhaba-dunya" }],
  });
});

test("no raw request body is read anywhere in src (BE-05 criterion 5, SEC-07 criterion 4)", async () => {
  const hits: string[] = [];
  for await (const file of new Glob("src/**/*.{ts,tsx,js,jsx}").scan({
    cwd: REPO_ROOT,
  })) {
    const text = await Bun.file(`${REPO_ROOT}/${file}`).text();
    if (/values\(body\)|\.\.\.body|c\.req\.json|req\.json\(/.test(text)) {
      hits.push(file);
    }
  }
  expect(hits).toEqual([]);
});
