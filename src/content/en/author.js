// EN page content, section "author" (T-12, FE-14). Read by the author box at
// the end of a post (src/pages/blog/AuthorBox.jsx, SEO-16, MKT-07) and by the
// server snapshot, so the raw HTML and the page say the same. src/content/tr/
// author.js has the same shape.
//
//   bio  two sentences, from the positioning in 00-icerik-girdileri.md §2 and
//        the awards of §5 (four first places). The role itself is not here:
//        AUTHOR.jobTitles in src/seo/site.js is the one source (it is also the
//        JSON-LD jobTitle, SEO-07).
export default {
  bio: "Cengizhan Köse is a Senior Fullstack Engineer who builds web and mobile products across fleet technology, e-commerce and AI. He has won four hackathons.",
};
