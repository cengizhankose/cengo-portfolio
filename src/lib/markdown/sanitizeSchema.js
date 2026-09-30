// SEC-03: the allowlist every blog post passes through after rehype-raw.
//
// Pure data (no React, no DOM): the page (PostMarkdown) and the server-side
// snapshot (SEO-01, W7) import this same object, so both render the same
// subset of HTML.
//
// Start point is rehype-sanitize's defaultSchema (GitHub's rules): `code`
// keeps only `class="language-*"` (so ```mermaid blocks stay recognisable),
// link and image URLs are limited to a short protocol list, and every id /
// name is written with the `user-content-` prefix (no DOM clobbering by an
// author-controlled id). On top of it:
//  - BLOCKED_TAGS are removed from tagNames even if a future
//    rehype-sanitize release allowed them;
//  - `script` and `style` are stripped together with their content (an
//    unknown tag is otherwise only unwrapped, which would leave the CSS or
//    JS source on the page as text);
//  - there is no <form>, so the form attributes are dropped from the
//    global list as well (nothing checks the protocol of `action`);
//  - <input> survives only inside a list item (GFM task lists);
//  - href is limited to http, https and mailto.
// SVG is deliberately NOT allowed here: T-05 keeps pre-rendered diagrams out
// of the markdown body (they go through sanitizeSvg.js into their own field).
import { defaultSchema } from "rehype-sanitize";

// Prefix sanitize puts on every id / name (and on aria-describedby /
// aria-labelledby values). Fragment links have to carry it too, see
// rehypeClobberedLinks.js.
export const CLOBBER_PREFIX = "user-content-";

export const BLOCKED_TAGS = Object.freeze([
  "script",
  "style",
  "iframe",
  "form",
  "meta",
  "base",
  "object",
  "embed",
  "link",
]);

const FORM_ATTRIBUTES = Object.freeze([
  "accept",
  "acceptCharset",
  "action",
  "encType",
  "method",
]);

const defaultGlobal = defaultSchema.attributes?.["*"] ?? [];

export const sanitizeSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter(
    (tag) => !BLOCKED_TAGS.includes(tag),
  ),
  strip: [...new Set([...(defaultSchema.strip ?? []), "script", "style"])],
  attributes: {
    ...defaultSchema.attributes,
    "*": defaultGlobal.filter(
      (name) =>
        !FORM_ATTRIBUTES.includes(typeof name === "string" ? name : name[0]),
    ),
  },
  ancestors: { ...defaultSchema.ancestors, input: ["li"] },
  clobberPrefix: CLOBBER_PREFIX,
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
  },
};

export default sanitizeSchema;
