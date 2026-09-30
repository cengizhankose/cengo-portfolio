// The body of a blog post (SEC-03, FE-13): markdown -> sanitized HTML ->
// React, with ```mermaid blocks drawn by <Mermaid>.
//
// The pipeline (remark-gfm, rehype-raw, rehype-sanitize with the allowlist in
// src/lib/markdown/sanitizeSchema.js) is the single render path for post
// content. Raw HTML in a post is parsed and then filtered: no script, style,
// iframe, form, meta, base, object, embed or link elements, no event-handler
// attributes, no javascript: URLs. Diagrams are not HTML in the body: they
// stay markdown source and Mermaid draws them (T-05).
//
// `lang` is the post's own language: the diagram labels, the loading text and
// the new-tab note of external links speak it (T-12).
//
// data-analytics-location="blog_body" names the placement of the links in
// the post for outbound_link_clicked (ANL-09); markdownComponents' `a`
// (MarkdownLink) opens external links in a new tab (MKT-23).
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { LOCATIONS } from "../../lib/analytics/events.js";
import { createDiagramLabels } from "../../lib/markdown/diagramLabels.js";
import { diagramText } from "../../lib/markdown/diagramText.js";
import {
  remarkPlugins,
  remarkRehypeOptions,
  rehypePlugins,
} from "../../lib/markdown/pipeline.js";
import {
  DiagramLabelContext,
  markdownComponents,
} from "./markdownComponents.jsx";

export default function PostMarkdown({ content, lang = "en" }) {
  const markdown = content ?? "";
  const prefix = diagramText(lang).diagram;
  const context = useMemo(
    () => ({ labels: createDiagramLabels(markdown, { prefix }), lang }),
    [markdown, prefix, lang],
  );
  return (
    <div
      className="blog-content markdown-body"
      data-analytics-location={LOCATIONS.BLOG_BODY}
    >
      <DiagramLabelContext.Provider value={context}>
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          remarkRehypeOptions={remarkRehypeOptions}
          components={markdownComponents}
        >
          {markdown}
        </ReactMarkdown>
      </DiagramLabelContext.Provider>
    </div>
  );
}
