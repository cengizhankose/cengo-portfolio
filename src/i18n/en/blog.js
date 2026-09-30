// EN interface text, namespace "blog" (T-12, FE-14). Keys are used as
// t("blog.<key>"); nested objects add dotted segments.
export default {
  title: "Blog",
  // Empty state: only after a successful answer with no posts (ANL-15).
  empty: "No posts yet",
  emptyText:
    "Nothing is published here yet. Check back soon, or get in touch in the meantime.",
  home: "Home",
  contact: "Contact",
  // Error state: the list request failed (FE-03, ANL-15, DSG-20).
  loadError: "Posts couldn't be loaded",
  otherLanguage: "Posts in Turkish",
  // Only the other-language group failed; the page's own posts still show.
  otherLoadError: "Posts in Turkish couldn't be loaded",
  inOtherLanguage: "in Turkish",
};
