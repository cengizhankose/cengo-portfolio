import { Link } from "react-router-dom";
import { StatusState } from "../../components/statusstate";
import { BlogDataScope, useBlogIndex } from "../../hooks/usePosts.js";
import {
  localePath,
  useLocale,
  useLocalePath,
  useRoute,
  useT,
} from "../../i18n";
import { formatDate, toIsoDate } from "../../lib/format.js";
import { groupPostsForLocale, postLanguage } from "../../lib/postGroups.js";
import { errorStatus } from "../../lib/swr.js";
import { getPageMeta } from "../../seo/pages.js";
import { usePageMeta } from "../../seo/usePageMeta.js";
import "./style.css";

// Kept as an export for callers and tests: the grouping rule itself lives in
// src/lib/postGroups.js, shared with the server snapshot (SEO-01), so the raw
// HTML and this page always list the same posts in the same groups.
export const groupPosts = groupPostsForLocale;

// One post card. The card carries the post's language (lang); the date is
// written in the page's language (SEO-21 step 3), so it gets its own `lang`
// when the two differ. The link goes to the post's own language path.
function PostCard({ post, locale, heading: Heading, t }) {
  const lang = postLanguage(post);
  const foreign = lang !== locale;
  // BE-07: a list item's date is when it was published, the creation date
  // for rows from before the publishedAt column.
  const date = post.publishedAt ?? post.createdAt;
  const iso = toIsoDate(date);

  return (
    <article className="blog-card" lang={lang}>
      {post.coverImage && (
        <img src={post.coverImage} alt={post.title} className="blog-cover" />
      )}
      <Heading className="blog-post-title">
        <Link to={localePath(lang, `/blog/${post.slug}`)}>{post.title}</Link>
        {foreign && (
          <>
            {" "}
            <span className="lang-badge" aria-hidden="true">
              {lang.toUpperCase()}
            </span>
            <span className="visually-hidden" lang={locale}>
              {" "}
              {t("blog.inOtherLanguage")}
            </span>
          </>
        )}
      </Heading>
      {post.excerpt && <p className="blog-excerpt">{post.excerpt}</p>}
      {iso && (
        <time
          className="blog-date"
          dateTime={iso}
          lang={foreign ? locale : undefined}
        >
          {formatDate(date, locale)}
        </time>
      )}
    </article>
  );
}

// The blog index (FE-12, FE-03, ANL-15, DSG-20). Four states from
// useBlogIndex (T-04), each under the page's own "Blog" heading:
//   loading  a placeholder that keeps the page's height (PERF-16);
//   error    what failed, "Try again" (refetches only what failed) and a
//            way home; never shown as "No posts yet";
//   success  the two language groups (T-12), or the empty state when both
//            lists are empty (links to Home and Contact). If only the other
//            language's group failed, the page's own posts stay and that
//            group gets its own inline error and "Try again".
// Meta is written before any branch, so every state has the blog title.
function BlogHomePage() {
  const route = useRoute();
  const locale = useLocale();
  const t = useT();
  const lp = useLocalePath();
  usePageMeta(getPageMeta(route, route.locale));
  const { posts, status, error, retry, otherError } = useBlogIndex(locale);
  const reason = (failure) =>
    t(errorStatus(failure) === "network" ? "status.network" : "status.server");

  const { own, other } = groupPostsForLocale(posts, locale);
  const empty = status === "success" && own.length === 0 && other.length === 0;

  return (
    <div className="blog-container">
      <h1 className="blog-title">{t("blog.title")}</h1>
      {status === "loading" && (
        <div className="blog-loading" role="status">
          {t("status.loading")}
        </div>
      )}
      {status === "error" && (
        <StatusState
          headingLevel={2}
          role="alert"
          className="blog-error"
          title={t("blog.loadError")}
          message={reason(error)}
          onRetry={retry}
          actions={[{ to: lp("/"), label: t("blog.home") }]}
        />
      )}
      {empty && (
        <StatusState
          headingLevel={2}
          className="blog-empty"
          title={t("blog.empty")}
          message={t("blog.emptyText")}
          actions={[
            { to: lp("/"), label: t("blog.home") },
            { to: lp("/contact"), label: t("blog.contact") },
          ]}
        />
      )}
      {own.length > 0 && (
        <div className="blog-grid">
          {own.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              locale={locale}
              heading="h2"
              t={t}
            />
          ))}
        </div>
      )}
      {otherError && (
        <StatusState
          headingLevel={2}
          role="alert"
          className="blog-other-error"
          title={t("blog.otherLoadError")}
          message={reason(otherError)}
          onRetry={retry}
        />
      )}
      {other.length > 0 && (
        <section className="blog-other" aria-labelledby="other-lang">
          <h2 id="other-lang" className="blog-other__title">
            {t("blog.otherLanguage")}
          </h2>
          <div className="blog-grid">
            {other.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                locale={locale}
                heading="h3"
                t={t}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const BlogHome = () => (
  <BlogDataScope>
    <BlogHomePage />
  </BlogDataScope>
);

export default BlogHome;
