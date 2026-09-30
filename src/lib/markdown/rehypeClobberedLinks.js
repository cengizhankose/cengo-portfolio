// rehype plugin (runs AFTER rehype-sanitize): fragment links follow the ids.
//
// rehype-sanitize writes every id as `user-content-<id>` but leaves
// `href="#<id>"` alone, so an in-page link (a footnote reference and its
// back-link, `[jump](#section)` to a raw `<h2 id="section">`) would point at
// nothing. This adds the same prefix to fragment-only hrefs, which is what
// GitHub does with script. Footnotes are emitted without remark-rehype's own
// prefix (`remarkRehypeOptions.clobberPrefix: ""`, see pipeline.js) so the id
// is prefixed exactly once.
import { CLOBBER_PREFIX } from "./sanitizeSchema.js";

function walk(node, visit) {
  visit(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child, visit);
  }
}

export default function rehypeClobberedLinks({ prefix = CLOBBER_PREFIX } = {}) {
  return (tree) => {
    walk(tree, (node) => {
      if (node.type !== "element" || node.tagName !== "a") return;
      const href = node.properties?.href;
      if (typeof href !== "string" || href.length < 2 || href[0] !== "#") {
        return;
      }
      const target = href.slice(1);
      if (target.startsWith(prefix)) return;
      node.properties.href = `#${prefix}${target}`;
    });
  };
}
