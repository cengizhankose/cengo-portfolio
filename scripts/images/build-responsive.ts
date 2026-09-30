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
 *
 * Add a preset for another image set (W8 portfolio covers) instead of
 * passing paths on the command line, so each set is reproducible.
 *
 * Every variant is auto-oriented, converted to sRGB (the master is Display
 * P3), stripped of metadata and never upscaled. sharp (libvips, mozjpeg,
 * libaom) is a devDependency and is imported only when encoding, so tests
 * and typecheck can load this module without the native binary.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { HERO_IMAGE } from "../../src/pages/home/heroImage.js";

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

export const PRESETS: Readonly<Record<string, ResponsiveSpec>> = Object.freeze({
  hero: {
    source: "scripts/images/sources/cengizhan-kose.jpg",
    outDir: join("public", HERO_IMAGE.dir),
    name: HERO_IMAGE.name,
    version: HERO_IMAGE.version,
    widths: HERO_IMAGE.widths,
    formats: PHOTO_FORMATS,
  },
});

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
  // Width after EXIF orientation, which rotate() below applies.
  const sourceWidth = (meta.orientation ?? 1) >= 5 ? meta.height : meta.width;
  const largest = spec.widths[spec.widths.length - 1];
  if (!sourceWidth || largest > sourceWidth) {
    throw new Error(
      `${spec.source} is ${sourceWidth}px wide; ${largest}w would be upscaled`,
    );
  }
  await mkdir(join(root, spec.outDir), { recursive: true });

  const built: BuiltVariant[] = [];
  for (const variant of variants) {
    const pipeline = sharp(source)
      .rotate()
      .resize({ width: variant.width, kernel: "lanczos3" })
      .toColourspace("srgb");
    const info = await encode(pipeline, variant).toFile(
      join(root, variant.file),
    );
    built.push({ ...variant, height: info.height, bytes: info.size });
  }
  return built;
}

if (import.meta.main) {
  const name = process.argv[2];
  const spec = name ? PRESETS[name] : undefined;
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
