// Page chunk loaders for the blog (PERF-04, FE-05).
//
// BlogHome and BlogPost are not in the entry chunk: src/app/pageRoutes.jsx
// wraps these loaders in React.lazy, and src/lib/prefetch.js calls them when a
// pointer or the keyboard reaches a blog link, so the chunk is usually loaded
// by the time the page renders (PERF-14). BlogPost is the page that brings
// the markdown chain (react-markdown, remark, rehype, parse5, ...), so this
// file must never import a page statically: only the two import() calls below
// may name them.
//
// import() of the same specifier resolves to the same module, so the lazy
// components and the intent preload share one request per chunk. Both
// languages (/blog and /tr/blog, T-12) use the same two chunks.
export const loadBlogHome = () => import("./BlogHome");
export const loadBlogPost = () => import("./BlogPost");
