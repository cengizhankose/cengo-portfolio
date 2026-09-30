import { Hono } from 'hono'
import { serve } from 'bun'
import { join } from 'node:path'
import postsRouter from './src/api/routes/posts'
import { mountSite } from './src/server/static'

const app = new Hono()

app.route('/api/posts', postsRouter)

app.get('/health', (c) => c.json({ status: 'ok' }))

// Site: static files, HTML with ETag + no-cache, 404 for missing files, SPA shell fallback
mountSite(app, { distDir: join(import.meta.dir, 'dist') })

const port = Number(process.env.PORT) || 3000
serve({ fetch: app.fetch, port })
console.log(`portfolio+api server running on http://localhost:${port}`)
