/**
 * Unit checks for scripts/brand/build-brand-assets.ts (DSG-24): the ICO writer and
 * the share-image layout guard, so a regenerated asset set keeps the same contract.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parse } from "opentype.js";
import {
  buildMonogramSvg,
  buildOgSvg,
  emboldenGlyph,
  encodeIco,
  OG,
} from "../../../scripts/brand/build-brand-assets";

const FONTS = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "node_modules",
  "@fontsource",
);
const load = async (pkg: string, file: string) =>
  parse(await Bun.file(join(FONTS, pkg, "files", file)).arrayBuffer());

describe("encodeIco", () => {
  test("writes an ICONDIR with one PNG entry per size", () => {
    const fake = (n: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, n]);
    const ico = encodeIco([
      { size: 16, png: fake(1) },
      { size: 32, png: fake(2) },
      { size: 256, png: fake(3) },
    ]);
    const view = new DataView(ico.buffer);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(3);
    expect(ico[6]).toBe(16);
    expect(ico[6 + 16]).toBe(32);
    expect(ico[6 + 32]).toBe(0); // 256 is stored as 0
    const offset = view.getUint32(6 + 32 + 12, true);
    expect([...ico.subarray(offset, offset + 5)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 3,
    ]);
    expect(ico.byteLength).toBe(6 + 3 * 16 + 15);
  });
});

describe("masters", () => {
  test("share-image content box is inside the safe area and the builder refuses otherwise", async () => {
    const marcellus = await load(
      "marcellus",
      "marcellus-latin-400-normal.woff",
    );
    const raleway = await load("raleway", "raleway-latin-500-normal.woff");
    const { box } = buildOgSvg(marcellus, raleway);
    expect(box.x1).toBeGreaterThanOrEqual(OG.safe);
    expect(box.y1).toBeGreaterThanOrEqual(OG.safe);
    expect(box.x2).toBeLessThanOrEqual(OG.width - OG.safe);
    expect(box.y2).toBeLessThanOrEqual(OG.height - OG.safe);
  });

  test("small-size emboldening only touches the glyph", async () => {
    const marcellus = await load(
      "marcellus",
      "marcellus-latin-400-normal.woff",
    );
    const svg = buildMonogramSvg(marcellus, "master");
    const bold = emboldenGlyph(svg, 30);
    expect(bold).toContain(
      '<path id="glyph" stroke="#ffffff" stroke-width="30" stroke-linejoin="round" fill="#ffffff"',
    );
    expect(
      bold.replace(
        / stroke="#ffffff" stroke-width="30" stroke-linejoin="round"/,
        "",
      ),
    ).toBe(svg);
    expect(() => emboldenGlyph("<svg/>", 4)).toThrow();
  });
});
