import { resolve, sep } from 'node:path'

// Percent-encoded dot, slash, backslash or NUL left over after one decode means
// the request was double-encoded (`%252e%252e`). No file in dist/ has such a name.
const DOUBLE_ENCODED = /%(?:2e|2f|5c|00)/i
// A `.` or `..` segment that survived URL normalisation can only come from an
// encoded slash (`..%2f`). Reject it instead of letting `resolve` collapse it.
const DOT_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)/

/**
 * Maps a request pathname (still percent-encoded, e.g. `new URL(url).pathname`)
 * to an absolute path inside `distRoot`, or `null` when it must be answered
 * with 404: undecodable input, NUL bytes, backslashes, double encoding, dot
 * segments, or any result outside `distRoot` (including sibling directories
 * such as `dist-backup`, which a bare `startsWith(distRoot)` would let through).
 *
 * `distRoot` must be an absolute, normalised directory path (`path.resolve`).
 */
export function safeResolve(distRoot: string, pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null
  if (DOUBLE_ENCODED.test(decoded) || DOT_SEGMENT.test(decoded)) return null
  const target = resolve(distRoot, '.' + decoded)
  return target === distRoot || target.startsWith(distRoot + sep) ? target : null
}
