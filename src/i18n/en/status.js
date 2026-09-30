// EN interface text, namespace "status" (T-12, FE-14). Keys are used as
// t("status.<key>"); nested objects add dotted segments.
// Shared by the status screens (DSG-20, FE-03, ANL-15): loading, the retry
// button, the reason a request failed and the crashed-route fallback.
export default {
  loading: "Loading...",
  retry: "Try again",
  reload: "Reload the page",
  home: "Home",
  // Why a blog request failed (src/lib/swr.js errorStatus): no answer at
  // all, or an answer the page cannot use (5xx, bad payload).
  network:
    "Your browser couldn't reach the server. Check your connection and try again.",
  server: "The server couldn't answer right now. Try again in a moment.",
  postError: "Couldn't load this post",
  // ErrorBoundary fallback (FE-03): a page failed to render; the header and
  // menu still work.
  crash: {
    title: "Something went wrong on this page",
    text: "The rest of the site still works. Reload the page, or go back to the home page.",
  },
};
