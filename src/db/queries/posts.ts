// Shared post queries (T-06). The API routes and, later, the server-side head
// injection / SSR use this one module, so a draft that the API hides can never
// leak through another code path.
//
// This module never imports `src/db/index.ts`: the database is passed in, so
// tests run against an in-process database and callers share one instance.
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { posts, type PostLang } from "../schema";

// Any drizzle Postgres database (postgres-js in the app, PGlite in tests).
export type PostsDb = PgDatabase<PgQueryResultHKT, any>;

export type Post = typeof posts.$inferSelect;
export type Locale = PostLang;

/** A published translation of a post (T-12): the same `translation_key` in another language. */
export interface PostTranslation {
  lang: Locale;
  slug: string;
}

/** Single-post payload: the row plus its published translations (hreflang, language switch). */
export type PostWithTranslations = Post & { translations: PostTranslation[] };

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

// Public list: published posts, newest first. Field diet, pagination and the
// `?lang` / `missingIn` filters are BE-07; this keeps the current response shape.
export const buildListPublishedPosts = (db: PostsDb) =>
  db
    .select()
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.createdAt));

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
    return { ...post, translations };
  };

  return {
    listPublishedPosts: async (): Promise<Post[]> =>
      buildListPublishedPosts(db),
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
