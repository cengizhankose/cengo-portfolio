#!/usr/bin/env bun
/**
 * The MultiversX podium cover (src/content/awards.js, `graphic: true`).
 *
 * The owner has no photo of this event, so the tile gets an original, designed
 * title card instead: NOT an event photo, and it must never be described as one
 * (the alt text says "title card"). It carries only facts already in the
 * registry: the project, the place, the event and the year.
 *
 *   bun scripts/images/build-title-card.ts
 *     -> scripts/images/sources/awards/multiversx-2025.svg   (the design)
 *     -> scripts/images/sources/awards/multiversx-2025.jpg   (640x640 master)
 *   bun run images:build award-multiversx-2025              (AVIF + WebP)
 *
 * The text is outlined to paths from the self-hosted Marcellus and Raleway
 * (OFL) with the brand script's helpers, so the SVG renders the same on every
 * machine and holds no <text>, no font reference and no raster. Colours are the
 * dark-theme tokens (src/styles/tokens.css: --bg-color, --text-color) and the
 * brand grey of build-brand-assets.ts. The place is "#2", not "2nd place", so
 * the card reads the same on the English and the Turkish page.
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Font } from "opentype.js";
import {
  BRAND,
  fontFile,
  loadFont,
  textToPath,
  type Glyphs,
} from "../brand/build-brand-assets";

const ROOT = join(import.meta.dirname, "..", "..");
export const TITLE_CARD = Object.freeze({
  name: "multiversx-2025",
  size: 640,
  // The facts of the card: src/content/{en,tr}/awards.js, nothing else.
  project: "Avenrise",
  place: "#2",
  event: ["MultiversX Labs", "Xperience Hackathon"],
  year: "2025",
});

const MARGIN = 56;
const GRID = 80;

/** Font size at which `text` is `width` wide (its outline box, not its advance). */
function sizeForWidth(font: Font, text: string, width: number): number {
  const box = font.getPath(text, 0, 0, 1000).getBoundingBox();
  return (width * 1000) / (box.x2 - box.x1);
}

/** Left-aligned text whose outline starts exactly at x. */
function placed(
  font: Font,
  text: string,
  x: number,
  baseline: number,
  size: number,
): Glyphs {
  const probe = font.getPath(text, 0, 0, size).getBoundingBox();
  return textToPath(font, text, x - probe.x1, baseline, size);
}

export function buildTitleCardSvg(marcellus: Font, raleway: Font): string {
  const { size, project, place, event, year } = TITLE_CARD;
  const inner = size - 2 * MARGIN;

  const projectSize = sizeForWidth(marcellus, project, inner);
  const title = placed(marcellus, project, MARGIN, 404, projectSize);
  const rank = placed(marcellus, place, MARGIN, 262, 236);
  const lines = event.map((line, i) =>
    placed(raleway, line, MARGIN, 494 + i * 38, 30),
  );
  const yearPath = placed(raleway, year, MARGIN, 578, 30);

  // A restrained grid: hairlines every 80 px, plus the frame.
  const rules = Array.from({ length: size / GRID - 1 }, (_, i) => {
    const p = (i + 1) * GRID;
    return `M${p} 0V${size}M0 ${p}H${size}`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<title>Title card: ${project}, ${place}, ${event.join(" ")}, ${year}</title>
<desc>An original designed graphic, not a photograph.</desc>
<rect width="${size}" height="${size}" fill="${BRAND.bg}"/>
<path d="${rules}" fill="none" stroke="${BRAND.fg}" stroke-opacity="0.07" stroke-width="1"/>
<rect x="24" y="24" width="${size - 48}" height="${size - 48}" fill="none" stroke="${BRAND.fg}" stroke-opacity="0.22" stroke-width="2"/>
<path id="rank" fill="${BRAND.fg}" d="${rank.d}"/>
<path id="project" fill="${BRAND.fg}" d="${title.d}"/>
<path d="M${MARGIN} 436H${size - MARGIN}" stroke="${BRAND.fg}" stroke-opacity="0.45" stroke-width="2"/>
${lines.map((line, i) => `<path id="event-${i + 1}" fill="${BRAND.fg}" d="${line.d}"/>`).join("\n")}
<path id="year" fill="${BRAND.muted}" d="${yearPath.d}"/>
</svg>
`;
}

async function main(): Promise<void> {
  const marcellus = await loadFont(
    fontFile("marcellus", "marcellus-latin-400-normal.woff"),
  );
  const raleway = await loadFont(
    fontFile("raleway", "raleway-latin-500-normal.woff"),
  );
  const svg = buildTitleCardSvg(marcellus, raleway);

  const dir = join(ROOT, "scripts", "images", "sources", "awards");
  const svgFile = join(dir, `${TITLE_CARD.name}.svg`);
  const jpgFile = join(dir, `${TITLE_CARD.name}.jpg`);
  await mkdir(dirname(svgFile), { recursive: true });
  await Bun.write(svgFile, svg);

  // sharp is imported only here, as in build-responsive.ts.
  const { default: sharp } = await import("sharp");
  await sharp(Buffer.from(svg))
    .resize(TITLE_CARD.size, TITLE_CARD.size)
    .flatten({ background: BRAND.bg })
    .toColorspace("srgb")
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(jpgFile);
  console.log(`wrote ${svgFile}\nwrote ${jpgFile}`);
}

if (import.meta.main) await main();
