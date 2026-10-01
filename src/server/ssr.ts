// The server side of PERF-03 (T-06 Aşama 2): finding the build's server render,
// keeping its results, and the chunk hints of the lazily loaded blog pages.
//
// `vite build --ssr src/entry-server.jsx --outDir dist/server` writes one
// self-contained module (ssr.noExternal, vite.config.js) that exports
// `render(url, { fallback, errors })` and returns `{ html }`. It is loaded
// here for the pages drawn per request (the blog) and by scripts/prerender.ts
// for the static pages at build time.
//
// dist/server is private: src/server/static.ts answers 404 for everything
// under it, so neither the bundle nor the shell copy below is ever downloaded.
import { existsSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { errorFields, log } from "../api/log";
import { SSR_ATTRIBUTE } from "../seo/inject";
import { localePath } from "../seo/pages.js";
import { STATIC_PATHS } from "../seo/routes.js";
import { LOCALES } from "../seo/site.js";

export const SERVER_DIR = "server";
export const ENTRY_FILE = "entry-server.js";
/** The client build's index.html as Vite wrote it, kept before the prerender overwrites dist/index.html. */
export const SHELL_FILE = "_shell.html";
/** Client build: module id -> the files it needs (vite.config.js build.ssrManifest). */
export const SSR_MANIFEST = join(".vite", "ssr-manifest.json");

export interface RenderOptions {
  /** swr data by key: what the page draws from (src/lib/swrFallback.js). */
  fallback?: Record<string, unknown>;
  /** swr keys whose request failed, by HTTP status: a missing post is `{ "/api/posts/x": 404 }`. */
  errors?: Record<string, number>;
}

export type RenderPage = (
  url: string,
  options?: RenderOptions,
) => Promise<{ html: string }>;

/** True when `file` exists (kept here with the other startup-time file checks; the request path reads nothing synchronously). */
export function fileExists(file: string): boolean {
  return existsSync(file);
}

/** The HTML shell injectIntoShell() writes into: the pristine copy once the build prerendered, else dist/index.html. */
export function shellPath(distRoot: string): string {
  const kept = join(distRoot, SERVER_DIR, SHELL_FILE);
  return existsSync(kept) ? kept : join(distRoot, "index.html");
}

/** dist/server/entry-server.js, or null when the build has no server bundle (dev, tests, a client-only build). */
export function entryPath(distRoot: string): string | null {
  const entry = join(distRoot, SERVER_DIR, ENTRY_FILE);
  return existsSync(entry) ? entry : null;
}

/**
 * The build's `render`, or null. A bundle that cannot be loaded is logged and
 * treated as absent: the site then serves head tags and data with an empty
 * #root, which the browser draws itself (createRoot), exactly as before PERF-03.
 */
export async function loadRenderer(
  distRoot: string,
): Promise<RenderPage | null> {
  const entry = entryPath(distRoot);
  if (!entry) return null;
  try {
    const module = await import(pathToFileURL(entry).href);
    if (typeof module.render !== "function") {
      throw new Error("entry-server.js exports no render()");
    }
    return module.render as RenderPage;
  } catch (error) {
    log("error", "ssr bundle could not be loaded", errorFields(error));
    return null;
  }
}

// What a blog page needs beyond the entry chunk, by the modules of the
// client build that hold it. The page chunks are lazy (PERF-04), so nothing in
// the HTML points at them; naming them lets the browser fetch them while the
// entry script loads instead of after it has run.
const BLOG_MODULES = {
  home: ["src/pages/blog/BlogHome.jsx", "src/pages/blog/style.css"],
  post: ["src/pages/blog/BlogPost.jsx", "src/pages/blog/style.css"],
} as const;

export type BlogPage = keyof typeof BLOG_MODULES;

/**
 * The script files of the lazy blog pages, as site paths, from the client
 * build's manifest. Empty lists when the manifest is missing or unreadable
 * (a hint is an optimisation, never a requirement).
 */
export function blogChunks(distRoot: string): Record<BlogPage, string[]> {
  const none = { home: [], post: [] };
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(readFileSync(join(distRoot, SSR_MANIFEST), "utf8"));
  } catch {
    return none;
  }
  const scripts = (modules: readonly string[]) => [
    ...new Set(
      modules
        .flatMap((id) => {
          const files = manifest[id];
          return Array.isArray(files) ? files : [];
        })
        .filter(
          (file): file is string =>
            typeof file === "string" &&
            file.startsWith("/assets/") &&
            file.endsWith(".js"),
        ),
    ),
  ];
  return {
    home: scripts(BLOG_MODULES.home),
    post: scripts(BLOG_MODULES.post),
  };
}

/** `<link rel="modulepreload">` tags for site paths (same form as the ones Vite writes for the entry). */
export function modulePreloadTags(files: readonly string[]): string {
  return files
    .map((file) => `<link rel="modulepreload" crossorigin href="${file}">`)
    .join("");
}

/**
 * Finished renders by what they were made from: `render()` depends only on the
 * URL and the data it is given, so an unchanged page is never drawn twice and
 * a changed post (new `updatedAt`, new text) is drawn again on its next
 * request, however fresh the old entry is. Bounded (oldest out first); a
 * render in flight is shared by concurrent requests and a failed one is not
 * kept.
 */
export function createRenderCache(max = 100) {
  const entries = new Map<string, Promise<string>>();
  return {
    get size() {
      return entries.size;
    },
    clear: () => entries.clear(),
    async html(
      url: string,
      options: RenderOptions,
      render: RenderPage,
    ): Promise<string> {
      const key = `${url}\u0000${Bun.hash(JSON.stringify(options)).toString(16)}`;
      let hit = entries.get(key);
      if (hit) {
        entries.delete(key); // re-insert: most recently used last
        entries.set(key, hit);
        return hit;
      }
      hit = render(url, options).then(({ html }) => html);
      entries.set(key, hit);
      hit.catch(() => {
        if (entries.get(key) === hit) entries.delete(key);
      });
      while (entries.size > max) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      return hit;
    },
  };
}

/**
 * The static pages the build prerendered (scripts/prerender.ts), as
 * `<locale>:<route path>` -> the document's file. A page counts when its file
 * exists and its #root carries the `data-ssr` marker, so a plain Vite
 * `index.html` (a client-only build, the test fixtures) is never mistaken for
 * one. The blog is drawn per request and never prerendered.
 */
export function prerenderedPages(
  distRoot: string,
  htmlByTarget: Map<string, string>,
): Map<string, string> {
  const pages = new Map<string, string>();
  for (const locale of LOCALES) {
    for (const path of STATIC_PATHS as readonly string[]) {
      if (path === "/blog") continue;
      const dir = join(
        distRoot,
        localePath(locale, path).split("/").filter(Boolean).join(sep),
      );
      const file = join(dir, "index.html");
      if (htmlByTarget.get(dir) !== file) continue;
      try {
        if (
          readFileSync(file, "utf8").includes(
            `<div id="root" ${SSR_ATTRIBUTE}>`,
          )
        ) {
          pages.set(`${locale}:${path}`, file);
        }
      } catch {
        // unreadable: served by the runtime path instead
      }
    }
  }
  return pages;
}
