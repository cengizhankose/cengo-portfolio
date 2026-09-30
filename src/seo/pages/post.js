// Meta for "/blog/:slug" when there is no post to describe: the slug does not
// exist or the post is a draft (SEO-08). The server's 404 shell and the
// NotFound page (variant "post") print it in the URL's language: /blog/... EN,
// /tr/blog/... TR. A published post takes its title and description from its
// own data in getPageMeta (SEO-10, SEO-09), and while it is loading the page
// falls back to the blog meta.
import { buildTitle } from "../site.js";

export default {
  en: {
    title: buildTitle("Post not found"),
    description:
      "This blog post does not exist or is no longer published. See all posts on the blog.",
    robots: "noindex",
  },
  tr: {
    title: buildTitle("Yazı bulunamadı"),
    description:
      "Bu yazı yok ya da artık yayında değil. Tüm yazılar için bloga göz atın.",
    robots: "noindex",
  },
};
