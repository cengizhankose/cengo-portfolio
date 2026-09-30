#!/usr/bin/env bun
/**
 * Measures the fallback-face metrics for scripts/fonts/faces.ts (PERF-08).
 *
 *   bun scripts/fonts/measure-fallbacks.ts          # prints the FALLBACK_FACES block
 *   bun scripts/fonts/measure-fallbacks.ts --write  # rewrites it in faces.ts
 *
 * Method (the capsize one): the average advance width of a lower-case English
 * text (letter frequencies, plus the space) of the webfont divided by the same
 * number for the system face gives `size-adjust`; hhea ascender, descender and
 * line gap of the webfont, divided by `size-adjust`, give the overrides.
 * The system faces are read from macOS (Arial, Arial Bold, Georgia); Linux and
 * Windows use Arimo/Liberation/Arial/Georgia with the same metrics.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "opentype.js";
import { format, resolveConfig } from "prettier";

/** The slice of opentype.js's Font this script reads (the package ships no types). */
interface Font {
  unitsPerEm: number;
  charToGlyph(ch: string): { advanceWidth?: number };
  tables: { hhea: { ascender: number; descender: number; lineGap: number } };
}

const ROOT = join(import.meta.dirname, "..", "..");
const FONTSOURCE = join(ROOT, "node_modules", "@fontsource");
const SYSTEM = "/System/Library/Fonts/Supplemental";

/** English letter frequencies in percent; the space is about 18 % of text. */
const FREQ: Record<string, number> = {
  a: 8.167,
  b: 1.492,
  c: 2.782,
  d: 4.253,
  e: 12.702,
  f: 2.228,
  g: 2.015,
  h: 6.094,
  i: 6.966,
  j: 0.153,
  k: 0.772,
  l: 4.025,
  m: 2.406,
  n: 6.749,
  o: 7.507,
  p: 1.929,
  q: 0.095,
  r: 5.987,
  s: 6.327,
  t: 9.056,
  u: 2.758,
  v: 0.978,
  w: 2.36,
  x: 0.15,
  y: 1.974,
  z: 0.074,
  " ": 22,
};

function load(path: string): Font {
  const buf = readFileSync(path);
  return parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  ) as unknown as Font;
}

/**
 * The display face is matched on the widest word that cannot shrink: the
 * name in the hero h1 ("Cengizhan"). At 320 px it fills the column, and a
 * fallback 1-2 % wider than Marcellus breaks it mid-word (measured: the h1
 * grew from 2 to 3 lines, 40 px, when the fonts were blocked). A prose
 * average put Georgia 1.8 % too wide for it.
 */
const HEADING_SAMPLE = ["Cengizhan"];

function textWidth(font: Font, text: string): number {
  let total = 0;
  for (const ch of text) total += font.charToGlyph(ch).advanceWidth ?? 0;
  return total / font.unitsPerEm;
}

/** Weighted average advance width, in em. */
function avgWidth(font: Font): number {
  let total = 0;
  let weight = 0;
  for (const [ch, f] of Object.entries(FREQ)) {
    const glyph = font.charToGlyph(ch);
    total += (glyph.advanceWidth ?? 0) * f;
    weight += f;
  }
  return total / weight / font.unitsPerEm;
}

interface Target {
  name: string;
  weight: number;
  /** "prose": English letter frequencies; "headings": HEADING_SAMPLE. */
  sample: "prose" | "headings";
  web: string;
  system: string;
  local: string[];
}

const TARGETS: Target[] = [
  {
    name: "Raleway Fallback",
    weight: 400,
    sample: "prose",
    web: join(FONTSOURCE, "raleway", "files", "raleway-latin-400-normal.woff"),
    system: join(SYSTEM, "Arial.ttf"),
    local: ["Arial", "Liberation Sans", "Arimo"],
  },
  {
    name: "Raleway Fallback",
    weight: 700,
    sample: "prose",
    web: join(FONTSOURCE, "raleway", "files", "raleway-latin-700-normal.woff"),
    system: join(SYSTEM, "Arial Bold.ttf"),
    local: ["Arial Bold", "Arial-BoldMT", "Liberation Sans Bold", "Arimo Bold"],
  },
  {
    name: "Marcellus Fallback",
    weight: 400,
    sample: "headings",
    web: join(
      FONTSOURCE,
      "marcellus",
      "files",
      "marcellus-latin-400-normal.woff",
    ),
    system: join(SYSTEM, "Georgia.ttf"),
    local: ["Georgia", "Gelasio"],
  },
];

const pct = (n: number) => Math.round(n * 10000) / 100;

function measure(t: Target) {
  const web = load(t.web);
  const sys = load(t.system);
  const width = (font: Font) =>
    t.sample === "headings"
      ? HEADING_SAMPLE.reduce((sum, text) => sum + textWidth(font, text), 0)
      : avgWidth(font);
  const sizeAdjust = width(web) / width(sys);
  const upm = web.unitsPerEm;
  const { hhea } = web.tables;
  return {
    name: t.name,
    weight: t.weight,
    local: t.local,
    sizeAdjust: pct(sizeAdjust),
    ascent: pct(hhea.ascender / upm / sizeAdjust),
    descent: pct(Math.abs(hhea.descender) / upm / sizeAdjust),
    lineGap: pct(hhea.lineGap / upm / sizeAdjust),
  };
}

const block = TARGETS.map(measure)
  .map(
    (m) =>
      `  {\n    name: ${JSON.stringify(m.name)},\n    weight: ${m.weight},\n    local: ${JSON.stringify(m.local)},\n    sizeAdjust: ${m.sizeAdjust},\n    ascent: ${m.ascent},\n    descent: ${m.descent},\n    lineGap: ${m.lineGap},\n  },`,
  )
  .join("\n");

if (process.argv.includes("--write")) {
  const file = join(import.meta.dirname, "faces.ts");
  const src = readFileSync(file, "utf8");
  const next = src.replace(
    /( *\/\/ MEASURED:BEGIN\n)[\s\S]*?( *\/\/ MEASURED:END)/,
    `$1${block}\n$2`,
  );
  const options = (await resolveConfig(file)) ?? {};
  writeFileSync(file, await format(next, { ...options, parser: "typescript" }));
  console.log("faces.ts updated");
} else {
  console.log(block);
}
