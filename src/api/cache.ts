// In-process read cache for the post queries (BE-06 / PERF-06, T-06, T-12).
//
// A visitor should never wait for the database: server.ts wraps
// createPostQueries(db) once with withCache(), and the same cached object
// serves the API (/api/posts), the page shell's post lookup (mountSite) and,
// later, the SEO-01 head injection. Cloudflare sits in front of it and
// honours the API's s-maxage (Cache Rule: owner step).
//
// Policy:
//   - fresh 60 s: served from memory, no query;
//   - stale up to 24 h: served at once, one background refresh per key;
//   - older: the request waits for the query;
//   - a failed query serves the last value (stale-if-error), logs a warning
//     and waits 5 s before the next attempt for that key;
//   - null results (unknown slug, draft) are never stored, so random slugs
//     cannot fill the memory and a draft cannot be cached; a refresh that
//     returns null drops the entry (unpublished post -> 404 after a refresh);
//   - at most 200 entries, least recently used evicted first;
//   - ping() is never cached (/ready must ask the database).
//
// Keys (bounded): `list:<all|en|tr>[:missing-<en|tr>]` for the first page of
// every language view (the first LIST_CACHE_ROWS rows, sliced per request),
// `post:<slug>` for published posts. Cursor pages go to the database; they
// are cached at the edge.
import {
  resolveForLocale,
  type ListedPost,
  type ListOptions,
  type Locale,
  type PostQueries,
  type PostWithTranslations,
} from "../db/queries/posts";
import { LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT } from "../db/post-input";
import { LOCALES } from "../seo/site.js";
import { errorFields, log } from "./log";

export const CACHE_FRESH_MS = 60_000;
export const CACHE_STALE_MS = 86_400_000;
export const CACHE_MAX_ENTRIES = 200;
/** A cache load at least this slow is logged at info level. */
export const SLOW_QUERY_MS = 200;
/** After a failed refresh the stale value is served without a new query for this long. */
export const CACHE_ERROR_RETRY_MS = 5_000;

/** The first page of a list view holds this many rows: the HTTP maximum plus the look-ahead row. */
export const LIST_CACHE_ROWS = LIST_MAX_LIMIT + 1;

export interface SwrCacheOptions {
  freshMs?: number;
  staleMs?: number;
  maxEntries?: number;
  errorRetryMs?: number;
  /** Clock in ms (tests pass a fake one). */
  now?: () => number;
}

interface Entry {
  value: unknown;
  fetchedAt: number;
  /** After a failed refresh: no new attempt before this time (a down database is not hammered). */
  retryAt?: number;
}

export interface SwrCache {
  /** Cached value for `key`; `loader` runs on a miss, an expired entry or (in the background) a stale one. */
  get<T>(key: string, loader: () => Promise<T | null>): Promise<T | null>;
  /** Keys in LRU order, least recently used first. */
  keys(): string[];
  readonly size: number;
  clear(): void;
}

/** Stale-while-revalidate LRU map with one in-flight load per key. */
export function createSwrCache({
  freshMs = CACHE_FRESH_MS,
  staleMs = CACHE_STALE_MS,
  maxEntries = CACHE_MAX_ENTRIES,
  errorRetryMs = CACHE_ERROR_RETRY_MS,
  now = Date.now,
}: SwrCacheOptions = {}): SwrCache {
  const entries = new Map<string, Entry>();
  const inflight = new Map<string, Promise<unknown>>();

  const touch = (key: string, entry: Entry) => {
    entries.delete(key);
    entries.set(key, entry);
  };

  const store = (key: string, value: unknown) => {
    touch(key, { value, fetchedAt: now() });
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  };

  const load = <T>(key: string, loader: () => Promise<T | null>) => {
    const running = inflight.get(key) as Promise<T | null> | undefined;
    if (running) return running;
    const started = performance.now();
    let ok = false;
    const promise = (async () => {
      try {
        const value = await loader();
        if (value === null || value === undefined) entries.delete(key);
        else store(key, value);
        ok = true;
        return value ?? null;
      } finally {
        inflight.delete(key);
        // PERF-06 step 7: query time per key for the cold-path root cause;
        // slow loads at info (`outplane logs --search db_query`), the rest at debug.
        const ms = Math.round(performance.now() - started);
        log(ms >= SLOW_QUERY_MS ? "info" : "debug", "db_query", {
          key,
          ms,
          ok,
        });
      }
    })();
    inflight.set(key, promise);
    return promise;
  };

  const staleOnError = (key: string, entry: Entry, error: unknown) => {
    entry.retryAt = now() + errorRetryMs;
    log("warn", "cache refresh failed, serving stale", {
      key,
      ageS: Math.round((now() - entry.fetchedAt) / 1000),
      ...errorFields(driverError(error)),
    });
    return entry.value;
  };

  return {
    async get<T>(key: string, loader: () => Promise<T | null>) {
      const entry = entries.get(key);
      if (!entry) return load(key, loader);

      const at = now();
      const age = at - entry.fetchedAt;
      touch(key, entry);
      if (age < freshMs || (entry.retryAt !== undefined && at < entry.retryAt))
        return entry.value as T;

      if (age < staleMs) {
        // Serve now, refresh once in the background; a failure keeps the entry.
        load(key, loader).catch((error) => staleOnError(key, entry, error));
        return entry.value as T;
      }

      try {
        return await load(key, loader);
      } catch (error) {
        return staleOnError(key, entry, error) as T;
      }
    },
    keys: () => [...entries.keys()],
    get size() {
      return entries.size;
    },
    clear: () => {
      entries.clear();
    },
  };
}

/**
 * The driver error behind a drizzle "Failed query: <sql> params: ..." wrapper,
 * for log lines: the code and message without the SQL text.
 */
export const driverError = (error: unknown): unknown =>
  error instanceof Error && error.cause instanceof Error ? error.cause : error;

export const listCacheKey = (lang?: Locale, missingIn?: Locale): string =>
  `list:${lang ?? "all"}${missingIn ? `:missing-${missingIn}` : ""}`;

export const postCacheKey = (slug: string): string => `post:${slug}`;

export interface WithCacheOptions extends SwrCacheOptions {
  /** Inject the cache (tests inspect its keys). */
  cache?: SwrCache;
}

/**
 * The cached PostQueries: same interface, same results as `queries`, served
 * from the SWR cache (see the policy above). ping() goes straight through.
 */
export function withCache(
  queries: PostQueries,
  { cache = undefined, ...options }: WithCacheOptions = {},
): PostQueries {
  const store = cache ?? createSwrCache(options);

  const getPublishedPostBySlug = (slug: string) =>
    store.get<PostWithTranslations>(postCacheKey(slug), () =>
      queries.getPublishedPostBySlug(slug),
    );

  return {
    listPublishedPosts: async (
      options: ListOptions = {},
    ): Promise<ListedPost[]> => {
      const limit = options.limit ?? LIST_DEFAULT_LIMIT;
      // Cursor pages and larger server-side reads (sitemap) bypass the cache.
      if (options.cursor || limit > LIST_CACHE_ROWS) {
        return queries.listPublishedPosts(options);
      }
      const { lang, missingIn } = options;
      const rows = await store.get(listCacheKey(lang, missingIn), () =>
        queries.listPublishedPosts({ lang, missingIn, limit: LIST_CACHE_ROWS }),
      );
      return (rows ?? []).slice(0, limit);
    },
    getPublishedPostBySlug,
    getPostForLocale: async (slug: string, locale: Locale) =>
      resolveForLocale(await getPublishedPostBySlug(slug), locale),
    ping: (timeoutMs?: number) => queries.ping(timeoutMs),
  };
}

/** Every first-page list view the site requests (T-12): all languages, each language, each "missing translation" group. */
export function listViews(
  locales: readonly Locale[] = LOCALES as readonly Locale[],
): { lang?: Locale; missingIn?: Locale }[] {
  return [
    {},
    ...locales.map((lang) => ({ lang })),
    ...locales.flatMap((lang) =>
      locales
        .filter((other) => other !== lang)
        .map((missingIn) => ({ lang, missingIn })),
    ),
  ];
}

/**
 * Startup warm-up (PERF-06 step 6): loads every list view and every listed
 * post through `queries` (the cached object), so the first visitor after a
 * deploy does not wait for the database. Every load settles before this
 * returns, so no query is left opening a connection; if any failed, it then
 * rejects with the first error (the caller logs it, the cache fills on demand).
 */
export async function warmPostCache(
  queries: PostQueries,
): Promise<{ lists: number; posts: number; ms: number }> {
  const started = performance.now();
  const views = listViews();
  const lists = await Promise.allSettled(
    views.map((view) =>
      queries.listPublishedPosts({ ...view, limit: LIST_CACHE_ROWS }),
    ),
  );
  const slugs = [
    ...new Set(
      lists.flatMap((result) =>
        result.status === "fulfilled"
          ? result.value.map((post) => post.slug)
          : [],
      ),
    ),
  ];
  const posts = await Promise.allSettled(
    slugs.map((slug) => queries.getPublishedPostBySlug(slug)),
  );
  const failed = [...lists, ...posts].find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed) throw failed.reason;
  return {
    lists: views.length,
    posts: slugs.length,
    ms: Math.round(performance.now() - started),
  };
}

/**
 * The query object server.ts uses: cached, unless POST_CACHE_DISABLED=1
 * (emergency switch, like RATE_LIMIT_DISABLED; the edge cache is separate).
 */
export function serverPostQueries(
  base: PostQueries,
  env: Record<string, string | undefined> = process.env,
): { queries: PostQueries; cached: boolean } {
  const disabled = env.POST_CACHE_DISABLED?.trim() === "1";
  return disabled
    ? { queries: base, cached: false }
    : { queries: withCache(base), cached: true };
}
