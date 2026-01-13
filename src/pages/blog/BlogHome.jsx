import React, { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import './style.css'

const formatDate = (dateString) => {
  if (!dateString) return 'No date'
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Invalid date'
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  } catch {
    return 'Invalid date'
  }
}

const BlogHome = () => {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
    fetch(`${apiUrl}/api/posts`)
      .then(res => res.json())
      .then(data => {
        setPosts(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch posts:', err)
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="blog-loading">Loading...</div>

  return (
    <>
      <Helmet>
        <title>Blog | Cengizhan Köse</title>
        <meta name="description" content="Thoughts, tutorials, and insights" />
      </Helmet>
      <div className="blog-container">
        <h1 className="blog-title">Blog</h1>
        {posts.length === 0 ? (
          <p className="blog-empty">No posts yet. Check back soon!</p>
        ) : (
          <div className="blog-grid">
            {posts.map(post => (
              <article key={post.id} className="blog-card">
                {post.coverImage && (
                  <img src={post.coverImage} alt={post.title} className="blog-cover" />
                )}
                <h2 className="blog-post-title">
                  <Link to={`/blog/${post.slug}`}>{post.title}</Link>
                </h2>
                {post.excerpt && <p className="blog-excerpt">{post.excerpt}</p>}
                <time className="blog-date">
                  {formatDate(post.createdAt)}
                </time>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export default BlogHome
