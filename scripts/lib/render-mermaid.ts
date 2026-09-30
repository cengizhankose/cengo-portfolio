// PERF-05 / T-05 stage B: the ```mermaid blocks of a post, drawn once, at
// publish time, as one light and one dark SVG each.
//
//   renderMermaid(markdown, { lang }) -> { [key]: { label, light, dark } }
//
// This is what the publish CLI stores in posts.diagrams (next to, never
// inside, the markdown: SEC-03's sanitising of the body is unchanged) and
// what <Mermaid> prints, so the blog page downloads no mermaid and no ELK.
//
// For every block, in document order:
//   1. key    diagramKey(source), src/lib/diagram-key.js: the same function
//             the page runs on the code text it is given;
//   2. label  the diagram's accessible name, by the rule the page uses
//             (src/lib/markdown/diagramLabels.js), in the post's language;
//   3. draw   once per theme in a real Chrome (mermaid-browser.ts) with
//             scripts/mermaid.{light,dark}.json: the site's theme tokens
//             (src/lib/mermaidTheme.js, FE-35), securityLevel "strict" and
//             htmlLabels off, so labels are SVG <text> and not <foreignObject>;
//   4. clean  sanitizeSvg(): DOMPurify's SVG profile (src/lib/markdown);
//   5. verify svg-guard.ts: nothing was lost by cleaning, and nothing that
//             could load or run anything is left.
// Any failure stops the publish with a message that names the diagram; a
// diagram is never stored half-way.
//
// Two blocks with the same source share one entry (the page looks entries up
// by key); two different sources with the same key are an error.
import { JSDOM } from "jsdom";
import { join } from "node:path";
import { createSvgSanitizer } from "../../src/lib/markdown/sanitizeSvg.js";
import { THEME_TOKENS, mermaidConfig } from "../../src/lib/mermaidTheme.js";
import type { PostDiagrams } from "../../src/db/schema";
import {
  DiagramError,
  extractDiagramBlocks,
  uniqueBlocks,
  type DiagramBlock,
} from "./diagram-blocks";
import {
  createBrowserRenderer,
  type SvgRenderer,
  type Theme,
} from "./mermaid-browser";
import { assertStoredSvg, drawingCounts } from "./svg-guard";

export {
  DiagramError,
  extractDiagramBlocks,
  uniqueBlocks,
  type DiagramBlock,
} from "./diagram-blocks";
export type { Theme } from "./mermaid-browser";
export const THEMES: readonly Theme[] = ["light", "dark"];

/** Where the per-theme configs live (next to the scripts, not generated at publish time). */
export const CONFIG_DIR = join(import.meta.dir, "..");
export const configPath = (theme: Theme) =>
  join(CONFIG_DIR, `mermaid.${theme}.json`);

/**
 * The Mermaid config for a theme: the blog's own (mermaidConfig, FE-35) with
 * the two settings stored diagrams need: labels as SVG <text> (sanitizeSvg
 * removes <foreignObject>) and natural size (DSG-06 scrolls instead of
 * shrinking). `bun scripts/lib/write-mermaid-config.ts` writes it to
 * scripts/mermaid.<theme>.json; a test keeps the files equal to this.
 */
export function publishConfig(theme: Theme) {
  const base = mermaidConfig(THEME_TOKENS[theme]);
  return {
    ...base,
    securityLevel: "strict",
    htmlLabels: false,
    flowchart: { htmlLabels: false, useMaxWidth: false },
  };
}

export interface RenderOptions {
  /** The post's language (labels speak it). */
  lang: string;
  /** Draws the diagrams; default: a real Chrome, started here and closed here. */
  renderer?: SvgRenderer;
  /** Cleans an SVG string; default: sanitizeSvg over a jsdom window. */
  sanitize?: (svg: string) => string;
  loadConfig?: (theme: Theme) => Promise<object>;
  progress?: (line: string) => void;
}

const readConfig = async (theme: Theme): Promise<object> =>
  Bun.file(configPath(theme)).json();

let defaultSanitizer: ((svg: string) => string) | undefined;
const sanitizeWithJsdom = (svg: string): string =>
  (defaultSanitizer ??= createSvgSanitizer(new JSDOM("").window))(svg);

const describe = (block: DiagramBlock) =>
  `diagram at line ${block.line} ("${block.label}")`;

/** One sanitised, verified SVG for a block and a theme. */
async function drawOne(
  block: DiagramBlock,
  theme: Theme,
  config: object,
  renderer: SvgRenderer,
  sanitize: (svg: string) => string,
): Promise<string> {
  const id = `m-${block.key}-${theme}`;
  let raw: string;
  try {
    raw = await renderer.render(block.source, config, id);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new DiagramError(
      `${describe(block)} could not be drawn (${theme}): ${reason}`,
    );
  }

  const before = drawingCounts(raw);
  if (before.foreignObject > 0) {
    throw new DiagramError(
      `${describe(block)} uses HTML labels (<foreignObject>), which a stored ` +
        "diagram cannot carry: use a diagram type that draws plain SVG text",
    );
  }
  const clean = sanitize(raw);
  const after = drawingCounts(clean);
  for (const name of ["text", "style", "path", "marker"] as const) {
    if (after[name] !== before[name]) {
      throw new DiagramError(
        `${describe(block)} (${theme}): cleaning removed ` +
          `${before[name] - after[name]} <${name}> element(s); ` +
          "the drawing would be incomplete",
      );
    }
  }
  try {
    assertStoredSvg(clean, { id });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new DiagramError(`${describe(block)} (${theme}): ${reason}`);
  }
  return clean;
}

/**
 * Draws every mermaid block of `markdown`. Returns `{}` (and never starts a
 * browser) when there is none.
 */
export async function renderMermaid(
  markdown: string,
  options: RenderOptions,
): Promise<PostDiagrams> {
  const blocks = uniqueBlocks(extractDiagramBlocks(markdown, options.lang));
  if (blocks.length === 0) return {};

  const sanitize = options.sanitize ?? sanitizeWithJsdom;
  const loadConfig = options.loadConfig ?? readConfig;
  const configs = Object.fromEntries(
    await Promise.all(
      THEMES.map(async (theme) => [theme, await loadConfig(theme)] as const),
    ),
  ) as Record<Theme, object>;

  const ownsRenderer = !options.renderer;
  const renderer = options.renderer ?? (await createBrowserRenderer());
  const diagrams: PostDiagrams = {};
  try {
    for (const block of blocks) {
      const [light, dark] = [
        await drawOne(block, "light", configs.light, renderer, sanitize),
        await drawOne(block, "dark", configs.dark, renderer, sanitize),
      ];
      diagrams[block.key] = { label: block.label, light, dark };
      options.progress?.(
        `${block.key} ${block.label} (${light.length + dark.length} bytes)`,
      );
    }
  } finally {
    if (ownsRenderer) await renderer.close();
  }
  return diagrams;
}
