import styles from "./latestposts.module.css";
import { Container } from "react-bootstrap";
import { Link } from "react-router-dom";
import { BlogDataScope, useBlogIndex } from "../../hooks/usePosts.js";
import { localePath, useLocale, useLocalePath, useT } from "../../i18n";
import { formatDate, toIsoDate } from "../../lib/format.js";
import { groupPostsForLocale, postLanguage } from "../../lib/postGroups.js";

// How many posts the home page lists (MKT-03, SEO-17: the latest three).
export const LATEST_POSTS = 3;

// The posts the block lists, in the T-12 order: the page language's posts
// first, then posts of another language that have no translation among them
// (shown with a language badge). Same grouping rule as the /blog index.
export function latestPosts(posts, locale, limit = LATEST_POSTS) {
  const { own, other } = groupPostsForLocale(posts, locale);
  return [...own, ...other].slice(0, limit);
}

function LatestPost({ post, locale, t }) {
  const lang = postLanguage(post);
  const foreign = lang !== locale;
  const href = localePath(lang, `/blog/${post.slug}`);
  // A list item's date is when it was published, the creation date for rows
  // from before the publishedAt column (BE-07).
  const date = post.publishedAt ?? post.createdAt;
  const iso = toIsoDate(date);
  return (
    <article className={styles.post} lang={lang}>
      <h3 className={`h5 ${styles.postTitle}`}>
        <Link to={href}>{post.title}</Link>
        {foreign && (
          <>
            {" "}
            <span className={styles.badge} aria-hidden="true">
              {lang.toUpperCase()}
            </span>
            <span className="visually-hidden" lang={locale}>
              {" "}
              {t("blog.inOtherLanguage")}
            </span>
          </>
        )}
      </h3>
      {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}
      {iso && (
        <time
          className={styles.date}
          dateTime={iso}
          lang={foreign ? locale : undefined}
        >
          {formatDate(date, locale)}
        </time>
      )}
      {/* The title is the accessible link; this one is a second target for
          the pointer with the same destination, so it stays out of the
          keyboard order and the accessibility tree. */}
      <p className={styles.read}>
        <Link to={href} tabIndex={-1} aria-hidden="true">
          {t("home.readPost")} <span aria-hidden="true">→</span>
        </Link>
      </p>
    </article>
  );
}

function LatestPostsSection() {
  const locale = useLocale();
  const t = useT();
  const lp = useLocalePath();
  const { posts, status } = useBlogIndex(locale);
  // Nothing is drawn while the list loads, when the API failed, or when there
  // are no posts: the home page never shows an error or a skeleton for a block
  // that is not its main content (FE-03, MKT-03, SEO-17). `status` is only
  // "success" for an array; usePosts has already turned any other answer into
  // an error.
  const items = status === "success" ? latestPosts(posts, locale) : [];
  if (items.length === 0) return null;

  return (
    <section
      id="blog"
      className={`${styles.section} section-gap`}
      aria-labelledby="home-blog-title"
    >
      <Container>
        <h2 className="h3 py-4" id="home-blog-title">
          {t("home.latestWriting")}
        </h2>
        <div className={styles.posts}>
          {items.map((post) => (
            <LatestPost key={post.id} post={post} locale={locale} t={t} />
          ))}
        </div>
        <p className={styles.more}>
          <Link to={lp("/blog")}>
            {t("home.allPosts")} <span aria-hidden="true">→</span>
          </Link>
        </p>
      </Container>
    </section>
  );
}

// "Latest writing" (MKT-03, SEO-17): the latest three posts, read through the
// blog's swr hooks under the same keys as the /blog index, so the data the
// server writes into the page (src/lib/swrFallback.js) is shown on the first
// render without a request.
export function LatestPosts() {
  return (
    <BlogDataScope>
      <LatestPostsSection />
    </BlogDataScope>
  );
}
