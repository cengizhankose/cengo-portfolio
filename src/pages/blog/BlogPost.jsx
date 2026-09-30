import { useEffect, useState } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import MermaidRenderer from "./MermaidRenderer";
import { NotFound } from "../notfound";
import { usePublishPostTranslations } from "../../components/langswitch/postTranslations";
import {
  LIVE,
  LOCALES,
  localePath,
  staticLocale,
  translate,
  useRoute,
  useT,
  useUiLocale,
} from "../../i18n";
import { getJson } from "../../lib/api.js";
import { formatDate, toIsoDate } from "../../lib/format.js";
import { getPageMeta } from "../../seo/pages.js";
import { usePageMeta } from "../../seo/usePageMeta.js";
import "./style.css";

const POST_NOT_FOUND = "Not found";

// T-12 / SEO-11: a post lives under its own language's path. Returns that
// path when the post was opened under the other language's prefix, else null.
function ownLanguagePath(post, route, slug) {
  const lang = post?.lang;
  if (!lang || lang === route.locale || !LIVE.post.includes(lang)) return null;
  return localePath(lang, `/blog/${post.slug ?? slug}`);
}

// Two text languages on this page (DSG-19 step 2):
//   the interface (loading, error, back link) speaks useUiLocale(): English
//   on a TR post until the TR pages open, like the header;
//   the <article> speaks the post's own language: its lang attribute, the
//   date labels and the dates (SEO-21: 30 Eylül 2026 on a TR post).
const BlogPost = () => {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const route = useRoute();
  const t = useT();
  const uiLocale = useUiLocale();
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
  // The header's language switcher links to this post's translation.
  usePublishPostTranslations(movedTo ? null : post);

  useEffect(() => {
    const controller = new AbortController();
    getJson(`/posts/${encodeURIComponent(slug)}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult({ slug, post: data, error: null });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch post:", err);
        setResult({
          slug,
          post: null,
          error: err?.status === 404 ? POST_NOT_FOUND : String(err?.message),
        });
      });
    return () => controller.abort();
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

  if (loading || movedTo) {
    return <div className="blog-loading">{t("status.loading")}</div>;
  }
  if (notFound) return <NotFound variant="post" />;
  if (error || !post) {
    return <div className="blog-error">{t("post.loadError")}</div>;
  }

  const lang = LOCALES.includes(post.lang) ? post.lang : route.locale;
  const published = toIsoDate(post.createdAt);
  const edited =
    post.updatedAt && post.updatedAt !== post.createdAt
      ? toIsoDate(post.updatedAt)
      : "";
  // Links to static pages stay in a language whose pages are live: the TR
  // post links back to /blog until the TR pages open (SEO-11 step 6).
  const blogPath = localePath(staticLocale(lang), "/blog");

  return (
    <div className="blog-post-container" lang={uiLocale}>
      <Link to={blogPath} className="blog-back">
        <span aria-hidden="true">←</span> {t("post.backToBlog")}
      </Link>
      <article className="blog-post" lang={lang}>
        {post.coverImage && (
          <img
            src={post.coverImage}
            alt={post.title}
            className="blog-post-cover"
          />
        )}
        <h1 className="blog-post-title-full">{post.title}</h1>
        {published && (
          <p className="blog-post-date">
            {translate(lang, "post.published")}{" "}
            <time dateTime={published}>{formatDate(post.createdAt, lang)}</time>
            {edited && (
              <>
                {" · "}
                {translate(lang, "post.edited")}{" "}
                <time dateTime={edited}>
                  {formatDate(post.updatedAt, lang)}
                </time>
              </>
            )}
          </p>
        )}
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
    </div>
  );
};

export default BlogPost;
