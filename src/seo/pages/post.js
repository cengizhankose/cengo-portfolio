// Meta for "/blog/:slug" when there is no post to describe: the slug does not
// exist or the post is a draft (SEO-08). The server's 404 shell and the
// NotFound page (variant "post") print it in the URL's language: /blog/... EN,
// /tr/blog/... TR. A published post takes its title and description from its
// own data in getPageMeta (SEO-10, SEO-09), and while it is loading the page
// falls back to the blog meta.
import { buildTitle } from "../site.js";

// What the end of a post shows besides its text (SEO-16, MKT-07). The React
// components (src/pages/blog/AuthorBox.jsx, PostFooter.jsx) read these, and the
// server draws those components (PERF-03), so the raw HTML and the page print
// the same portrait, profiles and feed.

/** The portrait in the author box, 96 px square with a 2x file (public/blog). */
export const AUTHOR_PHOTO = Object.freeze({
  src: "/blog/author-96.webp",
  srcSet: "/blog/author-96.webp 1x, /blog/author-192.webp 2x",
  width: 96,
  height: 96,
});

/** SOCIAL_PROFILES ids shown in the author box, in this order (K-11: LinkedIn, GitHub). */
export const AUTHOR_PROFILE_IDS = Object.freeze(["linkedin", "github"]);

/** The profile the "follow" line links to (MKT-07). */
export const FOLLOW_PROFILE_ID = "linkedin";

/** data-analytics-location of the end-of-post links (ANL-09): a lower-case token. */
export const FOOTER_LOCATION = "blog_footer";

/**
 * Language-independent path of the RSS feed (MKT-07). The language prefix is
 * added by localePath(): /rss.xml (EN) and /tr/rss.xml (TR). Unlike a page,
 * a feed needs no open static route, so a TR post links to its own feed.
 */
export const FEED_PATH = "/rss.xml";

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
