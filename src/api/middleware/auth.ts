import { Context, Next } from 'hono'

const API_KEY = process.env.BLOG_API_KEY || 'your-secret-key'

export const authMiddleware = async (c: Context, next: Next) => {
  const key = c.req.header('x-api-key')
  if (key !== API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
}
