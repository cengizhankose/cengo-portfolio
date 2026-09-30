/**
 * Brand asset acceptance checks that run without a server:
 * FE-26, PERF-19, SEO-15, DSG-24, MKT-22 (icon set + share image) and SEO-23 (manifest).
 * The HTTP halves of those criteria (status + content-type) are verified against a
 * build at the W1 gate and on the live site after deploy.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const PUBLIC = join(ROOT, "public");
const BRAND = join(ROOT, "src", "assets", "brand");

const read = (path: string) => new Uint8Array(readFileSync(path));
const text = (path: string) => readFileSync(path, "utf8");

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]).toBe(0xd8);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 2;
  while (p < bytes.length) {
    if (bytes[p] !== 0xff) throw new Error(`bad JPEG marker at ${p}`);
    const marker = bytes[p + 1];
    const length = view.getUint16(p + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC)
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return { height: view.getUint16(p + 5), width: view.getUint16(p + 7) };
    }
    p += 2 + length;
  }
  throw new Error("no SOF marker");
}

type IcoEntry = {
  width: number;
  height: number;
  bpp: number;
  bytes: Uint8Array;
};

function icoEntries(bytes: Uint8Array): IcoEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint16(0, true)).toBe(0); // reserved
  expect(view.getUint16(2, true)).toBe(1); // 1 = icon
  const count = view.getUint16(4, true);
  return Array.from({ length: count }, (_, i) => {
    const p = 6 + i * 16;
    const size = view.getUint32(p + 8, true);
    const offset = view.getUint32(p + 12, true);
    return {
      width: view.getUint8(p) || 256,
      height: view.getUint8(p + 1) || 256,
      bpp: view.getUint16(p + 6, true),
      bytes: bytes.subarray(offset, offset + size),
    };
  });
}

/** Every coordinate pair in absolute M/L/Q/C/Z path data (the pipeline emits nothing else). */
function pathPoints(d: string): [number, number][] {
  expect(d).toMatch(/^[MLQCZ0-9.\s-]+$/);
  const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  expect(nums.length % 2).toBe(0);
  const points: [number, number][] = [];
  for (let i = 0; i < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
  return points;
}

/**
 * Control-point hull of the paths: every Bézier lies inside the convex hull of its
 * control points, so this box contains the exact outline box (what getBBox() returns).
 * If the hull box is inside the safe area, the real box is too.
 */
function hullBox(svgFragment: string) {
  const points = [...svgFragment.matchAll(/\sd="([^"]+)"/g)].flatMap((m) =>
    pathPoints(m[1]),
  );
  for (const r of svgFragment.matchAll(
    /<rect[^>]*\sx="([\d.]+)"[^>]*\sy="([\d.]+)"[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/g,
  )) {
    const [x, y, w, h] = r.slice(1).map(Number);
    points.push([x, y], [x + w, y + h]);
  }
  expect(points.length).toBeGreaterThan(0);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    x1: Math.min(...xs),
    y1: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
  };
}

describe("favicon set (FE-26, PERF-19, SEO-15, DSG-24, MKT-22)", () => {
  test("favicon.ico is a real icon with 16, 32 and 48 px layers", () => {
    const entries = icoEntries(read(join(PUBLIC, "favicon.ico")));
    expect(entries.map((e) => `${e.width}x${e.height}`)).toEqual([
      "16x16",
      "32x32",
      "48x48",
    ]);
    for (const e of entries) {
      expect(e.bpp).toBe(32);
      expect(pngSize(e.bytes)).toEqual({ width: e.width, height: e.height });
    }
  });

  test.each([
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
  ])("%s is a %i px square PNG", (file, size) => {
    expect(pngSize(read(join(PUBLIC, file as string)))).toEqual({
      width: size as number,
      height: size as number,
    });
  });

  test("public/favicon.svg is the committed master", () => {
    expect(text(join(PUBLIC, "favicon.svg"))).toBe(
      text(join(BRAND, "favicon-master.svg")),
    );
  });

  test.each(["favicon-master.svg", "favicon-maskable.svg", "og-default.svg"])(
    "%s has its lettering as paths (no text, no font dependency)",
    (file) => {
      const svg = text(join(BRAND, file));
      expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).not.toMatch(/<text\b|font-family|@font-face|<image\b|href=/);
    },
  );

  test("monogram masters are square and use the brand colours", () => {
    for (const file of ["favicon-master.svg", "favicon-maskable.svg"]) {
      const svg = text(join(BRAND, file));
      expect(svg).toContain('viewBox="0 0 512 512"');
      expect(svg).toContain('fill="#0c0c0c"');
      expect(svg).toMatch(/<path id="glyph" fill="#ffffff" d="/);
    }
  });

  test("maskable mark stays inside the 80 % safe circle", () => {
    const svg = text(join(BRAND, "favicon-maskable.svg"));
    expect(svg).toMatch(
      /<rect id="tile" width="512" height="512" fill="#0c0c0c"\/>/,
    ); // full-bleed
    const d = svg.match(/<path id="glyph"[^>]*\sd="([^"]+)"/)![1];
    // Convex hull property: control points inside the (convex) circle => curve inside.
    for (const [x, y] of pathPoints(d))
      expect(Math.hypot(x - 256, y - 256)).toBeLessThanOrEqual(204.8);
  });
});

describe("default share image (DSG-24; wired as DEFAULT_OG_IMAGE by SEO-06/MKT-06)", () => {
  const jpg = join(PUBLIC, "og", "default.jpg");

  test("og/default.jpg is a 1200x630 JPEG of at most 300 KB", () => {
    expect(jpegSize(read(jpg))).toEqual({ width: 1200, height: 630 });
    expect(statSync(jpg).size).toBeLessThanOrEqual(307200);
  });

  test("#og-content (logotype + text) sits inside the 60px safe area", () => {
    const svg = text(join(BRAND, "og-default.svg"));
    expect(svg).toContain('viewBox="0 0 1200 630"');
    const group = svg.match(/<g id="og-content">([\s\S]*?)<\/g>/);
    expect(group).not.toBeNull();
    const box = hullBox(group![1]);
    expect(box.x1).toBeGreaterThanOrEqual(60);
    expect(box.y1).toBeGreaterThanOrEqual(60);
    expect(box.x2).toBeLessThanOrEqual(1140);
    expect(box.y2).toBeLessThanOrEqual(570);
  });

  test("share image carries the brand colour tokens only", () => {
    const svg = text(join(BRAND, "og-default.svg"));
    const colours = new Set(svg.match(/#[0-9a-f]{6}\b/gi));
    expect([...colours].sort()).toEqual(["#0c0c0c", "#a3a3a3", "#ffffff"]);
  });
});

describe("web app manifest (SEO-23, FE-30, MKT-22, DSG-24)", () => {
  const raw = text(join(PUBLIC, "manifest.json"));
  const manifest = JSON.parse(raw);

  test("carries the brand, not the CRA sample", () => {
    expect(manifest.name).toBe("Cengizhan Köse");
    expect(manifest.short_name).toBe("CENGO");
    expect(raw).not.toContain("React App");
    expect(raw).not.toContain("Create React App");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("en");
    expect(manifest.theme_color).toBe("#0c0c0c");
    expect(manifest.background_color).toBe("#0c0c0c");
  });

  test("every icon exists as a PNG of the declared size", () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    for (const icon of manifest.icons) {
      expect(icon.src).toStartWith("/");
      expect(icon.type).toBe("image/png");
      const file = join(PUBLIC, icon.src);
      expect(existsSync(file)).toBe(true);
      const { width, height } = pngSize(read(file));
      expect(icon.sizes).toBe(`${width}x${height}`);
    }
  });

  test('offers 192 + 512 "any" icons and a 512 maskable icon', () => {
    const key = (i: { sizes: string; purpose?: string }) =>
      `${i.sizes}:${i.purpose ?? "any"}`;
    const keys = manifest.icons.map(key);
    expect(keys).toContain("192x192:any");
    expect(keys).toContain("512x512:any");
    expect(keys).toContain("512x512:maskable");
  });
});

describe("index.html head links (FE-26, SEO-15, SEO-23, MKT-22, DSG-24)", () => {
  const html = text(join(ROOT, "index.html"));
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
  const attr = (tag: string, name: string) =>
    tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const byRel = (rel: string) => links.filter((l) => attr(l, "rel") === rel);

  test("links the ICO, the SVG icon, the touch icon and the manifest exactly once each", () => {
    expect(byRel("icon").map((l) => attr(l, "href"))).toEqual([
      "/favicon.ico",
      "/favicon.svg",
    ]);
    expect(attr(byRel("icon")[0], "sizes")).toBe("48x48");
    expect(attr(byRel("icon")[1], "type")).toBe("image/svg+xml");
    expect(byRel("apple-touch-icon").map((l) => attr(l, "href"))).toEqual([
      "/apple-touch-icon.png",
    ]);
    expect(byRel("manifest").map((l) => attr(l, "href"))).toEqual([
      "/manifest.json",
    ]);
    expect(
      html.match(/rel="(icon|apple-touch-icon|manifest)"/g)?.length,
    ).toBeGreaterThanOrEqual(4);
  });

  test("every linked icon and the manifest exist in public/", () => {
    for (const rel of ["icon", "apple-touch-icon", "manifest"]) {
      for (const link of byRel(rel))
        expect(existsSync(join(PUBLIC, attr(link, "href")!))).toBe(true);
    }
  });
});
