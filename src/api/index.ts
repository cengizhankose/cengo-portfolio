// Local development API (`bun run api`). Production is served by server.ts.
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from 'bun'
import { assertNonProdDb } from '../db/guard'

// Refuse a non-local database before the DB module is loaded (BE-04 / SEC-06).
try {
  assertNonProdDb()
} catch (error) {
  console.error(`[api] ${(error as Error).message}`)
  process.exit(1)
}

const { default: postsRouter } = await import('./routes/posts')

const app = new Hono()

app.use('*', cors())

app.route('/api/posts', postsRouter)

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }))

const port = Number(process.env.API_PORT) || 3001

serve({
  fetch: app.fetch,
  port,
})

console.log(`API server running on http://localhost:${port}`)
