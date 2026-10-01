// Blog list grouping (T-12, FE-14 step 11), shared by the blog index page
// (src/pages/blog/BlogHome.jsx) and the server's blog data (src/server/
// static.ts, SEO-01), so the HTML the server sends and the page the browser
// draws list the same posts in the same groups.
//
// Pure ESM: no React, no DOM, no swr.
import { DEFAULT_LOCALE, LOCALES } from "../seo/site.js";

// The language a post is written in (T-12); a row without one counts as EN.
export const postLanguage = (post) =>
  LOCALES.includes(post?.lang) ? post.lang : DEFAULT_LOCALE;

// groupPostsForLocale(posts, locale) -> { own, other }
//   own:   posts written in the page's language, in API order;
//   other: posts in another language that have no translation among `own`
//          (same translationKey), shown in a separate group with a badge.
// The list API may already leave translated posts out (BE-07); filtering
// here as well keeps a pair from being listed twice either way.
export function groupPostsForLocale(posts, locale) {
  const own = posts.filter((post) => postLanguage(post) === locale);
  const translated = new Set(
    own.map((post) => post.translationKey).filter(Boolean),
  );
  const other = posts.filter(
    (post) =>
      postLanguage(post) !== locale &&
      !(post.translationKey && translated.has(post.translationKey)),
  );
  return { own, other };
}

// mergePostLists([ownList, otherList]) -> posts from both lists, API order,
// each once. The second list never repeats a post of the first on the real
// API; the check keeps a pair from showing twice whatever the lists contain.
// The page's own copy of this rule is mergePosts() in src/hooks/usePosts.js.
export function mergePostLists(lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const post of list ?? []) {
      const id = post?.id ?? post?.slug;
      if (id !== undefined && seen.has(id)) continue;
      if (id !== undefined) seen.add(id);
      out.push(post);
    }
  }
  return out;
}
