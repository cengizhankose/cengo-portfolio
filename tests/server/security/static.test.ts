import { describe, expect, test } from 'bun:test'
import { join, resolve, sep } from 'node:path'
import { safeResolve } from '../../../src/server/safe-path'

const FIXTURES = resolve(import.meta.dir, '..', 'fixtures')
const distRoot = join(FIXTURES, 'dist')

describe('safeResolve (SEC-21)', () => {
  // The audit's probe types plus the sibling-directory case the old
  // `startsWith(distDir)` guard let through (`/app/dist-backup/x`).
  test.each([
    ['/%2e%2e/etc/passwd', 'encoded dot-dot'],
    ['/..%2f..%2fetc%2fpasswd', 'dot-dot with encoded slash'],
    ['/%2e%2e%2f%2e%2e%2fetc%2fpasswd', 'fully encoded dot-dot-slash'],
    ['/..%5c..%5cetc%5cpasswd', 'encoded backslash'],
    ['/%252e%252e/%252e%252e/etc/passwd', 'double-encoded dot-dot'],
    ['/.%2e/.%2e/etc/passwd', 'half-encoded dot-dot'],
    ['/%00', 'NUL byte'],
    ['/index.html%00.js', 'NUL byte inside a name'],
    ['/%E0%A4%A', 'malformed percent-encoding'],
    ['/../dist-backup/leak.txt', 'sibling directory sharing the dist prefix'],
    ['/..%2fdist-backup%2fleak.txt', 'encoded sibling directory'],
    ['/assets/..%2f..%2f..%2fserver.ts', 'climb out from a subdirectory'],
    ['/assets/..%2frobots.txt', 'encoded dot segment that stays inside dist'],
    ['/a\\b', 'literal backslash'],
  ])('%s (%s) -> null', (pathname) => {
    expect(safeResolve(distRoot, pathname)).toBeNull()
  })

  test('the old guard really accepted the sibling directory', () => {
    const naive = join(distRoot, '/../dist-backup/leak.txt')
    expect(naive.startsWith(distRoot)).toBe(true)
    expect(naive.startsWith(distRoot + sep)).toBe(false)
  })

  test.each([
    ['/assets/app-3f9a1c.js', join(distRoot, 'assets', 'app-3f9a1c.js')],
    ['/', distRoot],
    ['/tr/about/', join(distRoot, 'tr', 'about')],
    ['/img/hero%20v1.avif', join(distRoot, 'img', 'hero v1.avif')],
    ['/K%C3%B6se.txt', join(distRoot, 'Köse.txt')],
    ['//assets//app.js', join(distRoot, 'assets', 'app.js')],
  ])('%s -> path inside dist', (pathname, expected) => {
    const target = safeResolve(distRoot, pathname)
    expect(target).toBe(expected)
    expect(target === distRoot || target!.startsWith(distRoot + sep)).toBe(true)
  })
})
