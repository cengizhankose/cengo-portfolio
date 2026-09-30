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
import { toCard } from "../api/routes/posts";
import { LIST_DEFAULT_LIMIT } from "../db/post-input";
import type { PostQueries } from "../db/queries/posts";
import { blogIndexLists } from "../lib/swrFallback.js";
import { postKey } from "../lib/swr.js";
import { preloadFor, renderHeadTags } from "../seo/head";
import {
  findStylesheets,
  injectIntoShell,
  injectShellMeta,
  readShell,
  type ShellMeta,
} from "../seo/inject";
import {
  displayLocale,
  getPageMeta,
  localePath,
  routePathname,
} from "../seo/pages.js";
import { LIVE, matchRoute } from "../seo/routes.js";
import { renderNotFoundSnapshot, renderSnapshot } from "../seo/snapshot";
import { contentTypeFor } from "./mime";
import { safeResolve } from "./safe-path";

// The 404 shell's small head rewrite moved to src/seo/inject.ts with SEO-01;
// re-exported here for the callers that import it from this module.
export { injectShellMeta };
export type { ShellMeta };

/** The queries the site needs: the post lookup, and the list for the /blog snapshot. */
export type SiteQueries = Pick<PostQueries, "getPostForLocale"> &
  Partial<Pick<PostQueries, "listPublishedPosts">>;

export interface MountSiteOptions {
  /** Directory holding the Vite build output (index.html, assets/, copied public/ files). */
  distDir: string;
  /**
   * Post lookup for `/blog/:slug` and `/tr/blog/:slug` (SEO-08, SEO-11): a
   * missing or draft slug gets the 404 shell, a post in the other language a
   * 301 to its own path, a database error 503. Pass createApp's `queries`.
   * Without it post URLs get the shell unchecked (tests, tools).
   */
  queries?: SiteQueries;
  /**
   * SEO-01: write each page's head tags, a readable snapshot and the first
   * data into the HTML (src/seo). Default: on when `queries` is given, unless
   * the environment variable SEO_INJECT is `off` (the kill switch:
   * `outplane env set SEO_INJECT=off`, then deploy). Off, pages are the plain
   * shell as before SEO-01 and only a 404 gets its title and robots tag.
   */
  seoInject?: boolean;
  /** How long a slug that is not a published post is remembered, in ms (default 30 s, SEO-08 step 5). */
  missingTtlMs?: number;
  /** Clock in ms (tests pass a fake one). */
  now?: () => number;
}

const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT_LIVED = "public, max-age=3600";
const REVALIDATE = "no-cache";
const NO_STORE = "no-store";
const HTML_TYPE = contentTypeFor("index.html");
/** SEO-08: how long a client should wait after a 503 from a failed post lookup. */
const RETRY_AFTER_SECONDS = "120";
/** SEO-08 step 5: an unknown slug is asked of the database at most once in this time. */
const MISSING_TTL_MS = 30_000;
/** ... and at most this many unknown slugs are remembered (oldest first out), so random URLs cannot grow the map. */
const MISSING_MAX = 500;

/**
 * Class names of the blog pages' stylesheet, which Vite ships with the lazy
 * blog chunk: the server links it in the <head> of the blog pages so their
 * snapshot is styled from the first paint (src/seo/inject.ts findStylesheets).
 */
const BLOG_STYLE_MARKERS = [".blog-container", ".blog-post-container"];

/** Directories whose file names carry a hash or version (`v1`): cacheable for a year. */
const IMMUTABLE_PREFIXES = ["/assets/", "/img/", "/fonts/"];
/** Directories that only ever hold files: a miss there is a 404, never the SPA shell. */
const FILE_ONLY_DIRS = ["/assets", "/img", "/fonts", "/.well-known"];

interface HtmlDoc {
  body: Uint8Array<ArrayBuffer>;
  etag: string;
}

type Route = ReturnType<typeof matchRoute>;
type Locale = Parameters<PostQueries["getPostForLocale"]>[1];

/**
 * Serves the built site on `app` for GET/HEAD requests (T-11 static policy):
 *
 * 1. Undecodable, traversing or hidden (dot-segment) paths -> 404 `no-store`.
 * 2. HTML documents (`/x.html`, `<dir>/index.html` for `/dir` and `/dir/`)
 *    come from memory with a strong ETag and `Cache-Control: no-cache`;
 *    a matching `If-None-Match` gets `304`.
 * 3. Other existing files are streamed with `Bun.file`; hashed directories
 *    (`/assets/`, `/img/`, `/fonts/`) are `immutable`, the rest `max-age=3600`.
 * 4. A miss with a file extension or under a file-only directory
 *    (`/assets`, `/img`, `/fonts`, `/.well-known`) -> 404 `text/plain` + `no-store`.
 * 5. Everything else is a page path (and so is `/`), answered from
 *    src/seo/routes.js (SEO-02, SEC-23, SEO-08, SEO-11):
 *    - another spelling of a known route (trailing slash, upper case) -> 301
 *      to its one canonical path, query string kept;
 *    - a live static route -> 200 (`X-Robots-Tag` when the page is noindex,
 *      T-10 portfolio);
 *    - a post route -> checked with `queries`: published in this language
 *      200, in the other language 301 to that language's path, missing or
 *      draft 404 + noindex, lookup error 503 + `Retry-After`;
 *    - anything else (including a language that is not live yet) -> 404 with
 *      `noindex` in the page and in `X-Robots-Tag`.
 *    The language of a page comes from its URL prefix alone, never from a
 *    request header or the client's address (T-12).
 *
 * What a 200 or 404 page contains depends on `seoInject` (SEO-01, T-06
 * Aşama 1). On: src/seo builds the page from the same data the app shows and
 * writes it into the shell: the <head> tags of getPageMeta() (title,
 * description, robots, canonical, hreflang, Open Graph, Twitter, JSON-LD, the
 * hero preload on the home page), `<html lang>`, a readable snapshot of the
 * content in <div id="root"> and, for the blog, the first data as a JSON block
 * the app's swr reads. Off: the plain shell, as before SEO-01.
 *
 * Register API routes before calling this: it answers every GET/HEAD path.
 */
export function mountSite(
  app: Hono<any, any, any>,
  {
    distDir,
    queries,
    seoInject,
    missingTtlMs = MISSING_TTL_MS,
    now = Date.now,
  }: MountSiteOptions,
): void {
  const distRoot = resolve(distDir);
  const htmlByTarget = indexHtmlFiles(distRoot);
  const shellFile = join(distRoot, "index.html");
  const docs = new Map<string, Promise<HtmlDoc>>();
  const shellVariants = new Map<string, Promise<HtmlDoc>>();
  const staticPages = new Map<string, HtmlDoc>();
  const notFoundPages = new Map<string, HtmlDoc>();
  const missingSlugs = new Map<string, number>();

  if (!htmlByTarget.has(shellFile)) {
    console.warn(`[static] ${shellFile} not found; SPA routes will answer 500`);
  }

  // SEO-01: on by default wherever the site has its queries (production); a
  // shell the injection cannot rewrite stops the process here, at startup,
  // rather than serving pages without SEO.
  const seo =
    (seoInject ??
      (queries !== undefined && seoEnabled(process.env.SEO_INJECT))) &&
    htmlByTarget.has(shellFile);
  const shellText = seo ? readShell(shellFile) : "";
  const blogStyles = seo
    ? [
        ...new Set(
          BLOG_STYLE_MARKERS.flatMap((marker) =>
            findStylesheets(distRoot, marker),
          ),
        ),
      ].sort()
    : [];

  const loadDoc = (file: string): Promise<HtmlDoc> => {
    let doc = docs.get(file);
    if (!doc) {
      doc = Bun.file(file).bytes().then(toHtmlDoc);
      doc.catch(() => docs.delete(file)); // retry on the next request instead of caching the failure
      docs.set(file, doc);
    }
    return doc;
  };

  // The shell with a 404's title/robots/lang (injection off). The meta comes
  // from the page registry, never from the request, so the cache holds a
  // handful of entries.
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

  // A finished document with its validators: a matching If-None-Match gets
  // 304 (only ever for a 200).
  const respond = (
    c: Context,
    { body, etag }: HtmlDoc,
    status: 200 | 404,
    headers: Record<string, string> = {},
  ) => {
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

  const sendHtml = async (
    c: Context,
    file: string,
    status: 200 | 404,
    headers: Record<string, string> = {},
  ) => respond(c, await loadDoc(file), status, headers);

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

  // Text to the bytes a response carries, with its ETag.
  const toDoc = (text: string): HtmlDoc =>
    toHtmlDoc(new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>);

  // The 404 page (SEC-23, SEO-02, SEO-08): title and robots in <head> and in
  // X-Robots-Tag; with injection on, also the description, `<html lang>` in the
  // language of the 404 and its text in <div id="root"> (the app renders the
  // same NotFound page).
  const renderNotFound = async (c: Context, route: Route, post = false) => {
    if (!htmlByTarget.has(shellFile)) return shellMissing(c);
    const locale = post ? route.locale : displayLocale(route);
    const meta = getPageMeta(route, locale, { notFound: true });
    let doc: HtmlDoc;
    if (seo) {
      const key = `${post ? "post" : "page"}:${locale}`;
      let page = notFoundPages.get(key);
      if (!page) {
        page = toDoc(
          injectIntoShell(shellText, {
            lang: meta.lang,
            headTags: renderHeadTags(meta),
            bodyHtml: renderNotFoundSnapshot(route, { post }),
          }),
        );
        notFoundPages.set(key, page);
      }
      doc = page;
    } else {
      doc = await loadShellVariant(meta);
    }
    return c.body(doc.body, 404, {
      "Content-Type": HTML_TYPE,
      "Content-Length": String(doc.body.byteLength),
      "Cache-Control": NO_STORE,
      "X-Robots-Tag": meta.robots ?? "noindex",
    });
  };

  // SEO-08: the lookup failed. A 503 keeps a real page in the index (a 404
  // would drop it); no noindex. The shell still loads for visitors, so the app
  // can try the API itself.
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

  // SEO-08 step 5: a slug the database said is not a published post is not
  // asked again for a while, so a bot walking random /blog/<x> URLs cannot
  // turn every request into a query. Only "missing" is kept (a database error
  // never is); the map is bounded and its oldest entries go first.
  const isKnownMissing = (slug: string) => {
    const until = missingSlugs.get(slug);
    if (until === undefined) return false;
    if (until > now()) return true;
    missingSlugs.delete(slug);
    return false;
  };
  const rememberMissing = (slug: string) => {
    missingSlugs.delete(slug);
    missingSlugs.set(slug, now() + missingTtlMs);
    while (missingSlugs.size > MISSING_MAX) {
      const oldest = missingSlugs.keys().next().value;
      if (oldest === undefined) break;
      missingSlugs.delete(oldest);
    }
  };

  // A page assembled by src/seo: head tags from getPageMeta(), the snapshot
  // and the data block written into the shell.
  const composePage = (
    route: Route,
    locale: string,
    data: { post?: unknown } = {},
    snapshot: { lists?: unknown[][]; post?: unknown } = {},
    fallback: Record<string, unknown> | null = null,
    stylesheets: readonly string[] = [],
  ) => {
    const meta = getPageMeta(route, locale, data);
    return toDoc(
      injectIntoShell(shellText, {
        lang: meta.lang,
        headTags: renderHeadTags(meta, {
          preload: preloadFor(route, meta.lang ?? locale),
          stylesheets,
        }),
        bodyHtml: renderSnapshot(route, meta.lang ?? locale, snapshot as any),
        data: fallback,
      }),
    );
  };

  // A published post in its own language: the article, its head tags (canonical
  // in its language, hreflang pairs, BlogPosting) and the post itself as the
  // swr key the page will ask for (/api/posts/<slug>).
  const renderPublishedPost = (c: Context, route: Route, post: any) => {
    const doc = composePage(
      route,
      route.locale,
      { post },
      { post },
      { [postKey(route.slug)!]: post },
      blogStyles,
    );
    return respond(c, doc, 200);
  };

  const renderPost = async (c: Context, route: Route, search: string) => {
    if (!queries || route.type !== "post") return renderShell(c, 200);
    if (isKnownMissing(route.slug!)) return renderNotFound(c, route, true);
    let found: Awaited<ReturnType<PostQueries["getPostForLocale"]>>;
    try {
      found = await queries.getPostForLocale(
        route.slug!,
        route.locale as Locale,
      );
    } catch (error) {
      log("error", "post lookup failed", {
        reqId: c.get("requestId"),
        path: requestUrl(c).pathname,
        ...errorFields(error),
      });
      return renderUnavailable(c);
    }
    if (found.status === "ok") {
      return seo
        ? renderPublishedPost(c, route, found.post)
        : renderShell(c, 200);
    }
    if (found.status === "moved" && LIVE.post.includes(found.locale)) {
      // SEO-11: one 301 to the post's own language path. Built from the
      // matched slug and a known prefix only: never from the request's host.
      return c.redirect(
        localePath(found.locale, `/blog/${route.slug}`) + search,
        301,
      );
    }
    if (found.status === "missing") rememberMissing(route.slug!);
    return renderNotFound(c, route, true);
  };

  // The blog index: one list per group of the page (src/lib/swrFallback.js,
  // T-12), newest first, cards only. The same lists go into the page as the
  // swr data for their API keys, so the app shows them without asking again.
  const renderBlog = async (c: Context, route: Route) => {
    const list = queries?.listPublishedPosts;
    if (!list) return renderShell(c, 200);
    const lists = blogIndexLists(route.locale);
    let rows: Awaited<ReturnType<NonNullable<typeof list>>>[];
    try {
      rows = await Promise.all(
        lists.map((entry) =>
          list({
            lang: entry.lang as Locale,
            missingIn: (entry as { missingIn?: Locale }).missingIn,
            limit: LIST_DEFAULT_LIMIT,
          }),
        ),
      );
    } catch (error) {
      log("error", "post list failed", {
        reqId: c.get("requestId"),
        path: requestUrl(c).pathname,
        ...errorFields(error),
      });
      return renderUnavailable(c);
    }
    const cards = rows.map((posts) => posts.map(toCard));
    const fallback = Object.fromEntries(
      lists.map(({ key }, index) => [key, cards[index]]),
    );
    return respond(
      c,
      composePage(
        route,
        route.locale,
        {},
        { lists: cards },
        fallback,
        blogStyles,
      ),
      200,
    );
  };

  // A live static page. Its content never changes while the process runs, so
  // it is built once per page and language.
  const renderStatic = (c: Context, route: Route, robots: string | null) => {
    const key = `${route.locale}:${route.path}`;
    let doc = staticPages.get(key);
    if (!doc) {
      doc = composePage(route, route.locale);
      staticPages.set(key, doc);
    }
    return respond(c, doc, 200, robots ? { "X-Robots-Tag": robots } : {});
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
    if (seo) {
      return route.path === "/blog"
        ? renderBlog(c, route)
        : renderStatic(c, route, robots);
    }
    return renderShell(c, 200, robots ? { "X-Robots-Tag": robots } : {});
  };

  app.get("*", async (c) => {
    const { pathname, search } = requestUrl(c);
    const target = safeResolve(distRoot, pathname);
    if (target === null) return notFound(c);
    const sitePath = toSitePath(distRoot, target);
    if (isHiddenPath(sitePath)) return notFound(c);
    // `/robots.txt/` must not serve robots.txt: a trailing slash only matches a directory index.
    const asDirectory = pathname.endsWith("/");

    const htmlFile = htmlByTarget.get(target);
    if (htmlFile && (!asDirectory || htmlFile === join(target, "index.html"))) {
      // `/` is the home page, not the bare shell, once the pages are written
      // per route (SEO-01). `/index.html` stays the shell itself.
      if (seo && target === distRoot && htmlFile === shellFile) {
        return renderPage(c, pathname, search);
      }
      return sendHtml(c, htmlFile, 200);
    }

    const info = asDirectory ? null : await stat(target).catch(() => null);
    if (info?.isFile()) return sendFile(c, target, sitePath, info.size);

    if (extname(sitePath) !== "" || isFileOnlyPath(sitePath))
      return notFound(c);

    return renderPage(c, pathname, search);
  });
}

/**
 * The request's URL. For an HTTP/1.0 request without a Host header `c.req.url`
 * is only a path ("/about"), which `new URL()` alone rejects with a 500; the
 * base just lets the parse succeed and is never read (no host is ever used to
 * build a response, K-03).
 */
function requestUrl(c: Context): URL {
  return new URL(c.req.url, "http://localhost");
}

/** SEO_INJECT=off (any case, trimmed) is the kill switch; anything else leaves the layer on. */
function seoEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() !== "off";
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
