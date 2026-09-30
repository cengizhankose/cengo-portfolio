// Shared post queries (T-06). The API routes and, later, the server-side head
// injection / SSR use this one module, so a draft that the API hides can never
// leak through another code path.
//
// This module never imports `src/db/index.ts`: the database is passed in, so
// tests run against an in-process database and callers share one instance.
import {
  and,
  asc,
  desc,
  eq,
  isNull,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import {
  alias,
  type PgDatabase,
  type PgQueryResultHKT,
} from "drizzle-orm/pg-core";
import {
  encodeCursor,
  LIST_DEFAULT_LIMIT,
  type ListCursor,
} from "../post-input";
import { posts, type PostDiagrams, type PostLang } from "../schema";

// Any drizzle Postgres database (postgres-js in the app, PGlite in tests).
export type PostsDb = PgDatabase<PgQueryResultHKT, any>;

export type Post = typeof posts.$inferSelect;
export type Locale = PostLang;

/** A published translation of a post (T-12): the same `translation_key` in another language. */
export interface PostTranslation {
  lang: Locale;
  slug: string;
}

/**
 * Single-post payload: the row plus its published translations (hreflang,
 * language switch). `diagrams` (PERF-05) is an object, `{}` for a post that has
 * none (the column is null until a post is published again with the CLI); the
 * key is optional in the type only so that fixtures written before the column
 * existed still type-check. Lists never carry it (PERF-15: cards only).
 */
export type PostWithTranslations = Omit<Post, "diagrams"> & {
  diagrams?: PostDiagrams;
  translations: PostTranslation[];
};

/** Result of looking a slug up under a locale route prefix (T-12). */
export type LocaleResolution =
  | { status: "missing" }
  | { status: "ok"; post: PostWithTranslations }
  | { status: "moved"; locale: Locale };

/** `/ready` gives the database this long to answer `select 1` (BE-20). */
export const PING_TIMEOUT_MS = 2000;

// Single-post lookup. Only published posts are visible (BE-03 / SEC-08): a
// draft and a slug that does not exist must be indistinguishable to callers.
// Slugs are unique across languages, so the lookup ignores the locale.
export const buildGetPublishedPostBySlug = (db: PostsDb, slug: string) =>
  db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), eq(posts.published, true)))
    .limit(1);

// Card fields (BE-07 / PERF-15, T-12): everything a list item, the /blog
// snapshot and the sitemap (updatedAt) need; never content.
export const CARD_COLUMNS = {
  id: posts.id,
  slug: posts.slug,
  title: posts.title,
  excerpt: posts.excerpt,
  coverImage: posts.coverImage,
  createdAt: posts.createdAt,
  updatedAt: posts.updatedAt,
  publishedAt: posts.publishedAt,
  lang: posts.lang,
  translationKey: posts.translationKey,
};

export type PostCard = Pick<Post, keyof typeof CARD_COLUMNS>;

/** The JSON keys of a GET /api/posts item, in response order. */
export const CARD_FIELDS = Object.freeze(
  Object.keys(CARD_COLUMNS) as (keyof PostCard)[],
);

/**
 * A list row: the card plus `cursor`, the opaque keyset position after it
 * (what X-Next-Cursor carries when this row ends a page). The HTTP layer
 * sends only the card fields.
 */
export type ListedPost = PostCard & { cursor?: string };

export interface ListOptions {
  /** Rows to return (default 20). The HTTP layer caps it at 50; server callers may ask for more. */
  limit?: number;
  /** Continue after this row (keyset: created_at DESC, id DESC). */
  cursor?: ListCursor;
  /** Only posts in this language (T-12). */
  lang?: Locale;
  /** Only posts without a published translation in this language (T-12 "other language" group). */
  missingIn?: Locale;
}

// Exact created_at as UTC ISO text with microseconds, for the cursor.
const CURSOR_AT = sql<string>`to_char(${posts.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

// Public list: published posts, newest first, card fields only (BE-07).
// Keyset pagination on (created_at, id); T-12 indexes cover both the
// per-language and the language-less query.
export const buildListPublishedPosts = (
  db: PostsDb,
  { limit = LIST_DEFAULT_LIMIT, cursor, lang, missingIn }: ListOptions = {},
) => {
  const p2 = alias(posts, "p2");
  return db
    .select({ ...CARD_COLUMNS, cursorAt: CURSOR_AT })
    .from(posts)
    .where(
      and(
        eq(posts.published, true),
        lang ? eq(posts.lang, lang) : undefined,
        missingIn
          ? or(
              isNull(posts.translationKey),
              notExists(
                db
                  .select({ x: sql`1` })
                  .from(p2)
                  .where(
                    and(
                      eq(p2.translationKey, posts.translationKey),
                      eq(p2.lang, missingIn),
                      eq(p2.published, true),
                    ),
                  ),
              ),
            )
          : undefined,
        cursor
          ? sql`(${posts.createdAt}, ${posts.id}) < (${cursor.t}::timestamptz, ${cursor.id})`
          : undefined,
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit);
};

// Published translations of a post: same translation_key, another row (T-12).
export const buildListTranslations = (
  db: PostsDb,
  post: { id: number; translationKey: string },
) =>
  db
    .select({ lang: posts.lang, slug: posts.slug })
    .from(posts)
    .where(
      and(
        eq(posts.translationKey, post.translationKey),
        eq(posts.published, true),
        ne(posts.id, post.id),
      ),
    )
    .orderBy(asc(posts.lang));

/**
 * Pure T-12 routing rule: can `post` be served under the `locale` route prefix?
 * `moved` means it exists in another language (the shell answers 301 to that
 * language's path); `missing` covers drafts and unknown slugs alike.
 */
export function resolveForLocale(
  post: PostWithTranslations | null,
  locale: Locale,
): LocaleResolution {
  if (!post) return { status: "missing" };
  if (post.lang === locale) return { status: "ok", post };
  return { status: "moved", locale: post.lang };
}

/** Rejects when `promise` has not settled within `ms`; the timer never keeps the process alive. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} timed out after ${ms} ms`)),
      ms,
    );
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createPostQueries(db: PostsDb) {
  const getPublishedPostBySlug = async (
    slug: string,
  ): Promise<PostWithTranslations | null> => {
    const [post] = await buildGetPublishedPostBySlug(db, slug);
    if (!post) return null;
    const translations = post.translationKey
      ? await buildListTranslations(db, {
          id: post.id,
          translationKey: post.translationKey,
        })
      : [];
    return { ...post, diagrams: post.diagrams ?? {}, translations };
  };

  return {
    /** Published cards, newest first; each row carries its keyset `cursor`. */
    listPublishedPosts: async (
      options: ListOptions = {},
    ): Promise<ListedPost[]> => {
      const rows = await buildListPublishedPosts(db, options);
      return rows.map(({ cursorAt, ...card }) => ({
        ...card,
        cursor: encodeCursor({ t: cursorAt, id: card.id }),
      }));
    },
    getPublishedPostBySlug,
    getPostForLocale: async (
      slug: string,
      locale: Locale,
    ): Promise<LocaleResolution> =>
      resolveForLocale(await getPublishedPostBySlug(slug), locale),
    /** Readiness probe (BE-20): resolves once the database answers `select 1`. */
    ping: async (timeoutMs: number = PING_TIMEOUT_MS): Promise<void> => {
      await withTimeout(
        Promise.resolve(db.execute(sql`select 1`)),
        timeoutMs,
        "database ping",
      );
    },
  };
}

export type PostQueries = ReturnType<typeof createPostQueries>;
