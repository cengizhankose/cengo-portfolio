// Build-time prerender (PERF-03, T-06 Aşama 2, T-12).
//
//   bun scripts/prerender.ts [distDir]        (default: dist, next to package.json)
//
// Runs after the two Vite builds (package.json "build"):
//   vite build                                               -> dist/
//   vite build --ssr src/entry-server.jsx --outDir dist/server -> dist/server/entry-server.js
// and turns the client build's index.html into one finished HTML file per
// static page and language: the page drawn by src/entry-server.jsx in #root
// (marked `data-ssr`, which src/entry-client.jsx hydrates), the head from the
// page registry (getPageMeta -> renderHeadTags, the same hat the server uses
// for every other page) and `<html lang>` of the language.
//
//   /            -> dist/index.html          /tr          -> dist/tr/index.html
//   /about       -> dist/about/index.html    /tr/about    -> dist/tr/about/index.html
//   ...
//
// The pages are the static routes of src/seo/routes.js in every language that
// is open for static pages (LIVE.static): opening a language in LIVE is the
// only change a new language needs. `/blog` is not prerendered: its content
// is the database, and src/server/static.ts draws it per request with the
// same entry point, so a new post needs no deploy.
//
// The untouched index.html is kept as dist/server/_shell.html first, which is
// what the server injects into for every page it draws itself. The script can
// be run again on the same dist: it reads the kept shell.
//
// The build fails (exit 1) when a page would ship broken: no <h1>, not exactly
// one <title>, a "Loading..." placeholder, a <html lang> other than the page's
// language, a missing data-ssr marker or a render error.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { preloadFor, renderHeadTags } from "../src/seo/head";
import { injectIntoShell, readShell, SSR_ATTRIBUTE } from "../src/seo/inject";
import { getPageMeta, localePath } from "../src/seo/pages.js";
import { LIVE, matchRoute, STATIC_PATHS } from "../src/seo/routes.js";
import {
  ENTRY_FILE,
  SERVER_DIR,
  SHELL_FILE,
  type RenderPage,
} from "../src/server/ssr";

export interface PrerenderedPage {
  /** `/about`, `/tr/about`. */
  url: string;
  locale: string;
  /** Absolute path of the file written. */
  file: string;
}

/** The pages to prerender: [locale, language-independent path] for every live static route but the blog. */
export function pagesToPrerender(
  live: typeof LIVE = LIVE,
): { locale: string; path: string; url: string }[] {
  const out: { locale: string; path: string; url: string }[] = [];
  for (const locale of live.static) {
    for (const path of STATIC_PATHS as readonly string[]) {
      if (path === "/blog") continue;
      const url = localePath(locale, path);
      const route = matchRoute(url, live);
      if (route.type !== "static") continue; // not a live page: nothing to write
      out.push({ locale, path, url });
    }
  }
  return out;
}

/** The file a page's URL is written to, inside `distRoot`: `/` -> index.html, `/tr/about` -> tr/about/index.html. */
export function fileForUrl(distRoot: string, url: string): string {
  const segments = url.split("/").filter(Boolean);
  return join(distRoot, ...segments, "index.html");
}

/**
 * Problems that would make a page ship broken; an empty list means the page
 * is fine. `locale` is the language the page must declare.
 */
export function validatePage(html: string, locale: string): string[] {
  const problems: string[] = [];
  const count = (pattern: RegExp) => (html.match(pattern) ?? []).length;
  if (count(/<h1[\s>]/g) === 0) problems.push("no <h1>");
  const titles = count(/<title[\s>]/g);
  if (titles !== 1) problems.push(`${titles} <title> elements (expected 1)`);
  if (/Loading\.\.\./.test(html)) problems.push('"Loading..." placeholder');
  if (!html.includes(`<div id="root" ${SSR_ATTRIBUTE}>`)) {
    problems.push(`#root has no ${SSR_ATTRIBUTE} marker`);
  }
  if (!new RegExp(`<html\\b[^>]*\\blang="${locale}"`).test(html)) {
    problems.push(`<html lang> is not "${locale}"`);
  }
  // Nothing executable in the body: React's own `$RC` streaming script
  // (an outlined Suspense boundary) would be blocked by the CSP.
  const body = html.slice(html.indexOf('<div id="root"'));
  if (/<script\b(?![^>]*type="application\/json")/i.test(body)) {
    problems.push("a script inside the body (the CSP would block it)");
  }
  return problems;
}

export async function prerender(
  distRoot: string,
  render?: RenderPage,
): Promise<PrerenderedPage[]> {
  const root = resolve(distRoot);
  const serverDir = join(root, SERVER_DIR);
  const shellCopy = join(serverDir, SHELL_FILE);
  const indexFile = join(root, "index.html");

  // The pristine shell: the kept copy when an earlier run made one.
  if (!existsSync(shellCopy)) {
    if (!existsSync(indexFile)) {
      throw new Error(
        `prerender: ${indexFile} not found; run vite build first`,
      );
    }
    mkdirSync(serverDir, { recursive: true });
    writeFileSync(shellCopy, readFileSync(indexFile, "utf8"));
  }
  const shell = readShell(shellCopy);

  const renderPage =
    render ??
    ((await import(pathToFileURL(join(serverDir, ENTRY_FILE)).href))
      .render as RenderPage);

  const written: PrerenderedPage[] = [];
  const failures: string[] = [];
  for (const { locale, url } of pagesToPrerender()) {
    try {
      const route = matchRoute(url);
      const meta = getPageMeta(route, locale);
      const { html: bodyHtml } = await renderPage(url);
      const page = injectIntoShell(shell, {
        lang: meta.lang,
        headTags: renderHeadTags(meta, { preload: preloadFor(route, locale) }),
        bodyHtml,
        hydrate: true,
      });
      const problems = validatePage(page, meta.lang ?? locale);
      if (problems.length > 0) {
        failures.push(`${url}: ${problems.join("; ")}`);
        continue;
      }
      const file = fileForUrl(root, url);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, page);
      written.push({ url, locale, file });
    } catch (error) {
      failures.push(
        `${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(`prerender failed:\n  ${failures.join("\n  ")}`);
  }
  return written;
}

if (import.meta.main) {
  const dist = process.argv[2] ?? join(import.meta.dir, "..", "dist");
  try {
    const pages = await prerender(dist);
    for (const { url, file } of pages) {
      console.log(
        `prerendered ${url.padEnd(16)} -> ${file.replace(resolve(dist) + sep, "")}`,
      );
    }
    console.log(`${pages.length} pages prerendered`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
