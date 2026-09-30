// PERF-05: which diagrams a post has, without drawing them.
//
// Pure (no Bun API, no DOM, no browser): the publish CLI's --dry-run and
// --verify use it, and tests/frontend/mermaid runs it in Vitest to prove that
// the key the script stores a diagram under is the key <Mermaid> looks for on
// the text react-markdown really hands it.
import { extractDiagramLabels } from "../../src/lib/markdown/diagramLabels.js";
import { diagramText } from "../../src/lib/markdown/diagramText.js";
import {
  diagramKey,
  normalizeDiagramSource,
} from "../../src/lib/diagram-key.js";

export class DiagramError extends Error {
  override name = "DiagramError";
}

export interface DiagramBlock {
  /** diagramKey() of the source. */
  key: string;
  /** The text between the fences. */
  source: string;
  label: string;
  /** 1-based line of the opening fence. */
  line: number;
}

// A fence at the top level of the document, indented by at most three spaces
// (CommonMark). Its content lines lose up to that many leading spaces, which
// is exactly the text react-markdown hands <Mermaid>; a fence inside a list
// item or a quote is handed over with its container's indentation removed in
// ways this script does not reproduce, so it is refused instead of keyed
// wrongly.
const TOP_LEVEL_FENCE = /^( {0,3})(?:`{3,}|~{3,})/;

/** The mermaid blocks of a markdown text, in order, with key and label. */
export function extractDiagramBlocks(
  markdown: string,
  lang: string,
): DiagramBlock[] {
  const prefix = diagramText(lang).diagram;
  const lines = String(markdown ?? "").split(/\r\n|\r|\n/);
  return extractDiagramLabels(markdown, { prefix }).map(
    (entry: { line: number; source: string; label: string }) => {
      const indent = TOP_LEVEL_FENCE.exec(lines[entry.line - 1] ?? "")?.[1];
      if (indent === undefined) {
        throw new DiagramError(
          `the diagram at line ${entry.line} is inside a list or a quote: ` +
            "move its fence to the top level of the post, or the page " +
            "cannot match it with its drawing",
        );
      }
      const source = entry.source
        .split("\n")
        .map((text) => text.slice(Math.min(indent.length, leadingSpaces(text))))
        .join("\n");
      return {
        key: diagramKey(source),
        source,
        label: entry.label,
        line: entry.line,
      };
    },
  );
}

const leadingSpaces = (text: string) => /^ */.exec(text)![0].length;

/**
 * The blocks by key. Identical sources collapse to the first block; a second,
 * different source with the same key is refused.
 */
export function uniqueBlocks(blocks: readonly DiagramBlock[]): DiagramBlock[] {
  const byKey = new Map<string, DiagramBlock>();
  for (const block of blocks) {
    const seen = byKey.get(block.key);
    if (!seen) {
      byKey.set(block.key, block);
    } else if (
      normalizeDiagramSource(seen.source) !==
      normalizeDiagramSource(block.source)
    ) {
      throw new DiagramError(
        `the diagrams at lines ${seen.line} and ${block.line} are different ` +
          `but have the same key ${block.key}: change one of them slightly`,
      );
    }
  }
  return [...byKey.values()];
}
