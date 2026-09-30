// `components` for <ReactMarkdown> in PostMarkdown (FE-13, T-05 stage A).
//
// A fenced ```mermaid block arrives here as <pre><code class="language-mermaid">
// (rehype-sanitize keeps exactly that class, see src/lib/markdown). The
// `code` override turns it into <Mermaid>; the `pre` override then drops the
// <pre> wrapper so the <figure> is not nested in it. Every other block keeps
// the default markup.
//
// Links (`a`, MarkdownLink; MKT-23 step 3): an http(s) link to another site
// becomes an ExternalLink (new tab, rel="noopener", a hidden new-tab note in
// the post's language). rehype-sanitize drops target/rel from the markdown,
// so they are only ever set here. A link to this site (a root-relative path
// or an absolute www/apex URL) becomes a router <Link>. Fragment links
// (footnotes), mailto: and relative paths stay a plain <a>.
//
// The object is module-level on purpose: a new `components` object per render
// would be a new component type per render, and React would remount (redraw)
// every diagram each time the post component re-rendered. What varies per post
// (the diagram labels, the post's language) comes through a context.
import { createContext, useContext } from "react";
import { Link, useInRouterContext } from "react-router-dom";
import ExternalLink from "../../components/ExternalLink.jsx";
import { SITE_URL } from "../../seo/site.js";
import Mermaid from "./Mermaid.jsx";

export const DiagramLabelContext = createContext({ labels: null, lang: "en" });

// True inside the <pre> of a mermaid block (set by MarkdownPre): only a
// fenced block becomes a diagram, never an inline <code class=
// "language-mermaid"> from raw HTML (a <figure> cannot sit inside a <p>).
const MermaidBlockContext = createContext(false);

// Case-insensitive like diagramLabels.js, so ```Mermaid is drawn and
// numbered the same way.
const MERMAID = /(?:^|\s)language-mermaid(?:\s|$)/i;

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
  const inMermaidBlock = useContext(MermaidBlockContext);
  if (inMermaidBlock && MERMAID.test(classNames(className))) {
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
  if (node?.children?.some(isMermaidCode)) {
    return (
      <MermaidBlockContext.Provider value={true}>
        {children}
      </MermaidBlockContext.Provider>
    );
  }
  return <pre {...rest}>{children}</pre>;
}

const withoutWww = (host) => host.toLowerCase().replace(/^www\./, "");
const SITE_HOST = withoutWww(new URL(SITE_URL).hostname);
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * How a markdown href is rendered:
 *   { kind: "external" }            http(s) link to another host
 *   { kind: "internal", to }        this site: "/about", "https://www.cengizhankose.com/blog"
 *   { kind: "plain" }               "#fn-1", "mailto:...", "notes.md", missing href
 */
export function classifyMarkdownHref(href) {
  if (typeof href !== "string") return { kind: "plain" };
  const value = href.trim();
  if (!value || value.startsWith("#")) return { kind: "plain" };

  const absolute = value.startsWith("//") ? `https:${value}` : value;
  if (SCHEME.test(absolute)) {
    let url;
    try {
      url = new URL(absolute);
    } catch {
      return { kind: "plain" };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { kind: "plain" };
    }
    if (withoutWww(url.hostname) !== SITE_HOST) return { kind: "external" };
    return { kind: "internal", to: `${url.pathname}${url.search}${url.hash}` };
  }
  if (value.startsWith("/")) return { kind: "internal", to: value };
  return { kind: "plain" };
}

function MarkdownLink({ href, children, ...props }) {
  // react-markdown also passes the hast `node`; it is not a DOM attribute.
  const rest = { ...props };
  delete rest.node;
  const { lang } = useContext(DiagramLabelContext);
  const inRouter = useInRouterContext();
  const link = classifyMarkdownHref(href);

  if (link.kind === "external") {
    return (
      <ExternalLink href={href} locale={lang} {...rest}>
        {children}
      </ExternalLink>
    );
  }
  if (link.kind === "internal" && inRouter) {
    return (
      <Link to={link.to} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

export const markdownComponents = {
  a: MarkdownLink,
  pre: MarkdownPre,
  code: MarkdownCode,
};

export default markdownComponents;
