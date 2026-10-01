// BE-06 / PERF-06: the in-process SWR cache (src/api/cache.ts), its PostQueries
// wrapper, the startup warm-up and the server.ts wiring. Fake clock, fake
// query objects, and PGlite for the end-to-end check.
import { describe, expect, test } from "bun:test";
import {
  CACHE_ERROR_RETRY_MS,
  CACHE_FRESH_MS,
  CACHE_NEGATIVE_MS,
  CACHE_MAX_ENTRIES,
  CACHE_STALE_MS,
  createSwrCache,
  LIST_CACHE_ROWS,
  listViews,
  serverPostQueries,
  warmPostCache,
  withCache,
} from "../../../src/api/cache";
import { createApp } from "../../../src/api/app";
import {
  createPostQueries,
  type ListedPost,
  type ListOptions,
  type PostQueries,
} from "../../../src/db/queries/posts";
import { seedDevPosts } from "../../../scripts/seed-dev";
import { createStrictTestDb } from "../db/pglite";
import {
  captureLogs,
  fakeQueries,
  REPO_ROOT,
  SAMPLE_POST,
  silenceLogs,
} from "../helpers";

silenceLogs();

function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/** A loader that counts calls and resolves with `value()` (or rejects when it is an Error). */
function counter<T>(value: () => T | Error | null) {
  let calls = 0;
  const loader = async () => {
    calls += 1;
    const v = value();
    if (v instanceof Error) throw v;
    return v;
  };
  return { loader, calls: () => calls };
}

// Lets a background refresh (a microtask chain) finish.
const settle = () => Bun.sleep(0);

describe("createSwrCache (BE-06 criterion 5, PERF-06 criterion 4)", () => {
  test("two consecutive gets call the loader once", async () => {
    const cache = createSwrCache();
    const { loader, calls } = counter(() => ["a"]);
    expect(await cache.get("k", loader)).toEqual(["a"]);
    expect(await cache.get("k", loader)).toEqual(["a"]);
    expect(calls()).toBe(1);
  });

  test("concurrent misses share one load (single flight)", async () => {
    const cache = createSwrCache();
    const { loader, calls } = counter(() => 1);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => cache.get("k", loader)),
    );
    expect(results).toEqual(Array(10).fill(1));
    expect(calls()).toBe(1);
  });

  test("after the fresh window: the stale value at once (<= 5 ms), one background refresh", async () => {
    const time = clock();
    const cache = createSwrCache({ now: time.now });
    let version = 1;
    let release!: () => void;
    let gate: Promise<void> = Promise.resolve();
    const { loader, calls } = counter(() => version);
    const slowLoader = async () => {
      await gate;
      return loader();
    };
    expect(await cache.get("k", slowLoader)).toBe(1);

    time.advance(CACHE_FRESH_MS);
    version = 2;
    gate = new Promise((resolve) => (release = resolve)); // the refresh hangs
    const started = performance.now();
    expect(await cache.get("k", slowLoader)).toBe(1);
    expect(await cache.get("k", slowLoader)).toBe(1); // still stale, no second refresh
    expect(performance.now() - started).toBeLessThanOrEqual(5);

    release();
    await settle();
    await settle();
    expect(calls()).toBe(2); // initial load + exactly one refresh
    expect(await cache.get("k", slowLoader)).toBe(2);
    expect(calls()).toBe(2);
  });

  test("null (unknown slug, draft) is not stored as a value; the miss is remembered for 30 s (PERF-06)", async () => {
    const time = clock();
    const cache = createSwrCache({ now: time.now });
    const { loader, calls } = counter(() => null);
    expect(await cache.get("post:yok", loader)).toBeNull();
    expect(await cache.get("post:yok", loader)).toBeNull();
    expect(calls()).toBe(1);
    expect(cache.size).toBe(0);
    time.advance(CACHE_NEGATIVE_MS - 1);
    expect(await cache.get("post:yok", loader)).toBeNull();
    expect(calls()).toBe(1);
    time.advance(1);
    expect(await cache.get("post:yok", loader)).toBeNull();
    expect(calls()).toBe(2);
  });

  test("a post published while its miss is remembered appears after at most 30 s", async () => {
    const time = clock();
    const cache = createSwrCache({ now: time.now });
    let value: string | null = null;
    const { loader } = counter(() => value);
    expect(await cache.get("post:yeni", loader)).toBeNull();
    value = "post";
    expect(await cache.get("post:yeni", loader)).toBeNull();
    time.advance(CACHE_NEGATIVE_MS);
    expect(await cache.get("post:yeni", loader)).toBe("post");
  });

  test("remembered misses are bounded: random slugs cannot fill the memory", async () => {
    const cache = createSwrCache({ maxMisses: 3 });
    const { loader, calls } = counter(() => null);
    for (const slug of ["a", "b", "c", "d"])
      await cache.get(`post:${slug}`, loader);
    expect(calls()).toBe(4);
    await cache.get("post:a", loader); // the oldest miss was dropped
    expect(calls()).toBe(5);
    await cache.get("post:d", loader); // still remembered
    expect(calls()).toBe(5);
    expect(cache.size).toBe(0);
  });

  test("a refresh that returns null drops the entry (post unpublished)", async () => {
    const time = clock();
    const cache = createSwrCache({ now: time.now });
    let value: string | null = "post";
    const { loader } = counter(() => value);
    await cache.get("post:x", loader);
    time.advance(CACHE_FRESH_MS);
    value = null;
    expect(await cache.get("post:x", loader)).toBe("post"); // stale served once
    await settle();
    expect(cache.keys()).toEqual([]);
    expect(await cache.get("post:x", loader)).toBeNull(); // the remembered miss
  });

  test("stale-if-error: a failed refresh keeps serving the old value, logs a warning, backs off", async () => {
    const time = clock();
    const cache = createSwrCache({ now: time.now });
    let fail = false;
    const { loader, calls } = counter(() =>
      fail
        ? Object.assign(new Error("Failed query: select ..."), {
            cause: Object.assign(new Error("connect ECONNREFUSED"), {
              code: "ECONNREFUSED",
            }),
          })
        : "v1",
    );
    await cache.get("k", loader);
    time.advance(CACHE_FRESH_MS);
    fail = true;
    const { lines } = await captureLogs(async () => {
      expect(await cache.get("k", loader)).toBe("v1");
      await settle();
    });
    const warn = lines.find(
      (l) => l.msg === "cache refresh failed, serving stale",
    );
    expect(warn).toMatchObject({
      level: "warn",
      key: "k",
      errCode: "ECONNREFUSED",
    });
    expect(String(warn?.err)).not.toContain("select"); // driver error, not the SQL
    expect(calls()).toBe(2);

    // Within the back-off window: served, no new attempt.
    expect(await cache.get("k", loader)).toBe("v1");
    await settle();
    expect(calls()).toBe(2);
    // After it: one more attempt.
    time.advance(CACHE_ERROR_RETRY_MS);
    await captureLogs(async () => {
      expect(await cache.get("k", loader)).toBe("v1");
      await settle();
    });
    expect(calls()).toBe(3);
  });

  test("a miss whose load fails rejects (no value to fall back to)", async () => {
    const cache = createSwrCache();
    const { loader } = counter(() => new Error("down"));
    await expect(cache.get("k", loader)).rejects.toThrow("down");
    expect(cache.size).toBe(0);
  });

  test("older than the stale window: the request waits for the query", async () => {
    const time = clock();
    const cache = createSwrCache({ now: time.now });
    let version = 1;
    const { loader } = counter(() => version);
    await cache.get("k", loader);
    time.advance(CACHE_STALE_MS);
    version = 2;
    expect(await cache.get("k", loader)).toBe(2);
  });

  test("LRU: at most maxEntries; the least recently used is evicted first", async () => {
    const cache = createSwrCache({ maxEntries: 3 });
    for (const key of ["a", "b", "c"]) await cache.get(key, async () => key);
    await cache.get("a", async () => "a"); // a becomes most recent
    await cache.get("d", async () => "d");
    expect(cache.keys()).toEqual(["c", "a", "d"]);
    expect(CACHE_MAX_ENTRIES).toBe(200);
  });
});

/** Base query object that records list options and slug lookups. */
function recordingQueries() {
  const lists: ListOptions[] = [];
  const slugs: string[] = [];
  let pings = 0;
  const rows: ListedPost[] = [
    { ...cardOf(SAMPLE_POST), slug: "hello-world", lang: "en" },
    { ...cardOf(SAMPLE_POST), id: 2, slug: "merhaba-dunya", lang: "tr" },
  ];
  const base = fakeQueries({
    listPublishedPosts: async (options: ListOptions = {}) => {
      lists.push(options);
      return rows
        .filter((row) => !options.lang || row.lang === options.lang)
        .filter((row) => !options.missingIn || row.translationKey === null)
        .slice(0, options.limit ?? 20);
    },
    getPublishedPostBySlug: async (slug) => {
      slugs.push(slug);
      return slug === SAMPLE_POST.slug ? SAMPLE_POST : null;
    },
    ping: async () => {
      pings += 1;
    },
  });
  return { base, lists, slugs, pings: () => pings };
}

function cardOf(post: typeof SAMPLE_POST): ListedPost {
  const {
    content: _c,
    translations: _t,
    published: _p,
    seoTitle: _s,
    ...card
  } = post;
  return card;
}

const NO_LIMIT = { RATE_LIMIT_DISABLED: "1" };

describe("withCache: the cached PostQueries (T-06, T-12)", () => {
  test("?lang=en and ?lang=tr each query once, with 'en' / 'tr'; repeats come from memory", async () => {
    const { base, lists } = recordingQueries();
    const cache = createSwrCache();
    const app = createApp({
      queries: withCache(base, { cache }),
      env: NO_LIMIT,
    });
    for (const path of [
      "/api/posts?lang=en",
      "/api/posts?lang=tr",
      "/api/posts?lang=en",
      "/api/posts?lang=tr&limit=1",
    ]) {
      expect((await app.request(path)).status).toBe(200);
    }
    expect(lists.map((o) => o.lang)).toEqual(["en", "tr"]);
    expect(lists.every((o) => o.limit === LIST_CACHE_ROWS)).toBe(true);
    expect(cache.keys().sort()).toEqual(["list:en", "list:tr"]);
  });

  test("?lang=xx makes no query and adds no cache entry", async () => {
    const { base, lists } = recordingQueries();
    const cache = createSwrCache();
    const app = createApp({
      queries: withCache(base, { cache }),
      env: NO_LIMIT,
    });
    expect((await app.request("/api/posts?lang=xx")).status).toBe(400);
    expect(lists).toEqual([]);
    expect(cache.size).toBe(0);
  });

  test("the cached first page is sliced per limit and still yields X-Next-Cursor", async () => {
    const { base, lists } = recordingQueries();
    const app = createApp({ queries: withCache(base), env: NO_LIMIT });
    const first = await app.request("/api/posts?limit=1");
    expect((await first.json()) as unknown[]).toHaveLength(1);
    expect(first.headers.get("x-next-cursor")).toBeTruthy();
    const both = await app.request("/api/posts?limit=2");
    expect((await both.json()) as unknown[]).toHaveLength(2);
    expect(both.headers.get("x-next-cursor")).toBeNull();
    expect(lists).toHaveLength(1);
  });

  test("cursor pages and large server-side reads bypass the cache", async () => {
    const { base, lists } = recordingQueries();
    const cache = createSwrCache();
    const queries = withCache(base, { cache });
    const cursor = { t: "2026-01-01T00:00:00Z", id: 1 };
    await queries.listPublishedPosts({ cursor, limit: 3 });
    await queries.listPublishedPosts({ cursor, limit: 3 });
    await queries.listPublishedPosts({ limit: 500 });
    expect(lists).toHaveLength(3);
    expect(cache.size).toBe(0);
  });

  test("posts: one query per slug; unknown slugs and drafts are not stored, their miss is remembered", async () => {
    const { base, slugs } = recordingQueries();
    const cache = createSwrCache();
    const app = createApp({
      queries: withCache(base, { cache }),
      env: NO_LIMIT,
    });
    for (let i = 0; i < 3; i++) {
      expect((await app.request(`/api/posts/${SAMPLE_POST.slug}`)).status).toBe(
        200,
      );
      expect((await app.request("/api/posts/taslak-ornek")).status).toBe(404);
    }
    expect(slugs.filter((s) => s === SAMPLE_POST.slug)).toHaveLength(1);
    expect(slugs.filter((s) => s === "taslak-ornek")).toHaveLength(1);
    expect(cache.keys()).toEqual([`post:${SAMPLE_POST.slug}`]);
  });

  test("getPostForLocale reuses post:<slug> (no per-locale entry)", async () => {
    const { base, slugs } = recordingQueries();
    const cache = createSwrCache();
    const queries = withCache(base, { cache });
    expect(
      await queries.getPostForLocale(SAMPLE_POST.slug, "en"),
    ).toMatchObject({ status: "ok" });
    expect(await queries.getPostForLocale(SAMPLE_POST.slug, "tr")).toEqual({
      status: "moved",
      locale: "en",
    });
    expect(slugs).toHaveLength(1);
    expect(cache.keys()).toEqual([`post:${SAMPLE_POST.slug}`]);
  });

  // The wrapper never caches ping. /ready itself keeps a result for 1.5 s and
  // shares one in-flight ping (src/api/ready.ts), so the wrapper is asked
  // directly here; the handler's cache is tested in tests/server/api/ready.test.ts.
  test("ping is never cached: every call asks the database", async () => {
    const { base, pings } = recordingQueries();
    const queries = withCache(base);
    for (let i = 0; i < 3; i++) await queries.ping();
    expect(pings()).toBe(3);
  });

  test("the wrapper has exactly the PostQueries methods", () => {
    const { base } = recordingQueries();
    expect(Object.keys(withCache(base)).sort()).toEqual(
      Object.keys(base).sort(),
    );
  });
});

describe("warm-up (PERF-06 step 6)", () => {
  test("loads every list view once and every listed post once", async () => {
    const { base, lists, slugs } = recordingQueries();
    const cache = createSwrCache();
    const queries = withCache(base, { cache });
    const summary = await warmPostCache(queries);
    expect(summary).toMatchObject({ lists: 5, posts: 2 });
    expect(listViews()).toEqual([
      {},
      { lang: "en" },
      { lang: "tr" },
      { lang: "en", missingIn: "tr" },
      { lang: "tr", missingIn: "en" },
    ]);
    expect(lists).toHaveLength(5);
    expect(slugs.sort()).toEqual(["hello-world", "merhaba-dunya"]);
    // merhaba-dunya is unknown to this fake (null): not cached.
    expect(cache.keys().sort()).toEqual([
      "list:all",
      "list:en",
      "list:en:missing-tr",
      "list:tr",
      "list:tr:missing-en",
      "post:hello-world",
    ]);
    // A visitor after the warm-up: no query at all.
    const app = createApp({ queries, env: NO_LIMIT });
    await app.request("/api/posts?lang=en");
    await app.request(`/api/posts/${SAMPLE_POST.slug}`);
    expect(lists).toHaveLength(5);
    expect(slugs).toHaveLength(2);
  });

  test("rejects only after every load settled", async () => {
    let pending = 0;
    let settledAll = false;
    const base: PostQueries = fakeQueries({
      listPublishedPosts: async (options: ListOptions = {}) => {
        pending += 1;
        try {
          if (!options.lang) throw new Error("fast failure");
          await Bun.sleep(20);
          return [];
        } finally {
          pending -= 1;
          settledAll = pending === 0;
        }
      },
    });
    await expect(warmPostCache(withCache(base))).rejects.toThrow(
      "fast failure",
    );
    expect(settledAll).toBe(true);
  });
});

describe("server wiring (BE-06 step 2)", () => {
  test("serverPostQueries: cached by default, POST_CACHE_DISABLED=1 is the emergency switch", () => {
    const base = fakeQueries();
    expect(serverPostQueries(base, {}).cached).toBe(true);
    expect(serverPostQueries(base, {}).queries).not.toBe(base);
    expect(serverPostQueries(base, { POST_CACHE_DISABLED: "1" })).toEqual({
      queries: base,
      cached: false,
    });
  });

  test("server.ts builds the one cached instance and warms it after listening", async () => {
    const source = await Bun.file(`${REPO_ROOT}/server.ts`).text();
    expect(source).toContain("serverPostQueries(createPostQueries(db))");
    expect(source).toMatch(/createApp\(\{\s*queries,/);
    expect(source.indexOf("warmPostCache(queries)")).toBeGreaterThan(
      source.indexOf("Bun.serve("),
    );
    // The pool closes only after the warm-up settled (postgres.js end() quirk).
    expect(source).toMatch(/await warmUp;\s*await closeDb\(5\);/);
  });
});

test("end to end on PGlite: cached list + post, second round without queries", async () => {
  const ctx = await createStrictTestDb();
  try {
    await seedDevPosts(ctx.db);
    const base = createPostQueries(ctx.db);
    const calls: string[] = [];
    const spied: PostQueries = {
      ...base,
      listPublishedPosts: (options) => {
        calls.push("list");
        return base.listPublishedPosts(options);
      },
      getPublishedPostBySlug: (slug) => {
        calls.push(slug);
        return base.getPublishedPostBySlug(slug);
      },
    };
    const app = createApp({ queries: withCache(spied), env: NO_LIMIT });
    for (let round = 0; round < 2; round++) {
      const list = await app.request("/api/posts?lang=tr");
      expect(
        ((await list.json()) as { slug: string }[]).map((p) => p.slug),
      ).toEqual(["merhaba-dunya", "sadece-turkce"]);
      expect((await app.request("/api/posts/merhaba-dunya")).status).toBe(200);
      expect((await app.request("/api/posts/taslak-ornek")).status).toBe(404);
    }
    expect(calls).toEqual([
      "list",
      "merhaba-dunya",
      "taslak-ornek", // a draft is a miss: remembered for 30 s, never stored
    ]);
  } finally {
    await ctx.close();
  }
});
