// PERF-05: the publish CLI's view of a post's diagrams (T-05 stage B).
//
// scripts/content/publish-post.ts talks to this file only. The drawing code
// (render-mermaid.ts: jsdom, DOMPurify, a headless Chrome) is loaded when a
// post really has a diagram, so --dry-run, --verify and every post without
// one start as fast as before and never look for a browser.
import type { PostDiagrams } from "../../src/db/schema";
import { extractDiagramBlocks } from "./diagram-blocks";

export type { PostDiagrams };

/** Keys (diagramKey) of the diagrams the markdown contains: unique, sorted. */
export function diagramKeys(markdown: string): string[] {
  return [
    ...new Set(extractDiagramBlocks(markdown, "en").map((b) => b.key)),
  ].sort();
}

/** Keys of the diagrams stored on a row: sorted; none for a null or malformed value. */
export function storedDiagramKeys(stored: unknown): string[] {
  return stored && typeof stored === "object" && !Array.isArray(stored)
    ? Object.keys(stored).sort()
    : [];
}

export interface RenderRequest {
  /** The post's language: the diagrams' accessible names speak it. */
  lang: string;
  /** One line per finished diagram. */
  progress?: (line: string) => void;
}

/** Draws the diagrams of a post: `{}` for a post without any. */
export type RenderDiagrams = (
  markdown: string,
  request: RenderRequest,
) => Promise<PostDiagrams>;

export const renderDiagrams: RenderDiagrams = async (markdown, request) => {
  if (extractDiagramBlocks(markdown, request.lang).length === 0) return {};
  const { renderMermaid } = await import("./render-mermaid");
  return renderMermaid(markdown, request);
};
