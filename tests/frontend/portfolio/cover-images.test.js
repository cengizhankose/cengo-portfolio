// @vitest-environment node
//
// The portfolio image pipeline (FE-04 step 9, DSG-08 step 7, DSG-29, W13):
// the case presets and the podium presets of
// scripts/images/build-responsive.ts, run here on synthetic pictures in a
// temporary directory (the committed masters and outputs are checked in
// registry.test.js and awards.test.js). Checks: 16:10 crop at 480/800/1280
// and square podiums at 320/640, AVIF + WebP under their budgets, the file
// names the <picture> elements ask for, and the refusals (upscaling, a file
// that cannot fit the budget).
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
import { AWARD_RECORDS } from "../../../src/content/awards.js";
import {
  AWARD_IMAGE,
  awardSrc,
  awardWidths,
} from "../../../src/pages/portfolio/awardImage.js";
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
  const image = sharp(Buffer.from(svg));
  await (
    relative.endsWith(".jpg") ? image.jpeg({ quality: 92 }) : image.png()
  ).toFile(file);
}

const PODIUMS = AWARD_RECORDS.filter((record) => record.image);

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
        source: `scripts/images/sources/projects/${name}.jpg`,
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

  it("has one square podium preset per award record with a photo (W13)", () => {
    expect(PODIUMS.length).toBeGreaterThan(0);
    for (const { image } of PODIUMS) {
      const spec = PRESETS[`award-${image.name}`];
      expect(spec, image.name).toMatchObject({
        source: `scripts/images/sources/awards/${image.name}.jpg`,
        outDir: "public/img/awards",
        name: image.name,
        version: AWARD_IMAGE.version,
        aspect: [1, 1],
        maxBytes: 80 * 1024,
      });
      expect(spec.formats).toBe(COVER_FORMATS);
      expect(spec.widths).toEqual(awardWidths(image));
      const plan = planVariants(spec).map((variant) => variant.file);
      const asked = awardWidths(image).flatMap((width) =>
        ["avif", "webp"].map(
          (ext) => `public${awardSrc(image.name, width, ext)}`,
        ),
      );
      expect(plan.sort()).toEqual(asked.sort());
    }
    // A record without a photo has no preset.
    const names = PODIUMS.map((record) => `award-${record.image.name}`);
    expect(
      Object.keys(PRESETS).filter((key) => key.startsWith("award-")),
    ).toEqual(names);
  });

  it("a podium photo smaller than the default set lists its own widths, never upscaled", () => {
    expect(AWARD_IMAGE.widths).toEqual([320, 640]);
    const own = PODIUMS.filter((record) => record.image.widths);
    expect(own.map((record) => record.id)).toEqual(["hackstellar-2025"]);
    expect(awardWidths(own[0].image)).toEqual([320, 448]);
  });

  it("rejects a malformed spec", () => {
    const base = PRESETS["portfolio-farmin"];
    expect(() => planVariants({ ...base, aspect: [16, 0] })).toThrow(/aspect/);
    expect(() => planVariants({ ...base, maxBytes: 0 })).toThrow(/maxBytes/);
  });
});

// AVIF at effort 9 is slow; a busy machine needs far more than the default 5 s.
const SLOW = 120_000;

describe("building a cover", () => {
  it(
    "writes six files at 480/800/1280, cropped to 16:10 and under 150 KB",
    async () => {
      await writeSource(
        "scripts/images/sources/projects/salesgym.jpg",
        1800,
        1100,
      );

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
    },
    SLOW,
  );

  it(
    "steps the quality down until a busy image fits, and never below the floor",
    async () => {
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
    },
    SLOW,
  );

  it(
    "refuses to upscale a narrow source, and a source too short for 16:10",
    async () => {
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
    },
    SLOW,
  );

  it(
    "an exact 1280x800 capture is accepted (the effort screenshot)",
    async () => {
      await writeSource(
        "scripts/images/sources/projects/effort-lab.jpg",
        1280,
        800,
      );
      const built = await buildResponsive(
        PRESETS["portfolio-effort-lab"],
        root,
      );
      expect(
        built.map((variant) => variant.width).sort((a, b) => a - b),
      ).toEqual([480, 480, 800, 800, 1280, 1280]);
    },
    SLOW,
  );
});

describe("building a podium photo (W13)", () => {
  it(
    "writes a square AVIF + WebP per width, under 80 KB, without metadata",
    async () => {
      const spec = PRESETS["award-teknasyon-2022"];
      await writeSource(spec.source, 900, 1200);

      const built = await buildResponsive(spec, root);

      expect(
        built.map((variant) => variant.width).sort((a, b) => a - b),
      ).toEqual([320, 320, 640, 640]);
      for (const variant of built) {
        const file = join(root, variant.file);
        expect(statSync(file).size, variant.file).toBeLessThanOrEqual(
          AWARD_IMAGE.maxBytes,
        );
        const info = imageInfo(readFileSync(file));
        expect(info.width).toBe(variant.width);
        expect(info.height).toBe(variant.width);
        expect(info.exif).toBeFalsy();
      }
    },
    SLOW,
  );

  it(
    "refuses a podium source smaller than its largest width",
    async () => {
      const spec = PRESETS["award-hackstellar-2025"];
      await writeSource(spec.source, 400, 400);
      await expect(buildResponsive(spec, root)).rejects.toThrow(
        /400px wide; 448w would be upscaled/,
      );
    },
    SLOW,
  );
});

describe("the command line (W6 review handoff)", () => {
  it("looks presets up with hasOwn, so inherited names are not presets", () => {
    const source = readFileSync(
      join(import.meta.dirname, "../../../scripts/images/build-responsive.ts"),
      "utf8",
    );
    expect(source).toMatch(/Object\.hasOwn\(PRESETS, name\)/);
    expect(Object.hasOwn(PRESETS, "constructor")).toBe(false);
    expect(Object.keys(PRESETS).sort()).toEqual(
      [
        "hero",
        "portfolio-effort-lab",
        "portfolio-farmin",
        "portfolio-salesgym",
        ...PODIUMS.map((record) => `award-${record.image.name}`),
      ].sort(),
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
