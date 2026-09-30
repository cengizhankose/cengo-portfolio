import { extname } from 'node:path'

const OCTET_STREAM = 'application/octet-stream'

/**
 * Content types the site relies on, pinned so a Bun upgrade cannot silently
 * change them. Values use Bun's own format (`type;charset=utf-8`), which is
 * equivalent to `type; charset=utf-8` (RFC 9110 allows whitespace around `;`).
 * Keys are lower-case: `contentTypeFor` lower-cases the extension first, because
 * `Bun.file('a.JPG').type` is `application/octet-stream`.
 */
const MIME: Readonly<Record<string, string>> = Object.freeze({
  // documents and code
  '.html': 'text/html;charset=utf-8',
  '.htm': 'text/html;charset=utf-8',
  '.js': 'text/javascript;charset=utf-8',
  '.mjs': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.map': 'application/json;charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain;charset=utf-8',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
  // images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  // fonts
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  // media
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
})

/**
 * Content-Type for a file path, decided by its extension only (the file does
 * not have to exist). Case-insensitive: `photo.JPG` -> `image/jpeg`.
 * Unknown extensions fall back to Bun's MIME table, then to
 * `application/octet-stream`.
 */
export function contentTypeFor(path: string): string {
  const ext = extname(path).toLowerCase()
  if (ext === '' || ext === '.') return OCTET_STREAM
  return MIME[ext] ?? (Bun.file(`x${ext}`).type || OCTET_STREAM)
}
