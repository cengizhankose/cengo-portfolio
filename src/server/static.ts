import type { Context, Hono } from "hono";
import { stat } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { errorFields, log } from "../api/log";
import type { PostQueries } from "../db/queries/posts";
import {
  displayLocale,
  getPageMeta,
  localePath,
  routePathname,
} from "../seo/pages.js";
import { LIVE, matchRoute } from "../seo/routes.js";
import { contentTypeFor } from "./mime";
import { safeResolve } from "./safe-path";

export interface MountSiteOptions {
  /** Directory holding the Vite build output (index.html, assets/, copied public/ files). */
  distDir: string;
  /**
   * Post lookup for `/blog/:slug` and `/tr/blog/:slug` (SEO-08, SEO-11): a
   * missing or draft slug gets the 404 shell, a post in the other language a
   * 301 to its own path, a database error 503. Pass createApp's `queries`.
   * Without it post URLs get the shell unchecked (tests, tools).
   */
  queries?: Pick<PostQueries, "getPostForLocale">;
}

const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT_LIVED = "public, max-age=3600";
const REVALIDATE = "no-cache";
const NO_STORE = "no-store";
const HTML_TYPE = contentTypeFor("index.html");
/** SEO-08: how long a client should wait after a 503 from a failed post lookup. */
const RETRY_AFTER_SECONDS = "120";

/** Directories whose file names carry a hash or version (`v1`): cacheable for a year. */
const IMMUTABLE_PREFIXES = ["/assets/", "/img/", "/fonts/"];
/** Directories that only ever hold files: a miss there is a 404, never the SPA shell. */
const FILE_ONLY_DIRS = ["/assets", "/img", "/fonts", "/.well-known"];

interface HtmlDoc {
  body: Uint8Array<ArrayBuffer>;
  etag: string;
}

/** What the server writes into the shell's <head> for a 404 (SEO-02 step 4). */
export interface ShellMeta {
  title?: string | null;
  robots?: string | null;
  lang?: string | null;
}

type Route = ReturnType<typeof matchRoute>;
type Locale = Parameters<PostQueries["getPostForLocale"]>[1];

/**
 * Serves the built site on `app` for GET/HEAD requests (T-11 static policy):
 *
 * 1. Undecodable, traversing or hidden (dot-segment) paths -> 404 `no-store`.
 * 2. HTML documents (`/`, `/x.html`, `<dir>/index.html` for `/dir` and `/dir/`)
 *    come from memory with a strong ETag and `Cache-Control: no-cache`;
 *    a matching `If-None-Match` gets `304`.
 * 3. Other existing files are streamed with `Bun.file`; hashed directories
 *    (`/assets/`, `/img/`, `/fonts/`) are `immutable`, the rest `max-age=3600`.
 * 4. A miss with a file extension or under a file-only directory
 *    (`/assets`, `/img`, `/fonts`, `/.well-known`) -> 404 `text/plain` + `no-store`.
 * 5. Everything else is a page path, answered from src/seo/routes.js
 *    (SEO-02, SEC-23, SEO-08, SEO-11):
 *    - another spelling of a known route (trailing slash, upper case) -> 301
 *      to its one canonical path, query string kept;
 *    - a live static route -> the shell, 200 (`X-Robots-Tag` when the page is
 *      noindex, T-10 portfolio);
 *    - a post route -> checked with `queries`: published in this language
 *      200, in the other language 301 to that language's path, missing or
 *      draft 404 + noindex, lookup error 503 + `Retry-After`;
 *    - anything else (including a language that is not live yet) -> the
 *      shell with 404, `<meta name="robots" content="noindex">`, the
 *      "Page not found" title and `X-Robots-Tag: noindex`.
 *    No redirect is ever based on Accept-Language or IP (T-12).
 *
 * Register API routes before calling this: it answers every GET/HEAD path.
 */
export function mountSite(
  app: Hono<any, any, any>,
  { distDir, queries }: MountSiteOptions,
): void {
  const distRoot = resolve(distDir);
  const htmlByTarget = indexHtmlFiles(distRoot);
  const shellFile = join(distRoot, "index.html");
  const docs = new Map<string, Promise<HtmlDoc>>();
  const shellVariants = new Map<string, Promise<HtmlDoc>>();

  if (!htmlByTarget.has(shellFile)) {
    console.warn(`[static] ${shellFile} not found; SPA routes will answer 500`);
  }

  const loadDoc = (file: string): Promise<HtmlDoc> => {
    let doc = docs.get(file);
    if (!doc) {
      doc = Bun.file(file).bytes().then(toHtmlDoc);
      doc.catch(() => docs.delete(file)); // retry on the next request instead of caching the failure
      docs.set(file, doc);
    }
    return doc;
  };

  // The shell with a 404's title/robots/lang. The meta comes from the page
  // registry, never from the request, so the cache holds a handful of entries.
  const loadShellVariant = (meta: ShellMeta): Promise<HtmlDoc> => {
    const key = JSON.stringify([meta.title, meta.robots, meta.lang]);
    let doc = shellVariants.get(key);
    if (!doc) {
      doc = loadDoc(shellFile).then(({ body }) =>
        toHtmlDoc(
          new TextEncoder().encode(
            injectShellMeta(new TextDecoder().decode(body), meta),
          ) as Uint8Array<ArrayBuffer>,
        ),
      );
      doc.catch(() => shellVariants.delete(key));
      shellVariants.set(key, doc);
    }
    return doc;
  };

  // dist/ does not change while the process runs: read every HTML document once, up front.
  for (const file of new Set(htmlByTarget.values())) void loadDoc(file);

  const sendHtml = async (
    c: Context,
    file: string,
    status: 200 | 404,
    headers: Record<string, string> = {},
  ) => {
    const { body, etag } = await loadDoc(file);
    if (status === 200 && etagMatches(c.req.header("If-None-Match"), etag)) {
      return c.body(null, 304, {
        ETag: etag,
        "Cache-Control": REVALIDATE,
        ...headers,
      });
    }
    return c.body(body, status, {
      "Content-Type": HTML_TYPE,
      "Content-Length": String(body.byteLength), // kept on HEAD, where the body is dropped
      "Cache-Control": REVALIDATE,
      ETag: etag,
      ...headers,
    });
  };

  const shellMissing = (c: Context) =>
    c.text("Site shell missing", 500, { "Cache-Control": NO_STORE });

  const renderShell = (
    c: Context,
    status: 200 | 404,
    headers?: Record<string, string>,
  ) => {
    if (!htmlByTarget.has(shellFile)) return shellMissing(c);
    return sendHtml(c, shellFile, status, headers);
  };

  // 404 page path (SEO-02, SEC-23, SEO-08): the shell, with the not-found
  // title and noindex in <head> and in X-Robots-Tag. The SPA renders NotFound.
  const renderNotFound = async (c: Context, route: Route, post = false) => {
    if (!htmlByTarget.has(shellFile)) return shellMissing(c);
    const locale = post ? route.locale : displayLocale(route);
    const meta = getPageMeta(route, locale, { notFound: true });
    const { body } = await loadShellVariant(meta);
    return c.body(body, 404, {
      "Content-Type": HTML_TYPE,
      "Content-Length": String(body.byteLength),
      "Cache-Control": NO_STORE,
      "X-Robots-Tag": meta.robots ?? "noindex",
    });
  };

  // SEO-08: the post lookup failed. A 503 keeps a real post in the index
  // (a 404 would drop it); no noindex. The shell still loads for visitors.
  const renderUnavailable = async (c: Context) => {
    if (!htmlByTarget.has(shellFile)) return shellMissing(c);
    const { body } = await loadDoc(shellFile);
    return c.body(body, 503, {
      "Content-Type": HTML_TYPE,
      "Content-Length": String(body.byteLength),
      "Cache-Control": NO_STORE,
      "Retry-After": RETRY_AFTER_SECONDS,
    });
  };

  const renderPost = async (c: Context, route: Route, search: string) => {
    if (!queries || route.type !== "post") return renderShell(c, 200);
    let found: Awaited<ReturnType<PostQueries["getPostForLocale"]>>;
    try {
      found = await queries.getPostForLocale(
        route.slug!,
        route.locale as Locale,
      );
    } catch (error) {
      log("error", "post lookup failed", {
        reqId: c.get("requestId"),
        path: new URL(c.req.url).pathname,
        ...errorFields(error),
      });
      return renderUnavailable(c);
    }
    if (found.status === "ok") return renderShell(c, 200);
    if (found.status === "moved" && LIVE.post.includes(found.locale)) {
      // SEO-11: one 301 to the post's own language path. Built from the
      // matched slug and a known prefix only: never from the request's host.
      return c.redirect(
        localePath(found.locale, `/blog/${route.slug}`) + search,
        301,
      );
    }
    return renderNotFound(c, route, true);
  };

  const renderPage = async (c: Context, pathname: string, search: string) => {
    const route = knownRoute(pathname);
    if (route.type === "notfound") return renderNotFound(c, route);

    const canonical = routePathname(route);
    if (canonical !== null && canonical !== pathname) {
      return c.redirect(canonical + search, 301);
    }

    if (route.type === "post") return renderPost(c, route, search);

    // Live static page. T-10: a noindex page (portfolio) says so in the
    // response header as well, so it applies before any JavaScript runs.
    const { robots } = getPageMeta(route, route.locale);
    return renderShell(c, 200, robots ? { "X-Robots-Tag": robots } : {});
  };

  app.get("*", async (c) => {
    const { pathname, search } = new URL(c.req.url);
    const target = safeResolve(distRoot, pathname);
    if (target === null) return notFound(c);
    const sitePath = toSitePath(distRoot, target);
    if (isHiddenPath(sitePath)) return notFound(c);
    // `/robots.txt/` must not serve robots.txt: a trailing slash only matches a directory index.
    const asDirectory = pathname.endsWith("/");

    const htmlFile = htmlByTarget.get(target);
    if (htmlFile && (!asDirectory || htmlFile === join(target, "index.html")))
      return sendHtml(c, htmlFile, 200);

    const info = asDirectory ? null : await stat(target).catch(() => null);
    if (info?.isFile()) return sendFile(c, target, sitePath, info.size);

    if (extname(sitePath) !== "" || isFileOnlyPath(sitePath))
      return notFound(c);

    return renderPage(c, pathname, search);
  });
}

/**
 * The route a page path stands for. An exact match wins; otherwise another
 * spelling of a known route (upper case, extra trailing slashes) resolves to
 * that route so the caller can redirect to it (SEO-02 step 3d). React Router
 * matches case-insensitively, the route table does not: the 301 keeps one URL
 * per page.
 */
function knownRoute(pathname: string): Route {
  const exact = matchRoute(pathname);
  if (exact.type !== "notfound") return exact;
  const folded = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  if (folded === pathname) return exact;
  const variant = matchRoute(folded);
  return variant.type === "notfound" ? exact : variant;
}

/**
 * Writes a page's <title>, meta robots and <html lang> into the shell
 * (SEO-02 step 4). Other tags are left alone; the values are escaped.
 * SEO-01 (T-06 Aşama 1) generalises this to every route.
 */
export function injectShellMeta(html: string, meta: ShellMeta): string {
  let out = html;

  if (meta.lang) {
    const lang = escapeHtml(meta.lang);
    out = out.replace(/<html\b([^>]*)>/i, (_tag, attrs: string) => {
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

  out = out.replace(/<meta\b[^>]*\bname\s*=\s*["']?robots\b[^>]*>\s*/gi, "");
  if (meta.robots) {
    additions.push(
      `<meta name="robots" content="${escapeHtml(meta.robots)}" data-seo>`,
    );
  }

  if (additions.length > 0) {
    out = out.replace(/<\/head>/i, () => `${additions.join("")}</head>`);
  }
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toHtmlDoc(body: Uint8Array<ArrayBuffer>): HtmlDoc {
  return { body, etag: `"${Bun.hash(body).toString(16)}"` };
}

/** Absolute file or directory path -> absolute path of the HTML document it serves. */
function indexHtmlFiles(distRoot: string): Map<string, string> {
  const byTarget = new Map<string, string>();
  let files: string[];
  try {
    files = Array.from(
      new Bun.Glob("**/*.html").scanSync({ cwd: distRoot, onlyFiles: true }),
    );
  } catch {
    return byTarget; // dist/ missing: nothing to serve
  }
  for (const rel of files) {
    const file = join(distRoot, rel);
    byTarget.set(file, file);
    if (basename(file) === "index.html") byTarget.set(dirname(file), file);
  }
  return byTarget;
}

function sendFile(c: Context, path: string, sitePath: string, size: number) {
  const cacheControl = IMMUTABLE_PREFIXES.some((p) => sitePath.startsWith(p))
    ? IMMUTABLE
    : SHORT_LIVED;
  // A BunFile body lets Bun stream the file (sendfile); hono/bun's own
  // serveStatic hands BunFile to c.body the same way. HEAD never reads it.
  return c.body(Bun.file(path) as unknown as ReadableStream, 200, {
    "Content-Type": contentTypeFor(sitePath),
    "Content-Length": String(size), // kept on HEAD, where the body is dropped
    "Cache-Control": cacheControl,
  });
}

function notFound(c: Context) {
  return c.text("Not found", 404, { "Cache-Control": NO_STORE });
}

/** `/abs/dist/assets/a.js` -> `/assets/a.js`; the dist root itself -> `/`. */
function toSitePath(distRoot: string, target: string): string {
  return "/" + relative(distRoot, target).split(sep).join("/");
}

/** Dotfiles and dot directories are never served, except under `/.well-known/`. */
function isHiddenPath(sitePath: string): boolean {
  const segments = sitePath.split("/").filter(Boolean);
  return segments.some(
    (s, i) => s.startsWith(".") && !(i === 0 && s === ".well-known"),
  );
}

function isFileOnlyPath(sitePath: string): boolean {
  return FILE_ONLY_DIRS.some(
    (dir) => sitePath === dir || sitePath.startsWith(dir + "/"),
  );
}

/** RFC 9110 weak comparison: `W/` prefixes are ignored, `*` matches any current representation. */
function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const bare = etag.replace(/^W\//, "");
  return ifNoneMatch.split(",").some((candidate) => {
    const value = candidate.trim();
    return value === "*" || value.replace(/^W\//, "") === bare;
  });
}
