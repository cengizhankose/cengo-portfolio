import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  DEFAULT_LOCALE,
  LOCALES,
  localePath,
  useLocale,
  useRoute,
  useT,
} from "../../i18n";
import { getJson } from "../../lib/api.js";
import { formatDate, toIsoDate } from "../../lib/format.js";
import { getPageMeta } from "../../seo/pages.js";
import { usePageMeta } from "../../seo/usePageMeta.js";
import "./style.css";

// The language a post is written in (T-12); a row without one counts as EN.
const postLang = (post) =>
  LOCALES.includes(post?.lang) ? post.lang : DEFAULT_LOCALE;

// groupPosts(posts, locale) -> { own, other } (T-12, FE-14 step 11)
//   own:   posts written in the page's language, in API order;
//   other: posts in another language that have no translation among `own`
//          (same translationKey), shown in a separate group with a badge.
// The list API may already leave translated posts out (BE-07); filtering
// here as well keeps a pair from being listed twice either way.
export function groupPosts(posts, locale) {
  const own = posts.filter((post) => postLang(post) === locale);
  const translated = new Set(
    own.map((post) => post.translationKey).filter(Boolean),
  );
  const other = posts.filter(
    (post) =>
      postLang(post) !== locale &&
      !(post.translationKey && translated.has(post.translationKey)),
  );
  return { own, other };
}

// One post card. The card carries the post's language (lang); the date is
// written in the page's language (SEO-21 step 3), so it gets its own `lang`
// when the two differ. The link goes to the post's own language path.
function PostCard({ post, locale, heading: Heading, t }) {
  const lang = postLang(post);
  const foreign = lang !== locale;
  const iso = toIsoDate(post.createdAt);

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
          {formatDate(post.createdAt, locale)}
        </time>
      )}
    </article>
  );
}

const BlogHome = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const route = useRoute();
  const locale = useLocale();
  const t = useT();
  usePageMeta(getPageMeta(route, route.locale));

  useEffect(() => {
    const controller = new AbortController();
    getJson("/posts", { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setPosts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch posts:", err);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) return <div className="blog-loading">{t("status.loading")}</div>;

  const { own, other } = groupPosts(posts, locale);

  return (
    <div className="blog-container">
      <h1 className="blog-title">{t("blog.title")}</h1>
      {own.length === 0 && other.length === 0 && (
        <p className="blog-empty">{t("blog.empty")}</p>
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
};

export default BlogHome;
