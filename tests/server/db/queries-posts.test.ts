// BE-03 / SEC-08 / T-06: the shared post query module.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Glob } from 'bun'
import { drizzle } from 'drizzle-orm/postgres-js'
import { posts } from '../../../src/db/schema'
import {
  buildGetPublishedPostBySlug,
  buildListPublishedPosts,
  createPostQueries,
} from '../../../src/db/queries/posts'
import { createTestDb, REPO_ROOT } from './pglite'

describe('generated SQL (drizzle.mock, no database)', () => {
  const mockDb = drizzle.mock()

  test('single-post lookup filters on published', () => {
    const { sql, params } = buildGetPublishedPostBySlug(mockDb, 'x').toSQL()
    expect(sql).toContain('"posts"."slug" = $')
    expect(sql).toContain('"posts"."published" = $')
    expect(params).toEqual(['x', true, 1])
  })

  test('list filters on published and orders newest first', () => {
    const { sql } = buildListPublishedPosts(mockDb).toSQL()
    expect(sql).toContain('"posts"."published" = $')
    expect(sql).toContain('order by "posts"."created_at" desc')
  })
})

describe('createPostQueries against Postgres (PGlite)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>
  let queries: ReturnType<typeof createPostQueries>

  beforeAll(async () => {
    ctx = await createTestDb()
    queries = createPostQueries(ctx.db)
    await ctx.db.insert(posts).values([
      { slug: 'older', title: 'Older', content: 'a', published: true, createdAt: new Date('2026-01-01T00:00:00Z') },
      { slug: 'newer', title: 'Newer', content: 'b', published: true, createdAt: new Date('2026-02-01T00:00:00Z') },
      { slug: 'draft', title: 'Draft', content: 'c', published: false, createdAt: new Date('2026-03-01T00:00:00Z') },
      // published defaults to false in the schema: a row without the flag is a draft too
      { slug: 'implicit-draft', title: 'Implicit', content: 'd' },
    ])
  })

  afterAll(async () => {
    await ctx.close()
  })

  test('getPublishedPostBySlug returns a published post', async () => {
    const post = await queries.getPublishedPostBySlug('newer')
    expect(post?.slug).toBe('newer')
    expect(post?.published).toBe(true)
  })

  test('drafts and unknown slugs are both null', async () => {
    expect(await queries.getPublishedPostBySlug('draft')).toBeNull()
    expect(await queries.getPublishedPostBySlug('implicit-draft')).toBeNull()
    expect(await queries.getPublishedPostBySlug('does-not-exist')).toBeNull()
  })

  test('slug input is a bound parameter, not SQL', async () => {
    expect(await queries.getPublishedPostBySlug("x' OR '1'='1")).toBeNull()
  })

  test('listPublishedPosts hides drafts and sorts newest first', async () => {
    const list = await queries.listPublishedPosts()
    expect(list.map((p) => p.slug)).toEqual(['newer', 'older'])
  })
})

test('single-post slug query exists only in the shared module (T-06)', async () => {
  const hits: string[] = []
  for (const pattern of ['src/**/*.{ts,tsx,js,jsx}', 'server.ts']) {
    for await (const file of new Glob(pattern).scan({ cwd: REPO_ROOT })) {
      const text = await Bun.file(`${REPO_ROOT}/${file}`).text()
      if (text.includes('eq(posts.slug')) hits.push(file)
    }
  }
  expect(hits).toEqual(['src/db/queries/posts.ts'])
})
