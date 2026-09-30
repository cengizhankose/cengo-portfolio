/**
 * The one description of the site's font layer (PERF-08 / ANL-17).
 *
 * `scripts/fonts/sync-fonts.ts` turns this into public/fonts/v1/*.woff2 (copied
 * from the @fontsource packages) and src/styles/fonts.css. The font tests read
 * the same list, so the files, the CSS and the preload links cannot drift.
 *
 * Weight set = the weights the type scale uses (DSG-17 / FE-19): Marcellus 400,
 * Raleway 400/500/600/700 and Raleway 400 italic. Every face comes in a `latin`
 * and a `latin-ext` subset (Turkish: ı is in latin; ğ ş İ are in latin-ext),
 * split by unicode-range, so a face only downloads when a page uses it.
 */

export type Subset = "latin" | "latin-ext";

export interface Face {
  /** @fontsource package the file comes from. */
  pkg: "raleway" | "marcellus";
  family: "Raleway" | "Marcellus";
  weight: number;
  style: "normal" | "italic";
  subset: Subset;
}

export const FONT_URL_PREFIX = "/fonts/v1/";

const RALEWAY_WEIGHTS = [400, 500, 600, 700] as const;
const SUBSETS: readonly Subset[] = ["latin", "latin-ext"];

export const FACES: readonly Face[] = [
  ...SUBSETS.map((subset): Face => ({
    pkg: "marcellus",
    family: "Marcellus",
    weight: 400,
    style: "normal",
    subset,
  })),
  ...RALEWAY_WEIGHTS.flatMap((weight) =>
    SUBSETS.map((subset): Face => ({
      pkg: "raleway",
      family: "Raleway",
      weight,
      style: "normal",
      subset,
    })),
  ),
  ...SUBSETS.map((subset): Face => ({
    pkg: "raleway",
    family: "Raleway",
    weight: 400,
    style: "italic",
    subset,
  })),
];

/** File name of a face, the same in @fontsource/<pkg>/files and in public/fonts/v1. */
export function faceFile(face: Face): string {
  return `${face.pkg}-${face.subset}-${face.weight}-${face.style}.woff2`;
}

/** Public URL of a face. */
export function faceUrl(face: Face): string {
  return `${FONT_URL_PREFIX}${faceFile(face)}`;
}

/**
 * The faces the browser needs on the first screen of every page: body text
 * (Raleway 400) and the headings (Marcellus 400), latin subset. These are the
 * two `<link rel="preload" as="font">` tags in index.html; everything else
 * loads on demand. (Turkish pages fetch the latin-ext file when a ğ/ş/İ shows.)
 */
export const PRELOADED: readonly Face[] = [
  FACES.find(
    (f) =>
      f.family === "Raleway" &&
      f.weight === 400 &&
      f.style === "normal" &&
      f.subset === "latin",
  )!,
  FACES.find((f) => f.family === "Marcellus" && f.subset === "latin")!,
];

/**
 * Metric-compatible fallback faces (CLS on font swap). Each one is a local
 * system face scaled so its text occupies the same space as the webfont:
 * `size-adjust` from the average glyph width, the three `*-override`s from the
 * webfont's hhea metrics. Measured by `bun scripts/fonts/measure-fallbacks.ts`
 * (paste its output here after a font version bump).
 */
export interface FallbackFace {
  /** Family name the stacks use, e.g. "Raleway Fallback". */
  name: string;
  weight: number;
  /** local() names tried in order (macOS/iOS, Windows, Linux). */
  local: readonly string[];
  sizeAdjust: number;
  ascent: number;
  descent: number;
  lineGap: number;
}

export const FALLBACK_FACES: readonly FallbackFace[] = [
  // MEASURED:BEGIN
  {
    name: "Raleway Fallback",
    weight: 400,
    local: ["Arial", "Liberation Sans", "Arimo"],
    sizeAdjust: 104.94,
    ascent: 89.58,
    descent: 22.3,
    lineGap: 0,
  },
  {
    name: "Raleway Fallback",
    weight: 700,
    local: ["Arial Bold", "Arial-BoldMT", "Liberation Sans Bold", "Arimo Bold"],
    sizeAdjust: 100.7,
    ascent: 93.35,
    descent: 23.24,
    lineGap: 0,
  },
  {
    name: "Marcellus Fallback",
    weight: 400,
    local: ["Georgia", "Gelasio"],
    sizeAdjust: 101.97,
    ascent: 95.53,
    descent: 27.44,
    lineGap: 0,
  },
  // MEASURED:END
];

export const FONT_STACKS = {
  body: `"Raleway", "Raleway Fallback", system-ui, -apple-system, "Segoe UI", sans-serif`,
  display: `"Marcellus", "Marcellus Fallback", Georgia, serif`,
} as const;
