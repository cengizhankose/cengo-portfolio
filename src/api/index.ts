import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from 'bun'
import postsRouter from './routes/posts'

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
