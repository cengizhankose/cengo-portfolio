#!/usr/bin/env bun
/**
 * Brand asset pipeline (DSG-24 / FE-26 / SEO-15 / PERF-19 / MKT-22).
 *
 * Stage 1 (masters): draws the vector masters from the brand fonts, with every
 * glyph converted to a path so no webfont is needed at render time:
 *   src/assets/brand/favicon-master.svg   "C" monogram on a rounded #0c0c0c tile
 *   src/assets/brand/favicon-maskable.svg same mark, full-bleed, inside the 80 % safe zone
 *   src/assets/brand/og-default.svg       1200x630 default share image
 *
 * Stage 2 (rasters): renders the public/ outputs from those masters:
 *   public/favicon.svg, public/favicon.ico (16/32/48), public/apple-touch-icon.png (180),
 *   public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png, public/og/default.jpg
 *
 * Usage:
 *   bun scripts/brand/build-brand-assets.ts                 # masters + rasters
 *   bun scripts/brand/build-brand-assets.ts --rasters-only  # rasters from the committed masters
 *
 * Fonts: Marcellus 400 and Raleway 500 from @fontsource (SIL OFL 1.1), the same
 * faces the site header and the intro reel use. Rendering is pure WASM/JS
 * (@resvg/resvg-wasm, jpeg-js), so no system tools are required.
 */
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parse, type Font } from 'opentype.js'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import jpeg from 'jpeg-js'

const ROOT = join(import.meta.dir, '..', '..')
const BRAND_DIR = join(ROOT, 'src', 'assets', 'brand')
const PUBLIC_DIR = join(ROOT, 'public')

/** Brand tokens (src/index.css dark theme: --bg-color, --text-color; muted grey from DSG-24). */
export const BRAND = {
  bg: '#0c0c0c',
  fg: '#ffffff',
  muted: '#a3a3a3',
} as const

/** DSG-24: share image is 1200x630 and every piece of text stays 60px inside each edge. */
export const OG = { width: 1200, height: 630, safe: 60 } as const

export const ICO_SIZES = [16, 32, 48] as const

/**
 * Extra outline (in 512-unit master space) added to the glyph for the tiny ICO
 * layers. Marcellus' hairlines fall below one device pixel at 16px; a round-joined
 * stroke thickens them the way a hinted small-size cut would.
 */
const SMALL_SIZE_EMBOLDEN: Record<number, number> = { 16: 30, 32: 16, 48: 8 }

type Box = { x1: number; y1: number; x2: number; y2: number }
type Glyphs = { d: string; box: Box }

function fontFile(pkg: string, file: string): string {
  return join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file)
}

async function loadFont(path: string): Promise<Font> {
  return parse(await Bun.file(path).arrayBuffer())
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}

/** Text as absolute path data (y down) plus its exact outline box. */
function textToPath(font: Font, text: string, x: number, baseline: number, size: number): Glyphs {
  const path = font.getPath(text, x, baseline, size, { kerning: true })
  // opentype.js 2.x leaves glyf contours open; close each one so a stroke (the
  // small-size emboldening) joins at the contour start instead of capping it.
  const closed: typeof path.commands = []
  for (const cmd of path.commands) {
    if (cmd.type === 'M' && closed.length && closed[closed.length - 1].type !== 'Z') closed.push({ type: 'Z' })
    closed.push(cmd)
  }
  if (closed.length && closed[closed.length - 1].type !== 'Z') closed.push({ type: 'Z' })
  path.commands = closed
  const b = path.getBoundingBox()
  return {
    d: path.toPathData({ decimalPlaces: 1, flipY: false, optimize: true }),
    box: { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 },
  }
}

function union(boxes: Box[]): Box {
  return boxes.reduce((a, b) => ({
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2),
    y2: Math.max(a.y2, b.y2),
  }))
}

/**
 * Places the "C" so that its outline box is `heightRatio` of the tile and centred,
 * nudged right by `opticalShift` of the tile: the open side of a C reads lighter,
 * so a geometrically centred C looks left-heavy.
 */
function monogramGlyph(font: Font, tile: number, heightRatio: number, opticalShift: number): Glyphs {
  const probe = font.getPath('C', 0, 0, 1000).getBoundingBox()
  const size = (tile * heightRatio * 1000) / (probe.y2 - probe.y1)
  const k = size / 1000
  const w = (probe.x2 - probe.x1) * k
  const h = (probe.y2 - probe.y1) * k
  const x = (tile - w) / 2 - probe.x1 * k + tile * opticalShift
  const baseline = (tile - h) / 2 - probe.y1 * k
  return textToPath(font, 'C', x, baseline, size)
}

export function buildMonogramSvg(font: Font, variant: 'master' | 'maskable'): string {
  const tile = 512
  const master = variant === 'master'
  // master: ~12 % clear space around the letter (FE-26 asks for ~10 %), rounded tile.
  // maskable: letter box inside the 80 % safe circle (radius 204.8 of 512), full-bleed tile.
  const glyph = monogramGlyph(font, tile, master ? 0.74 : 0.58, 0.006)
  const bg = master
    ? `<rect id="tile" width="${tile}" height="${tile}" rx="112" fill="${BRAND.bg}"/>`
    : `<rect id="tile" width="${tile}" height="${tile}" fill="${BRAND.bg}"/>`
  const title = master ? 'CENGO monogram' : 'CENGO monogram (maskable)'
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tile} ${tile}" width="${tile}" height="${tile}">`,
    `<title>${title}</title>`,
    bg,
    `<path id="glyph" fill="${BRAND.fg}" d="${glyph.d}"/>`,
    `</svg>`,
    '',
  ].join('\n')
}

export function buildOgSvg(marcellus: Font, raleway: Font): { svg: string; box: Box } {
  const { width, height, safe } = OG
  // Content is laid out 1px inside the safe lines so rounding in a browser's
  // getBBox() can never report 59.99.
  const inset = safe + 1
  const x = inset
  // Logotype top-left: its cap top sits on the safe line (DSG-24: x=60, y=60).
  const logoSize = 40
  const logoProbe = marcellus.getPath('CENGO', 0, 0, logoSize).getBoundingBox()
  const logo = textToPath(marcellus, 'CENGO', x - logoProbe.x1, inset - logoProbe.y1, logoSize)
  // Name block, optically centred a little above the middle of the canvas.
  const name = textToPath(marcellus, 'Cengizhan Köse', x - 0.04 * 72, 318, 72)
  const role = textToPath(raleway, 'Senior Fullstack Engineer', x - 0.029 * 36, 378, 36)
  // Domain on the bottom safe line: descender bottom lands at 570 at most.
  const domainSize = 28
  const domainProbe = raleway.getPath('cengizhankose.com', 0, 0, domainSize).getBoundingBox()
  const domain = textToPath(
    raleway,
    'cengizhankose.com',
    x - domainProbe.x1,
    height - inset - domainProbe.y2,
    domainSize,
  )

  const box = union([logo.box, name.box, role.box, domain.box])
  if (box.x1 < safe || box.y1 < safe || box.x2 > width - safe || box.y2 > height - safe) {
    throw new Error(`og-content outside the ${safe}px safe area: ${JSON.stringify(box)}`)
  }

  // Oversized monogram bleeding off the right, top and bottom edges ties the card
  // to the favicon; at 5 % white it stays a texture, not a second message.
  const accentSize = 1040
  const accentProbe = marcellus.getPath('C', 0, 0, accentSize).getBoundingBox()
  const accent = textToPath(
    marcellus,
    'C',
    width - (accentProbe.x2 - accentProbe.x1) * 0.78 - accentProbe.x1,
    height / 2 - (accentProbe.y1 + accentProbe.y2) / 2,
    accentSize,
  )
  if (accent.box.x1 <= name.box.x2 + 40) throw new Error('accent monogram overlaps the name')

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<title>Cengizhan Köse, Senior Fullstack Engineer, cengizhankose.com</title>`,
    `<rect width="${width}" height="${height}" fill="${BRAND.bg}"/>`,
    `<path id="og-accent" fill="${BRAND.fg}" fill-opacity="0.05" d="${accent.d}"/>`,
    `<g id="og-content">`,
    `<path id="og-logotype" fill="${BRAND.fg}" d="${logo.d}"/>`,
    `<path id="og-name" fill="${BRAND.fg}" d="${name.d}"/>`,
    `<path id="og-role" fill="${BRAND.muted}" d="${role.d}"/>`,
    `<path id="og-domain" fill="${BRAND.muted}" d="${domain.d}"/>`,
    `</g>`,
    `</svg>`,
    '',
  ].join('\n')
  return {
    svg,
    box: { x1: round(box.x1), y1: round(box.y1), x2: round(box.x2), y2: round(box.y2) },
  }
}

/** Adds a round-joined outline to the #glyph path to thicken hairlines at tiny sizes. */
export function emboldenGlyph(svg: string, strokeWidth: number): string {
  if (strokeWidth <= 0) return svg
  const out = svg.replace(
    /<path id="glyph" /,
    `<path id="glyph" stroke="${BRAND.fg}" stroke-width="${strokeWidth}" stroke-linejoin="round" `,
  )
  if (out === svg) throw new Error('master has no <path id="glyph">')
  return out
}

let wasmReady: Promise<void> | undefined
function ensureWasm(): Promise<void> {
  wasmReady ??= Bun.file(join(ROOT, 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm'))
    .arrayBuffer()
    .then((buf) => initWasm(buf))
  return wasmReady
}

type Raster = { png: Uint8Array; pixels: Uint8Array; width: number; height: number }

async function render(svg: string, width: number): Promise<Raster> {
  await ensureWasm()
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: false },
    shapeRendering: 2, // geometricPrecision
  })
  const image = resvg.render()
  const out = { png: image.asPng(), pixels: image.pixels, width: image.width, height: image.height }
  image.free()
  resvg.free()
  return out
}

/** ICO container with PNG-compressed entries (supported by every current browser). */
export function encodeIco(entries: { size: number; png: Uint8Array }[]): Uint8Array {
  const header = 6
  const dirEntry = 16
  let offset = header + dirEntry * entries.length
  const total = offset + entries.reduce((n, e) => n + e.png.byteLength, 0)
  const buf = new Uint8Array(total)
  const view = new DataView(buf.buffer)
  view.setUint16(0, 0, true) // reserved
  view.setUint16(2, 1, true) // type: icon
  view.setUint16(4, entries.length, true)
  entries.forEach((e, i) => {
    const p = header + i * dirEntry
    view.setUint8(p, e.size >= 256 ? 0 : e.size)
    view.setUint8(p + 1, e.size >= 256 ? 0 : e.size)
    view.setUint8(p + 2, 0) // palette size
    view.setUint8(p + 3, 0) // reserved
    view.setUint16(p + 4, 1, true) // colour planes
    view.setUint16(p + 6, 32, true) // bits per pixel
    view.setUint32(p + 8, e.png.byteLength, true)
    view.setUint32(p + 12, offset, true)
    buf.set(e.png, offset)
    offset += e.png.byteLength
  })
  return buf
}

async function write(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await Bun.write(path, data)
  const size = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength
  console.log(`  ${path.replace(ROOT + '/', '')}  ${size} B`)
}

async function buildMasters(): Promise<void> {
  const marcellus = await loadFont(fontFile('marcellus', 'marcellus-latin-400-normal.woff'))
  const raleway = await loadFont(fontFile('raleway', 'raleway-latin-500-normal.woff'))
  console.log('masters:')
  await write(join(BRAND_DIR, 'favicon-master.svg'), buildMonogramSvg(marcellus, 'master'))
  await write(join(BRAND_DIR, 'favicon-maskable.svg'), buildMonogramSvg(marcellus, 'maskable'))
  const og = buildOgSvg(marcellus, raleway)
  await write(join(BRAND_DIR, 'og-default.svg'), og.svg)
  console.log(`  og-content box ${JSON.stringify(og.box)} (safe area 60..1140 x 60..570)`)
}

async function buildRasters(): Promise<void> {
  const master = await Bun.file(join(BRAND_DIR, 'favicon-master.svg')).text()
  const maskable = await Bun.file(join(BRAND_DIR, 'favicon-maskable.svg')).text()
  const og = await Bun.file(join(BRAND_DIR, 'og-default.svg')).text()
  console.log('rasters:')

  await write(join(PUBLIC_DIR, 'favicon.svg'), master)

  const icoLayers = []
  for (const size of ICO_SIZES) {
    const { png } = await render(emboldenGlyph(master, SMALL_SIZE_EMBOLDEN[size] ?? 0), size)
    icoLayers.push({ size, png })
  }
  await write(join(PUBLIC_DIR, 'favicon.ico'), encodeIco(icoLayers))

  // iOS ignores transparency and applies its own corner mask, so the touch icon
  // comes from the full-bleed master.
  await write(join(PUBLIC_DIR, 'apple-touch-icon.png'), (await render(maskable, 180)).png)
  await write(join(PUBLIC_DIR, 'icon-192.png'), (await render(master, 192)).png)
  await write(join(PUBLIC_DIR, 'icon-512.png'), (await render(master, 512)).png)
  await write(join(PUBLIC_DIR, 'icon-maskable-512.png'), (await render(maskable, 512)).png)

  const share = await render(og, OG.width)
  const jpg = jpeg.encode({ data: share.pixels, width: share.width, height: share.height }, 88)
  await write(join(PUBLIC_DIR, 'og', 'default.jpg'), new Uint8Array(jpg.data))
}

if (import.meta.main) {
  const rastersOnly = process.argv.includes('--rasters-only')
  if (!rastersOnly) await buildMasters()
  await buildRasters()
}
