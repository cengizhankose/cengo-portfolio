import { Hono } from 'hono'
import { serve } from 'bun'
import postsRouter from './src/api/routes/posts'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'

const app = new Hono()

app.route('/api/posts', postsRouter)

app.get('/health', (c) => c.json({ status: 'ok' }))

// SPA: static assets + index.html fallback
const distDir = join(import.meta.dir, 'dist')
const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
}

app.get('*', (c) => {
  const url = new URL(c.req.url)
  let filePath = join(distDir, url.pathname)

  // path traversal guard
  if (!filePath.startsWith(distDir)) return c.text('Not found', 404)

  if (!existsSync(filePath) || (extname(filePath) === '' && !filePath.endsWith('.html'))) {
    const indexCandidate = extname(filePath) === '' ? join(filePath, 'index.html') : filePath
    filePath = existsSync(indexCandidate) ? indexCandidate : join(distDir, 'index.html')
  }

  if (!existsSync(filePath)) return c.text('Not found', 404)

  const ext = extname(filePath)
  const body = readFileSync(filePath)
  const headers: Record<string, string> = { 'Content-Type': mimeTypes[ext] ?? 'application/octet-stream' }
  if (url.pathname.startsWith('/assets/')) headers['Cache-Control'] = 'public, max-age=31536000, immutable'
  return new Response(body, { headers })
})

const port = Number(process.env.PORT) || 3000
serve({ fetch: app.fetch, port })
console.log(`portfolio+api server running on http://localhost:${port}`)
