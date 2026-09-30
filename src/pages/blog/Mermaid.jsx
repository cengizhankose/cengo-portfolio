// A Mermaid diagram inside a blog post (FE-13, FE-35, DSG-06; T-05 stage A).
//
// React owns the markup: the diagram is state of this component, rendered
// into a <figure> React created, so nothing replaces or removes DOM that
// React still tracks (the old MermaidRenderer swapped <pre> nodes by id).
//   loading  a placeholder of fixed height, never the raw source;
//   ready    <figure role="img" aria-label> that scrolls sideways at the
//            diagram's natural size (DSG-06) and takes keyboard focus so it
//            can be scrolled without a mouse;
//   failed   the source as <pre><code class="language-mermaid">, so a
//            diagram that does not parse (or a chunk that does not load) is
//            still readable.
// The colours come from the site's theme tokens (src/lib/mermaidTheme.js).
// useTheme() re-renders this component when <html data-theme> changes and
// the effect draws the diagram again in the new theme; the old drawing stays
// on screen until the new one is ready.
import { useEffect, useId, useMemo, useState } from "react";
import { diagramText } from "../../lib/markdown/diagramText.js";
import { mermaidConfig, readTokens } from "../../lib/mermaidTheme.js";
import { useTheme } from "../../lib/theme.js";

// mermaid.initialize() is global, so "initialize + render" is one step and
// steps run strictly one after another: two diagrams (or one diagram and a
// theme change) can never render under each other's configuration.
let queue = Promise.resolve();
let renderCount = 0;

function renderDiagram(baseId, chart) {
  const job = queue.then(async () => {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize(mermaidConfig(readTokens()));
    // A fresh id per render: the SVG on screen keeps its own id, so the
    // scratch nodes Mermaid creates (and the clean-up below) never touch it.
    const id = `${baseId}-${++renderCount}`;
    try {
      const { svg } = await mermaid.render(id, chart);
      return svg;
    } finally {
      for (const node of document.querySelectorAll(`#${id}, #d${id}`)) {
        node.remove();
      }
    }
  });
  queue = job.catch(() => {});
  return job;
}

export default function Mermaid({ chart, label, lang }) {
  const theme = useTheme();
  const baseId = `mermaid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // { chart, svg } once drawn, { chart, failed } when it could not be. The
  // chart is part of the value, so a result for another diagram (this
  // component kept by React while the post changed) is never shown.
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    renderDiagram(baseId, chart).then(
      (svg) => {
        if (!cancelled) setResult({ chart, svg });
      },
      () => {
        if (!cancelled) setResult({ chart, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [baseId, chart, theme]);

  const current = result?.chart === chart ? result : null;
  const text = diagramText(lang);
  // React sets innerHTML again whenever the __html object is a new one, even
  // with the same string; a stable object keeps the drawing (and a text
  // selection inside it) untouched by unrelated re-renders.
  const svg = current?.svg;
  const html = useMemo(() => (svg ? { __html: svg } : null), [svg]);

  if (current?.failed) {
    return (
      <pre>
        <code className="language-mermaid">{chart}</code>
      </pre>
    );
  }
  if (!current) {
    return (
      <div className="mermaid-placeholder" aria-busy="true">
        {text.loading}
      </div>
    );
  }
  return (
    <figure
      className="mermaid-diagram"
      role="img"
      aria-label={label ?? text.diagram}
      // The diagram can be wider than the column. A scrollable region needs
      // a tab stop (axe scrollable-region-focusable), hence tabIndex on an
      // element that is otherwise not interactive.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <div dangerouslySetInnerHTML={html} />
    </figure>
  );
}
