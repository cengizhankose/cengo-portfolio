// Helpers for tests/frontend/hero/** (W6-DSG-hero-image-lcp): repository
// paths, a small CSS reader that merges every matching rule (the hero
// selectors appear in grouped rules and media blocks), and header parsers
// for the committed JPEG / WebP / AVIF files (no image library needed, so
// the tests run the same under Node and under Bun's node shim in Docker).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..", "..");
export const read = (file) => readFileSync(join(ROOT, file), "utf8");
export const bytes = (file) => readFileSync(join(ROOT, file));

/** Every file under `dir` (repository-relative paths). */
export function filesUnder(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      return entry.isDirectory() ? filesUnder(path) : [path];
    },
  );
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// [{ selector, body } | { at, children }] for one level of a stylesheet.
function parseBlocks(css) {
  const items = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const head = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth += 1;
      if (css[j] === "}") depth -= 1;
      j += 1;
    }
    const inner = css.slice(open + 1, j - 1);
    if (head.startsWith("@")) {
      items.push({
        at: head.replace(/\s+/g, " "),
        children: parseBlocks(inner),
      });
    } else {
      items.push({ selector: head.replace(/\s+/g, " "), body: inner });
    }
    i = j;
  }
  return items;
}

function declarations(body) {
  return Object.fromEntries(
    body
      .split(";")
      .map((decl) => decl.trim())
      .filter(Boolean)
      .map((decl) => {
        const colon = decl.indexOf(":");
        return [
          decl.slice(0, colon).trim(),
          decl
            .slice(colon + 1)
            .replace(/\s+/g, " ")
            .trim(),
        ];
      }),
  );
}

/**
 * The merged declarations (later ones win, as in the cascade) of every rule
 * whose selector list contains `selector`, at the top level of `css` or, with
 * `media`, inside `@media <media>` blocks only. Returns {} when none match.
 */
export function declared(css, selector, media) {
  const top = parseBlocks(stripComments(css));
  const scope = media
    ? top
        .filter((item) => item.at === `@media ${media}`)
        .flatMap((item) => item.children)
    : top;
  const merged = {};
  for (const item of scope) {
    if (!item.selector) continue;
    const selectors = item.selector.split(",").map((part) => part.trim());
    if (selectors.includes(selector)) {
      Object.assign(merged, declarations(item.body));
    }
  }
  return merged;
}

/** Every selector in `css`, at any depth. */
export function allSelectors(css) {
  const walk = (items) =>
    items.flatMap((item) =>
      item.children ? walk(item.children) : [item.selector],
    );
  return walk(parseBlocks(stripComments(css)));
}

// --- image headers -------------------------------------------------------

/**
 * Format and pixel size of an encoded image, read from its header:
 * JPEG SOF segment, WebP VP8 / VP8L / VP8X chunk, AVIF `ispe` property.
 * Also reports JPEG progressive coding and whether EXIF / ICC data is left.
 */
export function imageInfo(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return jpegInfo(buffer);
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return webpInfo(buffer);
  }
  if (buffer.toString("ascii", 4, 8) === "ftyp") return avifInfo(buffer);
  return { format: "unknown" };
}

function jpegInfo(buffer) {
  const info = { format: "jpeg", exif: false, icc: false };
  let i = 2;
  while (i < buffer.length) {
    if (buffer[i] !== 0xff) break;
    const marker = buffer[i + 1];
    const length = buffer.readUInt16BE(i + 2);
    if (marker === 0xe1 && buffer.toString("ascii", i + 4, i + 8) === "Exif") {
      info.exif = true;
    }
    if (
      marker === 0xe2 &&
      buffer.toString("ascii", i + 4, i + 15) === "ICC_PROFILE"
    ) {
      info.icc = true;
    }
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC)
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      info.progressive = marker === 0xc2;
      info.height = buffer.readUInt16BE(i + 5);
      info.width = buffer.readUInt16BE(i + 7);
      return info;
    }
    i += 2 + length;
  }
  return info;
}

function webpInfo(buffer) {
  const chunk = buffer.toString("ascii", 12, 16);
  const info = { format: "webp", chunk };
  if (chunk === "VP8 ") {
    info.width = buffer.readUInt16LE(26) & 0x3fff;
    info.height = buffer.readUInt16LE(28) & 0x3fff;
  } else if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    info.width = (bits & 0x3fff) + 1;
    info.height = ((bits >> 14) & 0x3fff) + 1;
  } else if (chunk === "VP8X") {
    info.exif = Boolean(buffer[20] & 0x08);
    info.icc = Boolean(buffer[20] & 0x20);
    info.width = buffer.readUIntLE(24, 3) + 1;
    info.height = buffer.readUIntLE(27, 3) + 1;
  }
  return info;
}

function avifInfo(buffer) {
  const brand = buffer.toString("ascii", 8, 12);
  const info = { format: brand === "avif" ? "avif" : `isobmff:${brand}` };
  const ispe = buffer.indexOf("ispe", 0, "ascii");
  if (ispe !== -1) {
    // box type, then version (1) + flags (3), then width and height (u32)
    info.width = buffer.readUInt32BE(ispe + 8);
    info.height = buffer.readUInt32BE(ispe + 12);
  }
  info.exif = buffer.indexOf("Exif", 0, "ascii") !== -1;
  info.icc = buffer.indexOf("colrprof", 0, "ascii") !== -1;
  return info;
}
