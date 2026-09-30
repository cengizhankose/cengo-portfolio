import { useEffect, useState } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import MermaidRenderer from "./MermaidRenderer";
import { NotFound } from "../notfound";
import { getPageMeta, localePath, staticLocale } from "../../seo/pages.js";
import { LIVE, matchRoute } from "../../seo/routes.js";
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

// T-12 / SEO-11: a post lives under its own language's path. Returns that
// path when the post was opened under the other language's prefix, else null.
function ownLanguagePath(post, route, slug) {
  const lang = post?.lang;
  if (!lang || lang === route.locale || !LIVE.post.includes(lang)) return null;
  return localePath(lang, `/blog/${post.slug ?? slug}`);
}

const BlogPost = () => {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const route = matchRoute(location.pathname);
  // The fetch result belongs to one slug. Moving to another post starts in the
  // loading state instead of showing the previous post until the fetch ends.
  const [result, setResult] = useState({ slug: null, post: null, error: null });
  const current = result.slug === slug ? result : null;
  const loading = current === null;
  const post = current?.post ?? null;
  const error = current?.error ?? null;
  // Only an API 404 is "not found" (noindex); a network or 5xx error keeps the
  // indexable fallback meta.
  const notFound = error === POST_NOT_FOUND;
  const movedTo = ownLanguagePath(post, route, slug);
  usePageMeta(
    getPageMeta(route, route.locale, notFound ? { notFound: true } : { post }),
  );

  useEffect(() => {
    let active = true;
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
        if (active) setResult({ slug, post: data, error: null });
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to fetch post:", err);
        setResult({ slug, post: null, error: err.message });
      });
    return () => {
      active = false;
    };
  }, [slug]);

  // The server answers the old URL with a 301 (SEO-11); in-app navigation
  // lands here, so the client moves to the same place without a new history
  // entry.
  useEffect(() => {
    if (movedTo) {
      navigate(`${movedTo}${location.search}${location.hash}`, {
        replace: true,
      });
    }
  }, [movedTo, navigate, location.search, location.hash]);

  if (loading || movedTo) return <div className="blog-loading">Loading...</div>;
  if (notFound) return <NotFound variant="post" />;
  if (error || !post) {
    return (
      <div className="blog-error">
        This post could not be loaded. Please try again later.
      </div>
    );
  }

  // Links to static pages stay in a language whose pages are live: the TR
  // post links back to /blog until the TR pages open (SEO-11 step 6).
  const blogPath = localePath(staticLocale(post.lang ?? route.locale), "/blog");

  return (
    <>
      <article className="blog-post-container" lang={post.lang || undefined}>
        <Link to={blogPath} className="blog-back">
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
