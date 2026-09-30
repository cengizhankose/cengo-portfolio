import { useEffect } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import MermaidRenderer from "./MermaidRenderer";
import { NotFound } from "../notfound";
import { StatusState } from "../../components/statusstate";
import { usePublishPostTranslations } from "../../components/langswitch/postTranslations";
import { BlogDataScope, usePost } from "../../hooks/usePosts.js";
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
import { formatDate, toDate, toIsoDate } from "../../lib/format.js";
import { errorStatus } from "../../lib/swr.js";
import { getPageMeta } from "../../seo/pages.js";
import { usePageMeta } from "../../seo/usePageMeta.js";
import "./style.css";

// T-12 / SEO-11: a post lives under its own language's path. Returns that
// path when the post was opened under the other language's prefix, else null.
function ownLanguagePath(post, route, slug) {
  const lang = post?.lang;
  if (!lang || lang === route.locale || !LIVE.post.includes(lang)) return null;
  return localePath(lang, `/blog/${post.slug ?? slug}`);
}

// "Edited" only when the post changed on a later day than it was published
// (BE-07: publishedAt, else createdAt for older rows).
function editedDate(post, published) {
  const updated = toDate(post.updatedAt);
  const base = toDate(published);
  if (!updated || !base || updated <= base) return "";
  return formatDate(updated) === formatDate(base) ? "" : toIsoDate(updated);
}

// Two text languages on this page (DSG-19 step 2):
//   the interface (loading, error, back link) speaks useUiLocale(): English
//   on a TR post until the TR pages open, like the header;
//   the <article> speaks the post's own language: its lang attribute, the
//   date labels and the dates (SEO-21: 30 Eylül 2026 on a TR post).
//
// Data: usePost(slug) (T-04, FE-12). Every slug is its own swr key, so a new
// slug starts in 'loading' and a late answer for the previous slug can never
// reach this page. States:
//   loading   placeholder at least one screen high (PERF-16);
//   notfound  API 404 -> NotFound variant "post" (noindex, SEO-08);
//   error     network / 5xx / bad payload: indexable blog meta (W2 handoff),
//             "Try again" (mutate) and the way back to the blog (DSG-20);
//   success   the article.
function BlogPostPage() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const route = useRoute();
  const t = useT();
  const uiLocale = useUiLocale();
  const { post: data, error, status, mutate } = usePost(slug);
  const post = status === "success" ? data : null;
  // Only an API 404 is "not found" (noindex); a network or 5xx error keeps the
  // indexable fallback meta.
  const notFound = status === "notfound";
  const movedTo = ownLanguagePath(post, route, slug);
  usePageMeta(
    getPageMeta(route, route.locale, notFound ? { notFound: true } : { post }),
  );
  // The header's language switcher links to this post's translation.
  usePublishPostTranslations(movedTo ? null : post);

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

  // Links to static pages stay in a language whose pages are live: the TR
  // post links back to /blog until the TR pages open (SEO-11 step 6).
  const blogPath = localePath(
    staticLocale(post?.lang ?? route.locale),
    "/blog",
  );

  if (status === "loading" || movedTo) {
    return (
      <div
        className="blog-loading blog-loading--page"
        role="status"
        lang={uiLocale}
      >
        {t("status.loading")}
      </div>
    );
  }
  if (notFound) return <NotFound variant="post" />;
  if (status === "error") {
    return (
      <StatusState
        role="alert"
        lang={uiLocale}
        className="blog-error"
        title={t("status.postError")}
        message={t(
          errorStatus(error) === "network" ? "status.network" : "status.server",
        )}
        onRetry={() => mutate()}
        actions={[{ to: blogPath, label: t("post.backToBlog") }]}
      />
    );
  }

  const lang = LOCALES.includes(post.lang) ? post.lang : route.locale;
  const publishedValue = post.publishedAt ?? post.createdAt;
  const published = toIsoDate(publishedValue);
  const edited = editedDate(post, publishedValue);

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
            <time dateTime={published}>{formatDate(publishedValue, lang)}</time>
            {edited && (
              <>
                {" · "}
                {translate(lang, "post.edited")}{" "}
                <time dateTime={edited}>{formatDate(edited, lang)}</time>
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
}

const BlogPost = () => (
  <BlogDataScope>
    <BlogPostPage />
  </BlogDataScope>
);

export default BlogPost;
