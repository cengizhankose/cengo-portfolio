import type { BunFile } from 'bun'
import type { Context, Hono } from 'hono'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { contentTypeFor } from './mime'
import { safeResolve } from './safe-path'

export interface MountSiteOptions {
  /** Directory holding the Vite build output (index.html, assets/, copied public/ files). */
  distDir: string
}

const IMMUTABLE = 'public, max-age=31536000, immutable'
const SHORT_LIVED = 'public, max-age=3600'
const REVALIDATE = 'no-cache'
const NO_STORE = 'no-store'
const HTML_TYPE = contentTypeFor('index.html')

/** Directories whose file names carry a hash or version (`v1`): cacheable for a year. */
const IMMUTABLE_PREFIXES = ['/assets/', '/img/', '/fonts/']
/** Directories that only ever hold files: a miss there is a 404, never the SPA shell. */
const FILE_ONLY_DIRS = ['/assets', '/img', '/fonts', '/.well-known']

interface HtmlDoc {
  body: Uint8Array<ArrayBuffer>
  etag: string
}

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
 * 5. Any other path gets the SPA shell (`index.html`, 200).
 *
 * Register API routes before calling this: it answers every GET/HEAD path.
 */
export function mountSite(app: Hono<any, any, any>, { distDir }: MountSiteOptions): void {
  const distRoot = resolve(distDir)
  const htmlByTarget = indexHtmlFiles(distRoot)
  const shellFile = join(distRoot, 'index.html')
  const docs = new Map<string, Promise<HtmlDoc>>()

  if (!htmlByTarget.has(shellFile)) {
    console.warn(`[static] ${shellFile} not found; SPA routes will answer 500`)
  }

  const loadDoc = (file: string): Promise<HtmlDoc> => {
    let doc = docs.get(file)
    if (!doc) {
      doc = Bun.file(file)
        .bytes()
        .then((body) => ({ body, etag: `"${Bun.hash(body).toString(16)}"` }))
      doc.catch(() => docs.delete(file)) // retry on the next request instead of caching the failure
      docs.set(file, doc)
    }
    return doc
  }

  // dist/ does not change while the process runs: read every HTML document once, up front.
  for (const file of new Set(htmlByTarget.values())) void loadDoc(file)

  const sendHtml = async (c: Context, file: string, status: 200 | 404) => {
    const { body, etag } = await loadDoc(file)
    if (status === 200 && etagMatches(c.req.header('If-None-Match'), etag)) {
      return c.body(null, 304, { ETag: etag, 'Cache-Control': REVALIDATE })
    }
    return c.body(body, status, { 'Content-Type': HTML_TYPE, 'Cache-Control': REVALIDATE, ETag: etag })
  }

  const renderShell = (c: Context, status: 200 | 404) => {
    if (!htmlByTarget.has(shellFile)) return c.text('Site shell missing', 500, { 'Cache-Control': NO_STORE })
    return sendHtml(c, shellFile, status)
  }

  app.get('*', async (c) => {
    const target = safeResolve(distRoot, new URL(c.req.url).pathname)
    if (target === null) return notFound(c)
    const sitePath = toSitePath(distRoot, target)
    if (isHiddenPath(sitePath)) return notFound(c)

    const htmlFile = htmlByTarget.get(target)
    if (htmlFile) return sendHtml(c, htmlFile, 200)

    const file = Bun.file(target)
    if (await file.exists()) return sendFile(c, file, sitePath)

    if (extname(sitePath) !== '' || isFileOnlyPath(sitePath)) return notFound(c)

    // Extensionless unknown paths still get the SPA shell; the route-aware
    // 404 + noindex (known routes 200, the rest 404) replaces this call.
    return renderShell(c, 200)
  })
}

/** Absolute file or directory path -> absolute path of the HTML document it serves. */
function indexHtmlFiles(distRoot: string): Map<string, string> {
  const byTarget = new Map<string, string>()
  let files: string[]
  try {
    files = Array.from(new Bun.Glob('**/*.html').scanSync({ cwd: distRoot, onlyFiles: true }))
  } catch {
    return byTarget // dist/ missing: nothing to serve
  }
  for (const rel of files) {
    const file = join(distRoot, rel)
    byTarget.set(file, file)
    if (basename(file) === 'index.html') byTarget.set(dirname(file), file)
  }
  return byTarget
}

function sendFile(c: Context, file: BunFile, sitePath: string) {
  const cacheControl = IMMUTABLE_PREFIXES.some((p) => sitePath.startsWith(p)) ? IMMUTABLE : SHORT_LIVED
  // A BunFile body lets Bun stream the file (sendfile) and set Content-Length;
  // hono/bun's own serveStatic hands BunFile to c.body the same way.
  return c.body(file as unknown as ReadableStream, 200, {
    'Content-Type': contentTypeFor(sitePath),
    'Cache-Control': cacheControl,
  })
}

function notFound(c: Context) {
  return c.text('Not found', 404, { 'Cache-Control': NO_STORE })
}

/** `/abs/dist/assets/a.js` -> `/assets/a.js`; the dist root itself -> `/`. */
function toSitePath(distRoot: string, target: string): string {
  return '/' + relative(distRoot, target).split(sep).join('/')
}

/** Dotfiles and dot directories are never served, except under `/.well-known/`. */
function isHiddenPath(sitePath: string): boolean {
  const segments = sitePath.split('/').filter(Boolean)
  return segments.some((s, i) => s.startsWith('.') && !(i === 0 && s === '.well-known'))
}

function isFileOnlyPath(sitePath: string): boolean {
  return FILE_ONLY_DIRS.some((dir) => sitePath === dir || sitePath.startsWith(dir + '/'))
}

/** RFC 9110 weak comparison: `W/` prefixes are ignored, `*` matches any current representation. */
function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false
  const bare = etag.replace(/^W\//, '')
  return ifNoneMatch.split(',').some((candidate) => {
    const value = candidate.trim()
    return value === '*' || value.replace(/^W\//, '') === bare
  })
}
