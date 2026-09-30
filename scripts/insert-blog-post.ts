#!/usr/bin/env -S PATH="$HOME/.bun/bin:$PATH" bun
import postgres from 'postgres'
import { readFileSync } from 'fs'
import { assertNonProdDb } from '../src/db/guard'

// Local dev DB only unless `--prod` is passed, and then only inside
// `outplane env run` so the production URL never lands on disk (BE-04 / SEC-06).
const url = process.env.PG_CONNECTION_URL
assertNonProdDb(url)

const sql = postgres(url!, { max: 1 })

const draft = readFileSync('/Users/logan/.hermes/cache/blog-steward-laya-v2.md', 'utf8')
const [heading, ...body] = draft.split('\n')
if (!heading.startsWith('# ') || body.length === 0) throw new Error('Blog draft is missing its title or body')
// The site renders the post title separately; exclude it and the internal review report.
const content = body.join('\n').split('<!-- FEEDBACK UYGULAMA RAPORU')[0].trim()
if ((content.match(/```mermaid/g) || []).length !== 5) throw new Error('Expected five Mermaid diagrams in v2')

const slug = 'atlas-steward-laya-konustan-yarim-is-cikaran-sistem'
const title = heading.slice(2).trim()
const excerpt = 'Atlas Steward konuşmalardaki yarım işleri nasıl yakalıyor? Yerel karar modeli Laya, gerçek arıza hikâyeleri ve System 1 / System 2 yaklaşımı.'

// upsert by slug
const existing = await sql`SELECT id FROM posts WHERE slug = ${slug}`
if (existing.length) {
  await sql`
    UPDATE posts
    SET title = ${title}, content = ${content}, excerpt = ${excerpt},
        published = true, updated_at = now()
    WHERE slug = ${slug}
  `
  console.log('updated post id:', existing[0].id)
} else {
  const [row] = await sql`
    INSERT INTO posts (slug, title, content, excerpt, published)
    VALUES (${slug}, ${title}, ${content}, ${excerpt}, true)
    RETURNING id
  `
  console.log('inserted post id:', row.id)
}

const all = await sql`SELECT id, slug, published FROM posts ORDER BY id`
console.log(all)
await sql.end()
