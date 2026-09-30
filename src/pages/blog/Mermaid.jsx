// A Mermaid diagram inside a blog post (FE-13, FE-35, DSG-06, PERF-05; T-05).
//
// Two ways to get the picture, one <figure>:
//
//   stored   (T-05 stage B, PERF-05) the post carries the diagram already
//            drawn: posts.diagrams[diagramKey(source)] = { label, light, dark },
//            two sanitised SVGs the publish script made (scripts/lib). Both are
//            in the page and CSS shows the one that matches <html data-theme>
//            (style.css), so there is no mermaid to download, no layout jump
//            while it draws, no re-render when the theme changes and nothing
//            theme-dependent for a server render to get wrong. The strings are
//            printed as they are: the publish script sanitised them, nothing
//            else can write the column (K-01), and the tripwire below refuses
//            anything that is not plainly an <svg> drawing.
//   client   (T-05 stage A, FE-13) no stored drawing for this source (a post
//            published before its diagrams were drawn, or a source that was
//            edited without publishing again): mermaid is loaded and draws
//            it in the browser, as before. PERF-05 step 10(d) deletes this
//            branch (ClientDiagram and renderDiagram) once the live post has
//            its drawings.
//
// Both branches keep the same markup and the same states:
//   ready    <figure role="img" aria-label> that scrolls sideways at the
//            diagram's natural size (DSG-06) and takes keyboard focus so it
//            can be scrolled without a mouse;
//   client only: a placeholder of fixed height while it loads, and, when it
//            does not parse (or the chunk does not load), the source as
//            <pre><code class="language-mermaid"> so it is still readable.
// React owns the markup: nothing replaces or removes DOM that React still
// tracks (the old MermaidRenderer swapped <pre> nodes by id).
// The client branch takes its colours from the site's theme tokens
// (src/lib/mermaidTheme.js); useTheme() re-renders it when <html data-theme>
// changes and the effect draws the diagram again in the new theme; the old
// drawing stays on screen until the new one is ready.
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { diagramKey } from "../../lib/diagram-key.js";
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

function ClientDiagram({ chart, label, lang }) {
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

// posts.diagrams of the post on screen, { [key]: { label, light, dark } }, or
// null (BlogPost provides it around <PostMarkdown>).
export const DiagramsContext = createContext(null);

// Not a sanitiser (the publish script is): a cheap refusal of anything that
// is not plainly a drawing, so a damaged or hand-edited row falls back to the
// client branch instead of reaching innerHTML.
const NOT_A_DRAWING =
  /<\s*(?:script|foreignobject|iframe|object|embed)\b|\son[a-z]+\s*=|javascript:/i;
const isDrawing = (svg) =>
  typeof svg === "string" && svg.startsWith("<svg") && !NOT_A_DRAWING.test(svg);

/** The stored drawing for `chart`, or null when there is none that can be printed. */
function storedDrawing(diagrams, chart) {
  const entry = diagrams?.[diagramKey(chart)];
  return entry && isDrawing(entry.light) && isDrawing(entry.dark)
    ? entry
    : null;
}

function StoredDiagram({ entry, label, lang }) {
  const text = diagramText(lang);
  // A stable __html object per string: React writes innerHTML again for a new
  // object even with the same text, which would replace the SVG nodes (and a
  // selection inside them) on every unrelated re-render.
  const light = useMemo(() => ({ __html: entry.light }), [entry.light]);
  const dark = useMemo(() => ({ __html: entry.dark }), [entry.dark]);
  return (
    <figure
      className="mermaid-diagram"
      role="img"
      aria-label={label ?? entry.label ?? text.diagram}
      // Same as the client branch: a scrollable region needs a tab stop.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <div
        className="mermaid-theme mermaid-theme--light"
        dangerouslySetInnerHTML={light}
      />
      <div
        className="mermaid-theme mermaid-theme--dark"
        dangerouslySetInnerHTML={dark}
      />
    </figure>
  );
}

export default function Mermaid({ chart, label, lang }) {
  const diagrams = useContext(DiagramsContext);
  const entry = useMemo(
    () => storedDrawing(diagrams, chart),
    [diagrams, chart],
  );
  return entry ? (
    <StoredDiagram entry={entry} label={label} lang={lang} />
  ) : (
    <ClientDiagram chart={chart} label={label} lang={lang} />
  );
}
