// EN interface text, namespace "blog" (T-12, FE-14). Keys are used as
// t("blog.<key>"); nested objects add dotted segments.
export default {
  title: "Blog",
  // The one line under the title (MKT-20): what the blog is for.
  tagline:
    "Notes from building web, mobile and AI products: the decisions, the numbers and what broke.",
  // Empty state: only after a successful answer with no posts (ANL-15). The
  // RSS link sits under the state (a file, not a route: emptyFeed).
  empty: "No posts yet",
  emptyText: "The first post is on its way.",
  emptyFeed: "Follow via RSS →",
  home: "Home",
  contact: "Contact",
  // Error state: the list request failed (FE-03, ANL-15, DSG-20).
  loadError: "Posts couldn't be loaded",
  otherLanguage: "Posts in Turkish",
  // Only the other-language group failed; the page's own posts still show.
  otherLoadError: "Posts in Turkish couldn't be loaded",
  inOtherLanguage: "in Turkish",
};
