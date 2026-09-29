#!/usr/bin/env -S PATH="$HOME/.bun/bin:$PATH" bun
import postgres from 'postgres'
import { readFileSync } from 'fs'

const sql = postgres(process.env.PG_CONNECTION_URL, { max: 1 })

const content = readFileSync('/Users/logan/.hermes/cache/blog-steward-laya.md', 'utf8')

const slug = 'atlas-steward-laya-konustan-yarim-is-cikaran-sistem'
const title = 'Konuşmadan yarım iş çıkaran sistem: Atlas Steward ve Laya'
const excerpt = 'Hermes konuşmalarından yarım işleri çıkaran Atlas Steward\'ı ve karar modeli Laya\'yı anlatan teknik bir yazı: boru hattı, fail-closed tasarım, gerçek bir hata vakası ve mermaid diyagramlar.'

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
