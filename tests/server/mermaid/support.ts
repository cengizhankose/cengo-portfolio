// Shared fixtures for the PERF-05 tests: SVG drawings shaped like Mermaid's
// output (htmlLabels off), a fake browser, and a markdown post with diagrams.
import { join } from "node:path";
import { REPO_ROOT } from "../helpers";
import type { SvgRenderer } from "../../../scripts/lib/mermaid-browser";

export { REPO_ROOT };

/** Real Mermaid 12 output (Chrome, htmlLabels off), root id "fx-htmlOff". */
export const REAL_SVG = await Bun.file(
  join(
    REPO_ROOT,
    "tests/frontend/markdown/fixtures/mermaid-flowchart-svg-labels.svg",
  ),
).text();

/** Real Mermaid 12 output with HTML labels (<foreignObject>), root id "fx-htmlOn". */
export const REAL_HTML_LABEL_SVG = await Bun.file(
  join(
    REPO_ROOT,
    "tests/frontend/markdown/fixtures/mermaid-flowchart-html-labels.svg",
  ),
).text();

/** The real drawing under another root id (every selector in it follows). */
export const realSvg = (id: string) => REAL_SVG.replaceAll("fx-htmlOff", id);

/** A small drawing with the parts a stored diagram needs: style, marker, path, text. */
export const smallSvg = (id: string, text = "Node") =>
  `<svg id="${id}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" ` +
  `width="100" height="40" role="graphics-document document">` +
  `<style>#${id}{font-family:Raleway,sans-serif;}@keyframes dash{to{stroke-dashoffset:0;}}</style>` +
  `<defs><marker id="${id}_arrow" markerWidth="8" markerHeight="8"><path d="M0,0 L8,4 L0,8 z"/></marker></defs>` +
  `<g><path d="M0,0 L10,10" marker-end="url(#${id}_arrow)"/><text x="1" y="2">${text}</text></g></svg>`;

export interface FakeRenderer extends SvgRenderer {
  calls: { source: string; config: any; id: string }[];
  closed: boolean;
}

/** A browser that "draws" with `draw` (default smallSvg) and records what it was asked. */
export function fakeRenderer(
  draw: (source: string, config: any, id: string) => string = (
    source,
    _c,
    id,
  ) => smallSvg(id, source.split("\n")[0]),
): FakeRenderer {
  const fake: FakeRenderer = {
    calls: [],
    closed: false,
    async render(source, config, id) {
      fake.calls.push({ source, config, id });
      return draw(source, config, id);
    },
    async close() {
      fake.closed = true;
    },
  };
  return fake;
}

export const fence = (source: string, marker = "```") =>
  `${marker}mermaid\n${source}\n${marker}`;

export const FLOW_A = "flowchart LR\n  A --> B";
export const FLOW_B = "flowchart TD\n  X[Başla] --> Y[Bitir]";

/** A post with two diagrams under headings. */
export const POST_WITH_TWO = [
  "## Boru hattı",
  "",
  fence(FLOW_A),
  "",
  "### Worker",
  "",
  fence(FLOW_B),
  "",
].join("\n");
