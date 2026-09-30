// `components` for <ReactMarkdown> in PostMarkdown (FE-13, T-05 stage A).
//
// A fenced ```mermaid block arrives here as <pre><code class="language-mermaid">
// (rehype-sanitize keeps exactly that class, see src/lib/markdown). The
// `code` override turns it into <Mermaid>; the `pre` override then drops the
// <pre> wrapper so the <figure> is not nested in it. Every other block keeps
// the default markup.
//
// The object is module-level on purpose: a new `components` object per render
// would be a new component type per render, and React would remount (redraw)
// every diagram each time the post component re-rendered. What varies per post
// (the diagram labels, the post's language) comes through a context.
import { createContext, useContext } from "react";
import Mermaid from "./Mermaid.jsx";

export const DiagramLabelContext = createContext({ labels: null, lang: "en" });

const MERMAID = /(?:^|\s)language-mermaid(?:\s|$)/;

const classNames = (value) =>
  Array.isArray(value) ? value.join(" ") : String(value ?? "");

function isMermaidCode(node) {
  return (
    node?.type === "element" &&
    node.tagName === "code" &&
    MERMAID.test(classNames(node.properties?.className))
  );
}

function MarkdownCode({ node, className, children, ...rest }) {
  const { labels, lang } = useContext(DiagramLabelContext);
  if (MERMAID.test(classNames(className))) {
    const chart = String(children).replace(/\n$/, "");
    const label = labels?.get({
      line: node?.position?.start?.line,
      source: chart,
    });
    return <Mermaid chart={chart} label={label} lang={lang} />;
  }
  return (
    <code className={className} {...rest}>
      {children}
    </code>
  );
}

function MarkdownPre({ node, children, ...rest }) {
  if (node?.children?.some(isMermaidCode)) return <>{children}</>;
  return <pre {...rest}>{children}</pre>;
}

export const markdownComponents = {
  // W7-DSG-social-links (SEO-24 / ANL-09): `a: MarkdownLink` goes here, next
  // to `code` and `pre`; it needs no other change in this package.
  pre: MarkdownPre,
  code: MarkdownCode,
};

export default markdownComponents;
