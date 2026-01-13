import { Hono } from 'hono'
import { db } from '../../db'
import { posts } from '../../db/schema'
import { eq, desc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

const app = new Hono()

// GET /api/posts - List all published posts
app.get('/', async (c) => {
  try {
    const allPosts = await db
      .select()
      .from(posts)
      .where(eq(posts.published, true))
      .orderBy(desc(posts.createdAt))
    return c.json(allPosts)
  } catch (error) {
    console.error('Error fetching posts:', error)
    return c.json({ error: 'Failed to fetch posts' }, 500)
  }
})

// GET /api/posts/:slug - Get single post
app.get('/:slug', async (c) => {
  try {
    const slug = c.req.param('slug')
    const post = await db
      .select()
      .from(posts)
      .where(eq(posts.slug, slug))
      .limit(1)

    if (!post.length) {
      return c.json({ error: 'Not found' }, 404)
    }
    return c.json(post[0])
  } catch (error) {
    console.error('Error fetching post:', error)
    return c.json({ error: 'Failed to fetch post' }, 500)
  }
})

// POST /api/posts - Create post (protected)
app.post('/', authMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const newPost = await db.insert(posts).values(body).returning()
    return c.json(newPost[0], 201)
  } catch (error) {
    console.error('Error creating post:', error)
    return c.json({ error: 'Failed to create post' }, 500)
  }
})

// PUT /api/posts/:id - Update post (protected)
app.put('/:id', authMiddleware, async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    const updated = await db
      .update(posts)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(posts.id, id))
      .returning()
    return c.json(updated[0])
  } catch (error) {
    console.error('Error updating post:', error)
    return c.json({ error: 'Failed to update post' }, 500)
  }
})

// DELETE /api/posts/:id - Delete post (protected)
app.delete('/:id', authMiddleware, async (c) => {
  try {
    const id = Number(c.req.param('id'))
    await db.delete(posts).where(eq(posts.id, id))
    return c.json({ success: true })
  } catch (error) {
    console.error('Error deleting post:', error)
    return c.json({ error: 'Failed to delete post' }, 500)
  }
})

export default app
