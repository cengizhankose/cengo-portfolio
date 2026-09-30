import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import MermaidRenderer from "./MermaidRenderer";
import { getPageMeta } from "../../seo/pages.js";
import { matchRoute } from "../../seo/routes.js";
import { usePageMeta } from "../../seo/usePageMeta.js";
import "./style.css";

const POST_NOT_FOUND = "Not found";

const formatDate = (dateString) => {
  if (!dateString) return "No date";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid date";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "Invalid date";
  }
};

const BlogPost = () => {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const route = matchRoute(useLocation().pathname);
  // Only an API 404 is "not found" (noindex); a network or 5xx error keeps the
  // indexable fallback meta.
  const notFound = error === POST_NOT_FOUND;
  usePageMeta(
    getPageMeta(route, route.locale, notFound ? { notFound: true } : { post }),
  );

  useEffect(() => {
    const apiUrl = import.meta.env.DEV
      ? import.meta.env.VITE_API_URL || "http://localhost:3001"
      : "";
    fetch(`${apiUrl}/api/posts/${slug}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 404 ? POST_NOT_FOUND : `HTTP ${res.status}`,
          );
        }
        return res.json();
      })
      .then((data) => {
        setPost(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch post:", err);
        setError(err.message);
        setLoading(false);
      });
  }, [slug]);

  if (loading) return <div className="blog-loading">Loading...</div>;
  if (error || !post) return <div className="blog-error">Post not found</div>;

  return (
    <>
      <article className="blog-post-container">
        <Link to="/blog" className="blog-back">
          ← Back to Blog
        </Link>
        {post.coverImage && (
          <img
            src={post.coverImage}
            alt={post.title}
            className="blog-post-cover"
          />
        )}
        <h1 className="blog-post-title-full">{post.title}</h1>
        <time className="blog-post-date">
          Published: {formatDate(post.createdAt)}
          {post.updatedAt && post.updatedAt !== post.createdAt && (
            <span> · Edited: {formatDate(post.updatedAt)}</span>
          )}
        </time>
        <div className="blog-content markdown-body" id="blog-markdown-root">
          <MermaidRenderer content={post.content} />
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
          >
            {post.content}
          </ReactMarkdown>
        </div>
      </article>
    </>
  );
};

export default BlogPost;
