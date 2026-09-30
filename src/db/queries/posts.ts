// Shared post queries (T-06). The API routes and, later, the server-side head
// injection / SSR use this one module, so a draft that the API hides can never
// leak through another code path.
//
// This module never imports `src/db/index.ts`: the database is passed in, so
// tests run against an in-process database and callers share one instance.
import { and, desc, eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { posts } from '../schema'

// Any drizzle Postgres database (postgres-js in the app, PGlite in tests).
export type PostsDb = PgDatabase<PgQueryResultHKT, any>

export type Post = typeof posts.$inferSelect

// Single-post lookup. Only published posts are visible (BE-03 / SEC-08): a
// draft and a slug that does not exist must be indistinguishable to callers.
export const buildGetPublishedPostBySlug = (db: PostsDb, slug: string) =>
  db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), eq(posts.published, true)))
    .limit(1)

// Public list: published posts, newest first. Field diet and pagination are
// BE-07; this keeps the current response shape.
export const buildListPublishedPosts = (db: PostsDb) =>
  db.select().from(posts).where(eq(posts.published, true)).orderBy(desc(posts.createdAt))

export function createPostQueries(db: PostsDb) {
  return {
    listPublishedPosts: async (): Promise<Post[]> => buildListPublishedPosts(db),
    getPublishedPostBySlug: async (slug: string): Promise<Post | null> =>
      (await buildGetPublishedPostBySlug(db, slug))[0] ?? null,
  }
}

export type PostQueries = ReturnType<typeof createPostQueries>
