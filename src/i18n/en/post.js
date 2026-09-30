// EN interface text, namespace "post" (T-12, FE-14). Keys are used as
// t("post.<key>"); nested objects add dotted segments.
// The byline, the author box and the end-of-post block speak the post's own
// language (they sit inside <article lang>), so they are read with
// translate(post.lang, ...), not with the interface language.
export default {
  backToBlog: "Back to Blog",
  published: "Published:",
  edited: "Edited:",
  loadError: "This post could not be loaded. Please try again later.",
  // Under the title (SEO-16, MKT-17): the human author first, then the AI
  // co-author, written "By <name> & Logan (AI assistant)"; `with` is the part
  // after the name.
  byline: {
    by: "By",
    with: "& Logan (AI assistant)",
  },
  // Author box (SEO-16): heading for assistive technology, the About link,
  // the portrait's alt text.
  aboutAuthor: "About the author",
  readStory: "Read my story →",
  authorPhotoAlt: "Portrait of Cengizhan Köse",
  // The standard AI contribution note; it appears once per post, in the
  // author box (SEO-16). Draft wording: the owner confirms it.
  aiDisclosure:
    "This post was written with the AI assistant Logan; system design, content and final editing are by Cengizhan Köse.",
  // End-of-post block (MKT-07): follow and contact.
  footer: {
    label: "About the author and next steps",
    follow: "Get new posts:",
    rss: "Follow via RSS",
    linkedin: "Follow on LinkedIn",
    cta: "Building something similar? Let's talk →",
  },
};
