// The markdown pipeline of a blog post, as plain data for <ReactMarkdown>:
//   remark-gfm  ->  rehype-raw  ->  rehype-sanitize(sanitizeSchema)  ->  links
// Order matters: rehype-raw turns raw HTML into elements first, sanitize
// then filters elements AND raw-HTML-derived ones, and only what survives is
// handed to the `components` overrides (PostMarkdown, markdownComponents).
//
// The server draws the page itself (PERF-03), so the same post is filtered the
// same way in the browser and in the raw HTML.
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import rehypeClobberedLinks from "./rehypeClobberedLinks.js";
import { sanitizeSchema } from "./sanitizeSchema.js";

export const remarkPlugins = [remarkGfm];

export const rehypePlugins = [
  rehypeRaw,
  [rehypeSanitize, sanitizeSchema],
  rehypeClobberedLinks,
];

// remark-rehype prefixes footnote ids with `user-content-` itself; sanitize
// would prefix them a second time and the footnote links would break. Empty
// here, so sanitize is the only place that writes the prefix.
export const remarkRehypeOptions = { clobberPrefix: "" };
