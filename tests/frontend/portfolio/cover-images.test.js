// @vitest-environment node
//
// The card image pipeline (FE-04 step 9, DSG-08 step 7, DSG-29): the three
// presets of scripts/images/build-responsive.ts, run here on a synthetic
// screenshot in a temporary directory (the owner's real screenshots are not in
// the repository yet). Checks: 16:10 crop at 480/800/1280, AVIF + WebP under
// the 150 KB budget, the file names the card's <picture> asks for, and the
// refusals (upscaling, a file that cannot fit the budget).
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  COVER_FORMATS,
  MIN_QUALITY,
  PRESETS,
  buildResponsive,
  outputHeight,
  planVariants,
} from "../../../scripts/images/build-responsive.ts";
import {
  PROJECT_IMAGE,
  projectImageName,
  projectSrc,
} from "../../../src/pages/portfolio/projectImage.js";
import { imageInfo } from "../hero/support.js";

const COVERS = {
  "portfolio-salesgym": "salesgym",
  "portfolio-farmin": "farmin",
  "portfolio-effort-lab": "effort-lab",
};

let root;

async function writeSource(relative, width, height) {
  const { default: sharp } = await import("sharp");
  // A screenshot-like picture: flat panels, rules and text; compresses well.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#101418"/>
    <rect x="40" y="40" width="${width - 80}" height="60" fill="#1f2730"/>
    <rect x="40" y="130" width="${(width - 100) / 2}" height="${height - 180}" fill="#182028"/>
    <rect x="${40 + (width - 100) / 2 + 20}" y="130" width="${(width - 100) / 2}" height="${height - 180}" fill="#22303b"/>
    <text x="60" y="80" font-size="28" fill="#e8eef4" font-family="sans-serif">Synthetic screenshot</text>
  </svg>`;
  const file = join(root, relative);
  mkdirSync(dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(file);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "cengo-cover-test-"));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("presets (scripts/images/build-responsive.ts)", () => {
  it.each(Object.entries(COVERS))(
    "%s reads %s and writes to public/img/projects",
    (preset, name) => {
      const spec = PRESETS[preset];
      expect(spec).toMatchObject({
        source: `scripts/images/sources/${name}.png`,
        outDir: "public/img/projects",
        name,
        version: PROJECT_IMAGE.version,
        aspect: [16, 10],
        maxBytes: 150 * 1024,
      });
      expect(spec.widths).toBe(PROJECT_IMAGE.widths);
      expect(spec.formats).toBe(COVER_FORMATS);
    },
  );

  it("the file names are the ones the card asks for (one module, no drift)", () => {
    for (const [preset, name] of Object.entries(COVERS)) {
      const plan = planVariants(PRESETS[preset]).map((variant) => variant.file);
      const asked = PROJECT_IMAGE.widths.flatMap((width) =>
        ["avif", "webp"].map((ext) => `public${projectSrc(name, width, ext)}`),
      );
      expect(plan.sort()).toEqual(asked.sort());
    }
  });

  it("an underscore id becomes a hyphenated file name (SEO-26)", () => {
    expect(projectImageName("effort_lab")).toBe("effort-lab");
    expect(projectImageName("salesgym")).toBe("salesgym");
  });

  it("derives the 16:10 height of each width", () => {
    expect(
      PROJECT_IMAGE.widths.map((w) =>
        outputHeight(PRESETS["portfolio-farmin"], w),
      ),
    ).toEqual([300, 500, 800]);
    expect(outputHeight({}, 800)).toBeUndefined();
    expect(PROJECT_IMAGE.width / PROJECT_IMAGE.height).toBe(1.6);
  });

  it("rejects a malformed spec", () => {
    const base = PRESETS["portfolio-farmin"];
    expect(() => planVariants({ ...base, aspect: [16, 0] })).toThrow(/aspect/);
    expect(() => planVariants({ ...base, maxBytes: 0 })).toThrow(/maxBytes/);
  });
});

describe("building a cover", () => {
  it("writes six files at 480/800/1280, cropped to 16:10 and under 150 KB", async () => {
    await writeSource("scripts/images/sources/salesgym.png", 1800, 1100);

    const built = await buildResponsive(PRESETS["portfolio-salesgym"], root);

    expect(built).toHaveLength(6);
    for (const variant of built) {
      const file = join(root, variant.file);
      expect(existsSync(file), variant.file).toBe(true);
      expect(statSync(file).size, variant.file).toBeLessThanOrEqual(
        PROJECT_IMAGE.maxBytes,
      );
      expect(variant.height).toBe(Math.round((variant.width * 10) / 16));
      const info = imageInfo(readFileSync(file));
      expect(info.format).toBe(variant.format === "avif" ? "avif" : "webp");
      expect(info.width).toBe(variant.width);
      expect(info.height).toBe(variant.height);
      expect(info.exif).toBeFalsy();
    }
  });

  it("steps the quality down until a busy image fits, and never below the floor", async () => {
    const { default: sharp } = await import("sharp");
    const file = join(root, "scripts/images/sources/busy.png");
    mkdirSync(dirname(file), { recursive: true });
    await sharp({
      create: {
        width: 600,
        height: 400,
        channels: 3,
        background: "#808080",
        noise: { type: "gaussian", mean: 128, sigma: 60 },
      },
    })
      .png()
      .toFile(file);

    const spec = {
      ...PRESETS["portfolio-farmin"],
      source: "scripts/images/sources/busy.png",
      widths: [480],
      formats: [{ format: "webp", quality: () => 90 }],
      maxBytes: 60 * 1024,
    };
    const [variant] = await buildResponsive(spec, root);
    expect(variant.bytes).toBeLessThanOrEqual(60 * 1024);
    expect(variant.quality).toBeLessThan(90);
    expect(variant.quality).toBeGreaterThanOrEqual(MIN_QUALITY);

    await expect(
      buildResponsive({ ...spec, maxBytes: 300 }, root),
    ).rejects.toThrow(/over the 300 B budget/);
  });

  it("refuses to upscale a narrow source, and a source too short for 16:10", async () => {
    await writeSource("scripts/images/sources/narrow.png", 1000, 700);
    await writeSource("scripts/images/sources/short.png", 1400, 700);
    const base = PRESETS["portfolio-effort-lab"];

    await expect(
      buildResponsive(
        { ...base, source: "scripts/images/sources/narrow.png" },
        root,
      ),
    ).rejects.toThrow(/1000px wide; 1280w would be upscaled/);
    await expect(
      buildResponsive(
        { ...base, source: "scripts/images/sources/short.png" },
        root,
      ),
    ).rejects.toThrow(/700px high; 1280x800 would be upscaled/);
  });

  it("an exact 1280x800 capture is accepted (the effort screenshot)", async () => {
    await writeSource("scripts/images/sources/effort-lab.png", 1280, 800);
    const built = await buildResponsive(PRESETS["portfolio-effort-lab"], root);
    expect(built.map((variant) => variant.width).sort((a, b) => a - b)).toEqual(
      [480, 480, 800, 800, 1280, 1280],
    );
  });
});

describe("the hero preset is untouched by the crop and budget options", () => {
  it("has no aspect or byte budget", () => {
    expect(PRESETS.hero.aspect).toBeUndefined();
    expect(PRESETS.hero.maxBytes).toBeUndefined();
    expect(PRESETS.hero.widths).toEqual([640, 768, 1000, 1284]);
  });
});
