import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
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

const BlogPost = () => {
  const { slug } = useParams()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
    fetch(`${apiUrl}/api/posts/${slug}`)
      .then(res => {
        if (!res.ok) throw new Error('Not found')
        return res.json()
      })
      .then(data => {
        setPost(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch post:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [slug])

  if (loading) return <div className="blog-loading">Loading...</div>
  if (error || !post) return <div className="blog-error">Post not found</div>

  return (
    <>
      <Helmet>
        <title>{post.title} | Cengizhan Köse</title>
        <meta name="description" content={post.excerpt || post.title} />
      </Helmet>
      <article className="blog-post-container">
        <Link to="/blog" className="blog-back">← Back to Blog</Link>
        {post.coverImage && (
          <img src={post.coverImage} alt={post.title} className="blog-post-cover" />
        )}
        <h1 className="blog-post-title-full">{post.title}</h1>
        <time className="blog-post-date">
          Published: {formatDate(post.createdAt)}
          {post.updatedAt && post.updatedAt !== post.createdAt && (
            <span> · Edited: {formatDate(post.updatedAt)}</span>
          )}
        </time>
        <div className="blog-content markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
          >
            {post.content}
          </ReactMarkdown>
        </div>
      </article>
    </>
  )
}

export default BlogPost
