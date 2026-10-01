// Writes a page into the built HTML shell (SEO-01, T-03, T-06 Aşama 1).
//
// The shell is dist/index.html from Vite: one static <head>, `<div id="root">`
// and the module script. Per response this file
//   1. sets <html lang> (T-12: the language of the page; of the post for a post);
//   2. removes the shell's own <title> and the head tags this layer manages
//      (description, robots, canonical, hreflang, Open Graph/Twitter, JSON-LD)
//      and adds `headTags` (src/seo/head.ts) before </head>, so every tag is
//      printed once however the shell was built;
//   3. puts `bodyHtml` (the server render, src/entry-server.jsx) into
//      <div id="root">, marked `data-ssr` when React is to hydrate it
//      (`hydrate`, src/entry-client.jsx);
//   4. appends the first data of the page as a JSON block before </body>.
//
// The JSON block is not executable (`type="application/json"`), so the CSP
// needs no hash or nonce for it, and `<` `>` `&` are escaped inside it, so no
// text in the data can close the element (tests/server/ssr/inject.test.ts).
// src/seo/readSeoData.js reads it in the browser (T-04 swr fallback).
//
// PERF-03 (T-06 Aşama 2): one function for every HTML the server makes. The
// build-time prerender (scripts/prerender.ts) and the request-time blog render
// (src/server/static.ts) both pass React's HTML in as `bodyHtml`.
//
// Startup: assertShellMarkers() checks that the shell still has the markers
// this file rewrites. A build change that removes one stops the process at
// start (fail fast) instead of silently serving pages without SEO.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { escapeHtml } from "./head";
import { serializeJsonLd } from "./jsonld.js";
import { SEO_DATA_ID } from "./readSeoData.js";

const ROOT_MARKER = '<div id="root"></div>';
/** On #root when its content is a server render to hydrate (src/entry-client.jsx reads it). */
export const SSR_ATTRIBUTE = "data-ssr";
const HTML_OPEN = /<html\b([^>]*)>/i;
const HEAD_CLOSE = /<\/head>/i;
const BODY_CLOSE = /<\/body>/i;
const TITLE = /<title\b[^>]*>[\s\S]*?<\/title>\s*/i;
const HEAD_BLOCK = /<head\b[^>]*>[\s\S]*?<\/head>/i;

/** What the shell must contain: the marker text and the reason it is needed. */
const REQUIRED_MARKERS: {
  name: string;
  present: (shell: string) => boolean;
}[] = [
  { name: "<html> tag", present: (shell) => HTML_OPEN.test(shell) },
  { name: "</head>", present: (shell) => HEAD_CLOSE.test(shell) },
  { name: "<title>", present: (shell) => /<title\b/i.test(shell) },
  { name: ROOT_MARKER, present: (shell) => shell.includes(ROOT_MARKER) },
  { name: "</body>", present: (shell) => BODY_CLOSE.test(shell) },
];

/**
 * Throws when `shell` lacks a marker injectIntoShell() rewrites. `what` names
 * the file in the message.
 */
export function assertShellMarkers(shell: string, what = "index.html"): void {
  const missing = REQUIRED_MARKERS.filter(
    (marker) => !marker.present(shell),
  ).map((marker) => marker.name);
  if (missing.length > 0) {
    throw new Error(
      `SEO injection: ${what} is missing ${missing.join(", ")}. The build output changed; ` +
        `update src/seo/inject.ts or set SEO_INJECT=off.`,
    );
  }
}

/** Reads the shell once at startup and checks its markers (a sync read is fine outside the request path). */
export function readShell(file: string): string {
  const shell = readFileSync(file, "utf8");
  assertShellMarkers(shell, file);
  return shell;
}

/**
 * The built stylesheets (`assets/*.css` under `distRoot`, as site paths) that
 * contain `marker`, in name order.
 *
 * A page that Vite splits into its own chunk (the blog) brings its stylesheet
 * with the chunk, after the app has started. The snapshot of such a page uses
 * those class names from the first paint, so the server links the stylesheet in
 * the <head> (renderHeadTags `stylesheets`): without it the snapshot is drawn
 * unstyled and jumps when the chunk's CSS arrives (layout shift). The file is
 * found by a class name the snapshot itself prints, because the hashed file name
 * says nothing about the page; Vite's runtime loader skips a stylesheet that is
 * already linked by the same href, so it is fetched once. Reads the files once,
 * at startup. An empty list (dev, a build without the chunk) prints nothing.
 */
export function findStylesheets(distRoot: string, marker: string): string[] {
  let files: string[];
  try {
    files = readdirSync(join(distRoot, "assets"));
  } catch {
    return [];
  }
  return files
    .filter((file) => file.endsWith(".css"))
    .sort()
    .filter((file) =>
      readFileSync(join(distRoot, "assets", file), "utf8").includes(marker),
    )
    .map((file) => `/assets/${file}`);
}

// Head tags this layer prints itself (src/seo/head.ts). Anything of this kind
// the shell already carries is removed first, so a hand-written tag in
// index.html (or a prerendered shell, PERF-03) can never become a second one.
const MANAGED_HEAD_TAGS: RegExp[] = [
  /<meta\b[^>]*\bname\s*=\s*["']?description["']?(?=[\s/>])[^>]*>\s*/gi,
  /<meta\b[^>]*\bname\s*=\s*["']?robots["']?(?=[\s/>])[^>]*>\s*/gi,
  /<meta\b[^>]*\bproperty\s*=\s*["']?(?:og|article):[^"'\s>]*["']?[^>]*>\s*/gi,
  /<meta\b[^>]*\bname\s*=\s*["']?twitter:[^"'\s>]*["']?[^>]*>\s*/gi,
  /<link\b[^>]*\brel\s*=\s*["']?canonical["']?(?=[\s/>])[^>]*>\s*/gi,
  /<link\b(?=[^>]*\brel\s*=\s*["']?alternate["']?)(?=[^>]*\bhreflang\s*=)[^>]*>\s*/gi,
  /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>[\s\S]*?<\/script\s*>\s*/gi,
];

function withoutManagedTags(head: string): string {
  let out = head.replace(TITLE, "");
  for (const pattern of MANAGED_HEAD_TAGS) out = out.replace(pattern, "");
  return out;
}

/**
 * `data` (a map from swr key to value, src/lib/swrFallback.js) as the text of
 * the JSON block: `<`, `>`, `&` and the line separators are escaped, so the
 * text is safe inside a script element and parses back to the same value.
 */
export function serializeSeoData(data: unknown): string {
  return serializeJsonLd(data);
}

export interface InjectInput {
  /** `<html lang>`: the page's language (T-12). */
  lang?: string | null;
  /** Head tags from renderHeadTags(). */
  headTags: string;
  /** The server render for <div id="root"> (src/entry-server.jsx); empty keeps the root empty. */
  bodyHtml?: string;
  /**
   * The body is React's own output for this URL: #root gets `data-ssr`, and
   * the browser hydrates it instead of drawing the page again. Leave it off
   * for any other body (a 404 page, a fallback); the browser then replaces it.
   * Ignored while `bodyHtml` is empty.
   */
  hydrate?: boolean;
  /** First data for swr, written as the JSON block; nothing is written for an empty map. */
  data?: Record<string, unknown> | null;
}

/**
 * The shell with the page written into it. Pure string work, so a 404 page, a
 * post and the home page all go through this one function.
 */
export function injectIntoShell(
  shell: string,
  { lang, headTags, bodyHtml = "", hydrate = false, data }: InjectInput,
): string {
  let out = shell;

  if (lang) {
    const value = escapeHtml(lang);
    out = out.replace(HTML_OPEN, (_tag, attributes: string) => {
      const rest = attributes.replace(
        /\s+lang\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i,
        "",
      );
      return `<html${rest} lang="${value}">`;
    });
  }

  // Function replacers everywhere: `$&` and `$1` in a title or in post text
  // must land literally.
  out = out.replace(HEAD_BLOCK, (head) =>
    withoutManagedTags(head).replace(HEAD_CLOSE, () => `${headTags}</head>`),
  );

  if (bodyHtml !== "") {
    const root = hydrate
      ? `<div id="root" ${SSR_ATTRIBUTE}>`
      : '<div id="root">';
    out = out.replace(ROOT_MARKER, () => `${root}${bodyHtml}</div>`);
  }

  if (data && Object.keys(data).length > 0) {
    const block = `<script id="${SEO_DATA_ID}" type="application/json">${serializeSeoData(data)}</script>`;
    out = out.replace(BODY_CLOSE, () => `${block}</body>`);
  }

  return out;
}

/** What the server writes into the shell's <head> for a page without a snapshot (SEO-02 step 4). */
export interface ShellMeta {
  title?: string | null;
  robots?: string | null;
  lang?: string | null;
}

/**
 * Writes a page's <title>, meta robots and <html lang> into the shell and
 * leaves every other tag alone (SEO-02 step 4). This is the small form the
 * 404 shell used before SEO-01; it stays for SEO_INJECT=off and for callers
 * without a query object (tests, tools), where pages are served as the plain
 * shell. The values are escaped.
 */
export function injectShellMeta(html: string, meta: ShellMeta): string {
  let out = html;

  if (meta.lang) {
    const lang = escapeHtml(meta.lang);
    out = out.replace(HTML_OPEN, (_tag, attrs: string) => {
      const rest = attrs.replace(
        /\s+lang\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i,
        "",
      );
      return `<html${rest} lang="${lang}">`;
    });
  }

  const additions: string[] = [];
  if (meta.title) {
    const title = `<title data-seo>${escapeHtml(meta.title)}</title>`;
    const existing = /<title\b[^>]*>[\s\S]*?<\/title>/i;
    if (existing.test(out)) out = out.replace(existing, () => title);
    else additions.push(title);
  }

  out = out.replace(
    /<meta\b[^>]*\bname\s*=\s*["']?robots["']?(?=[\s/>])[^>]*>\s*/gi,
    "",
  );
  if (meta.robots) {
    additions.push(
      `<meta name="robots" content="${escapeHtml(meta.robots)}" data-seo>`,
    );
  }

  if (additions.length > 0) {
    out = out.replace(HEAD_CLOSE, () => `${additions.join("")}</head>`);
  }
  return out;
}
