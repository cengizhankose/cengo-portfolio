// Markdown -> sanitised HTML for the server snapshot (SEO-01, T-06 Aşama 1).
//
// The page renders a post with react-markdown and the pipeline in
// src/lib/markdown/pipeline.js (remark-gfm -> rehype-raw -> rehype-sanitize
// with src/lib/markdown/sanitizeSchema.js -> fragment links). This file runs
// the very same plugin lists through unified and prints HTML, so the raw HTML
// of a post holds the same elements, ids and links as the rendered page, and
// a draft, a script or an event handler can get into neither (SEC-03).
//
// T-05 stage A: a ```mermaid block stays `<pre><code class="language-mermaid">`
// here; the browser draws it with <Mermaid> once the app opens. The stage B SVGs
// (PERF-05) never go into the markdown body.
//
// This module is a server runtime dependency (unified, remark-parse,
// remark-rehype, rehype-stringify) until PERF-03 (T-06 Aşama 2) replaces the
// snapshot with a real server render and deletes it.
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type PluggableList } from "unified";
import {
  rehypePlugins,
  remarkPlugins,
  remarkRehypeOptions,
} from "../lib/markdown/pipeline.js";

// react-markdown calls remark-rehype with allowDangerousHtml: true so that
// raw HTML reaches rehype-raw; the sanitiser then filters what it produced.
const processor = unified()
  .use(remarkParse)
  .use(remarkPlugins as unknown as PluggableList)
  .use(remarkRehype, { allowDangerousHtml: true, ...remarkRehypeOptions })
  .use(rehypePlugins as unknown as PluggableList)
  .use(rehypeStringify)
  .freeze();

/** How many rendered posts the cache keeps (bounded: slugs are not trusted to stay few). */
export const MARKDOWN_CACHE_MAX = 64;

// Rendering is the only expensive step of a post page; the result depends on
// the text alone, so it is kept by a hash of the text. A republished post has
// other text and gets a new entry; the oldest entry goes first.
const cache = new Map<string, string>();

/** The sanitised HTML of a post body. Empty text gives an empty string. */
export function renderMarkdown(markdown: string | null | undefined): string {
  const text = typeof markdown === "string" ? markdown : "";
  if (text === "") return "";

  const key = `${text.length}:${Bun.hash(text).toString(16)}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit); // most recently used last
    return hit;
  }

  const html = String(processor.processSync(text));
  cache.set(key, html);
  while (cache.size > MARKDOWN_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return html;
}

/** Empties the cache (tests). */
export function clearMarkdownCache(): void {
  cache.clear();
}
