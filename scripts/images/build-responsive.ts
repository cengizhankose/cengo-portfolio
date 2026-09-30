#!/usr/bin/env bun
/**
 * Responsive image pipeline (PERF-02, FE-18, SEO-26, DSG-29).
 *
 * Turns one master photo into width variants in AVIF, WebP and JPEG, named
 * `<name>-<version>-<width>.<ext>` (descriptive, lower case, no hash). The
 * files are committed and served from /img/ with a one-year immutable cache,
 * so a changed photo gets a new `version` (v2), never new bytes under v1.
 *
 * Usage:
 *   bun run images:build hero
 *   bun scripts/images/build-responsive.ts hero
 *
 * Presets:
 *   hero  scripts/images/sources/cengizhan-kose.jpg -> public/img/hero/
 *         cengizhan-kose-v1-{640,768,1000,1284}.{avif,webp,jpg}
 *         (names, widths and version come from src/pages/home/heroImage.js,
 *         the same module the home page's <picture> reads)
 *   portfolio-salesgym | portfolio-farmin | portfolio-effort-lab
 *         scripts/images/sources/<name>.png -> public/img/projects/
 *         <name>-v1-{480,800,1280}.{avif,webp}, cropped to 16:10, each file
 *         at most 150 KB (FE-04, DSG-08; names, widths and the budget come
 *         from src/pages/portfolio/projectImage.js). The sources are the
 *         owner's own screenshots, downloaded once (00-icerik-girdileri.md
 *         section 9).
 *
 * Add a preset for another image set instead of passing paths on the command
 * line, so each set is reproducible.
 *
 * Every variant is auto-oriented, converted to sRGB (the master is Display
 * P3), stripped of metadata and never upscaled. sharp (libvips, mozjpeg,
 * libaom) is a devDependency and is imported only when encoding, so tests
 * and typecheck can load this module without the native binary.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HERO_IMAGE } from "../../src/pages/home/heroImage.js";
import {
  PROJECT_IMAGE,
  projectImageName,
} from "../../src/pages/portfolio/projectImage.js";

// import.meta.dirname (not Bun's .dir): Vitest imports this module in its tests.
export const ROOT = join(import.meta.dirname, "..", "..");

export type ImageFormat = "avif" | "webp" | "jpg";

export interface FormatSpec {
  format: ImageFormat;
  /** Encoder quality (0-100) for a given output width. */
  quality: (width: number) => number;
}

export interface ResponsiveSpec {
  /** Master image, relative to the repository root. */
  source: string;
  /** Output directory, relative to the repository root. */
  outDir: string;
  /** Descriptive slug: lower case letters, digits and hyphens (SEO-26). */
  name: string;
  /** Content version (`v1`, `v2`, ...): bump it whenever the pixels change. */
  version: string;
  /** Output widths in pixels, ascending. */
  widths: readonly number[];
  formats: readonly FormatSpec[];
  /**
   * Crop to this width:height ratio (`fit: cover`, see `position`). Without
   * it the image keeps the source's own ratio.
   */
  aspect?: readonly [number, number];
  /** Where the crop keeps the image (sharp `position`); default `centre`. */
  position?: string;
  /**
   * Largest size of any output file. A file over the budget is re-encoded at
   * a lower quality (down to MIN_QUALITY); if it still does not fit the
   * build fails instead of writing a heavy file.
   */
  maxBytes?: number;
}

export interface Variant {
  width: number;
  format: ImageFormat;
  quality: number;
  /** Output file, relative to the repository root. */
  file: string;
}

export interface BuiltVariant extends Variant {
  height: number;
  bytes: number;
}

/**
 * Encoder settings for the photo presets. Qualities follow PERF-02 step 1:
 * AVIF 55 up to 768w and 45 from 1000w (those files go to DPR >= 2 screens,
 * where the lower quality does not show), WebP 70, JPEG 72 with 4:2:0
 * chroma and progressive scans.
 */
export const PHOTO_FORMATS: readonly FormatSpec[] = Object.freeze([
  { format: "avif", quality: (width: number) => (width >= 1000 ? 45 : 55) },
  { format: "webp", quality: () => 70 },
  { format: "jpg", quality: () => 72 },
]);

/**
 * Encoder settings for the portfolio covers (DSG-08, FE-04): AVIF and WebP
 * only (every browser that shows a card image supports WebP). The starting
 * qualities are the photo ones; maxBytes steps them down for busy screenshots.
 */
export const COVER_FORMATS: readonly FormatSpec[] = Object.freeze([
  { format: "avif", quality: () => 55 },
  { format: "webp", quality: () => 75 },
]);

/** The lowest quality the byte budget may step down to. */
export const MIN_QUALITY = 40;
const QUALITY_STEP = 5;

const coverPreset = (id: string): ResponsiveSpec => {
  const name = projectImageName(id);
  return {
    source: `scripts/images/sources/${name}.png`,
    outDir: join("public", PROJECT_IMAGE.dir),
    name,
    version: PROJECT_IMAGE.version,
    widths: PROJECT_IMAGE.widths,
    formats: COVER_FORMATS,
    aspect: [16, 10],
    maxBytes: PROJECT_IMAGE.maxBytes,
  };
};

export const PRESETS: Readonly<Record<string, ResponsiveSpec>> = Object.freeze({
  "portfolio-salesgym": coverPreset("salesgym"),
  "portfolio-farmin": coverPreset("farmin"),
  "portfolio-effort-lab": coverPreset("effort_lab"),
  hero: {
    source: "scripts/images/sources/cengizhan-kose.jpg",
    outDir: join("public", HERO_IMAGE.dir),
    name: HERO_IMAGE.name,
    version: HERO_IMAGE.version,
    widths: HERO_IMAGE.widths,
    formats: PHOTO_FORMATS,
  },
});

/** Output height of a width, for a spec with an aspect ratio. */
export function outputHeight(
  spec: Pick<ResponsiveSpec, "aspect">,
  width: number,
): number | undefined {
  return spec.aspect
    ? Math.round((width * spec.aspect[1]) / spec.aspect[0])
    : undefined;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^v[1-9][0-9]*$/;

/** File name of one variant: `<name>-<version>-<width>.<ext>`. */
export function variantFileName(
  spec: Pick<ResponsiveSpec, "name" | "version">,
  width: number,
  format: ImageFormat,
): string {
  return `${spec.name}-${spec.version}-${width}.${format}`;
}

/**
 * Every output file of a spec, width by width. Throws on a spec that would
 * produce names the site cannot cache safely (upper case, no version) or
 * widths that are not strictly ascending positive integers.
 */
export function planVariants(spec: ResponsiveSpec): Variant[] {
  if (!SLUG.test(spec.name)) {
    throw new Error(`name must be a lower-case slug: ${spec.name}`);
  }
  if (!VERSION.test(spec.version)) {
    throw new Error(`version must look like v1, v2, ...: ${spec.version}`);
  }
  if (spec.widths.length === 0 || spec.formats.length === 0) {
    throw new Error("a spec needs at least one width and one format");
  }
  if (
    spec.aspect &&
    !(spec.aspect.length === 2 && spec.aspect.every((n) => n > 0))
  ) {
    throw new Error(`aspect must be two positive numbers: ${spec.aspect}`);
  }
  if (spec.maxBytes !== undefined && !(spec.maxBytes > 0)) {
    throw new Error(`maxBytes must be positive: ${spec.maxBytes}`);
  }
  spec.widths.forEach((width, index) => {
    if (!Number.isInteger(width) || width <= 0) {
      throw new Error(`width must be a positive integer: ${width}`);
    }
    if (index > 0 && width <= spec.widths[index - 1]) {
      throw new Error(`widths must be strictly ascending: ${spec.widths}`);
    }
  });
  return spec.widths.flatMap((width) =>
    spec.formats.map(({ format, quality }) => {
      const q = quality(width);
      if (!Number.isInteger(q) || q < 1 || q > 100) {
        throw new Error(`quality must be an integer 1-100: ${q}`);
      }
      return {
        width,
        format,
        quality: q,
        file: join(spec.outDir, variantFileName(spec, width, format)),
      };
    }),
  );
}

type Pipeline = import("sharp").Sharp;

function encode(pipeline: Pipeline, { format, quality }: Variant): Pipeline {
  switch (format) {
    case "avif":
      return pipeline.avif({ quality, effort: 9, chromaSubsampling: "4:2:0" });
    case "webp":
      return pipeline.webp({ quality, effort: 6, smartSubsample: true });
    case "jpg":
      return pipeline.jpeg({
        quality,
        mozjpeg: true,
        progressive: true,
        chromaSubsampling: "4:2:0",
      });
  }
}

/** Encodes every variant of `spec` and writes it under `root`. */
export async function buildResponsive(
  spec: ResponsiveSpec,
  root: string = ROOT,
): Promise<BuiltVariant[]> {
  const variants = planVariants(spec);
  const { default: sharp } = await import("sharp");
  const source = join(root, spec.source);
  const meta = await sharp(source).metadata();
  // Size after EXIF orientation, which rotate() below applies.
  const turned = (meta.orientation ?? 1) >= 5;
  const sourceWidth = turned ? meta.height : meta.width;
  const sourceHeight = turned ? meta.width : meta.height;
  const largest = spec.widths[spec.widths.length - 1];
  const largestHeight = outputHeight(spec, largest);
  if (!sourceWidth || !sourceHeight || largest > sourceWidth) {
    throw new Error(
      `${spec.source} is ${sourceWidth}px wide; ${largest}w would be upscaled`,
    );
  }
  // A cropped output is scaled until it covers the box: a source that is too
  // short for the ratio would be stretched vertically.
  if (largestHeight && largestHeight > sourceHeight) {
    throw new Error(
      `${spec.source} is ${sourceHeight}px high; ${largest}x${largestHeight} would be upscaled`,
    );
  }
  await mkdir(join(root, spec.outDir), { recursive: true });

  const built: BuiltVariant[] = [];
  for (const variant of variants) {
    const height = outputHeight(spec, variant.width);
    const pipeline = () =>
      sharp(source)
        .rotate()
        .resize({
          width: variant.width,
          ...(height
            ? { height, fit: "cover" as const, position: spec.position }
            : {}),
          kernel: "lanczos3",
        })
        .toColourspace("srgb");

    if (spec.maxBytes === undefined) {
      const info = await encode(pipeline(), variant).toFile(
        join(root, variant.file),
      );
      built.push({ ...variant, height: info.height, bytes: info.size });
      continue;
    }

    // Byte budget: step the quality down until the file fits.
    let quality = variant.quality;
    for (;;) {
      const { data, info } = await encode(pipeline(), {
        ...variant,
        quality,
      }).toBuffer({ resolveWithObject: true });
      if (data.length <= spec.maxBytes) {
        await writeFile(join(root, variant.file), data);
        built.push({
          ...variant,
          quality,
          height: info.height,
          bytes: data.length,
        });
        break;
      }
      if (quality - QUALITY_STEP < MIN_QUALITY) {
        throw new Error(
          `${variant.file}: ${data.length} B at quality ${quality} is over the ${spec.maxBytes} B budget; use a simpler crop or a smaller source`,
        );
      }
      quality -= QUALITY_STEP;
    }
  }
  return built;
}

if (import.meta.main) {
  const name = process.argv[2];
  // hasOwn: "constructor" or "toString" must not resolve an inherited property.
  const spec = name && Object.hasOwn(PRESETS, name) ? PRESETS[name] : undefined;
  if (!spec) {
    console.error(
      `usage: bun scripts/images/build-responsive.ts <preset>\npresets: ${Object.keys(PRESETS).join(", ")}`,
    );
    process.exit(1);
  }
  const built = await buildResponsive(spec);
  for (const { file, width, height, quality, bytes } of built) {
    console.log(
      `${file}  ${width}x${height}  q${quality}  ${bytes.toLocaleString("en")} B`,
    );
  }
}
