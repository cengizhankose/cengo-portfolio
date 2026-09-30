// @vitest-environment node
//
// The committed hero files and their generator (PERF-02, FE-18, SEO-26,
// DSG-29): one descriptive, versioned name, four widths in AVIF / WebP /
// JPEG, sizes that match the markup, the mobile variants inside the byte
// budget, metadata stripped, and the old hashed photo import gone.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HERO_IMAGE,
  heroSrc,
  heroSrcSet,
} from "../../../src/pages/home/heroImage.js";
import {
  PHOTO_FORMATS,
  PRESETS,
  planVariants,
  variantFileName,
} from "../../../scripts/images/build-responsive.ts";
import { ROOT, bytes, filesUnder, imageInfo, read } from "./support.js";

const EXTS = ["avif", "webp", "jpg"];
const FORMAT_OF = { avif: "avif", webp: "webp", jpg: "jpeg" };
const publicFile = (src) => `public${src}`;
const expectedHeight = (width) =>
  Math.round((width * HERO_IMAGE.height) / HERO_IMAGE.width);

describe("hero image module (single source for names, widths, sizes)", () => {
  it("names every file cengizhan-kose-v1-<width>.<ext> under /img/hero (SEO-26)", () => {
    expect(HERO_IMAGE).toMatchObject({
      dir: "/img/hero",
      name: "cengizhan-kose",
      version: "v1",
      width: 1284,
      height: 1654,
      fallbackWidth: 768,
    });
    expect(HERO_IMAGE.widths).toEqual([640, 768, 1000, 1284]);
    expect(heroSrc(768, "avif")).toBe("/img/hero/cengizhan-kose-v1-768.avif");
  });

  it("builds ascending w-descriptor srcsets and the 100vw / 50vw sizes", () => {
    expect(heroSrcSet("webp")).toBe(
      "/img/hero/cengizhan-kose-v1-640.webp 640w, " +
        "/img/hero/cengizhan-kose-v1-768.webp 768w, " +
        "/img/hero/cengizhan-kose-v1-1000.webp 1000w, " +
        "/img/hero/cengizhan-kose-v1-1284.webp 1284w",
    );
    expect(HERO_IMAGE.sizes).toBe("(max-width: 991.98px) 100vw, 50vw");
  });

  it("is frozen, so a render cannot change the widths", () => {
    expect(Object.isFrozen(HERO_IMAGE)).toBe(true);
    expect(Object.isFrozen(HERO_IMAGE.widths)).toBe(true);
  });
});

describe("committed files in public/img/hero (PERF-02 step 2)", () => {
  const expected = HERO_IMAGE.widths.flatMap((width) =>
    EXTS.map((ext) => publicFile(heroSrc(width, ext))),
  );

  it("holds exactly the 12 variants the markup references", () => {
    expect(filesUnder("public/img/hero").sort()).toEqual([...expected].sort());
  });

  it.each(
    HERO_IMAGE.widths.flatMap((width) => EXTS.map((ext) => [width, ext])),
  )("%sw .%s: real format, width x height of the photo", (width, ext) => {
    const info = imageInfo(bytes(publicFile(heroSrc(width, ext))));
    expect(info.format).toBe(FORMAT_OF[ext]);
    expect(info.width).toBe(width);
    expect(info.height).toBe(expectedHeight(width));
  });

  it("the width/height attributes are the largest file's real size (DSG-29)", () => {
    const info = imageInfo(bytes(publicFile(heroSrc(1284, "jpg"))));
    expect([info.width, info.height]).toEqual([
      HERO_IMAGE.width,
      HERO_IMAGE.height,
    ]);
  });

  it("keeps the phone variants inside the budget: 640w and 768w AVIF <= 100 KB (PERF-02, SEO-26)", () => {
    for (const width of [640, 768]) {
      const size = statSync(
        join(ROOT, publicFile(heroSrc(width, "avif"))),
      ).size;
      expect(size, `${width}w avif`).toBeLessThanOrEqual(100_000);
    }
  });

  it("AVIF is the smallest and WebP beats JPEG at every width", () => {
    for (const width of HERO_IMAGE.widths) {
      const [avif, webp, jpg] = EXTS.map(
        (ext) => statSync(join(ROOT, publicFile(heroSrc(width, ext)))).size,
      );
      expect(avif, `${width}w`).toBeLessThan(webp);
      expect(avif, `${width}w`).toBeLessThan(jpg);
    }
  });

  it("strips EXIF and the Display P3 profile (colours are converted to sRGB); JPEGs are progressive", () => {
    for (const file of expected) {
      const info = imageInfo(bytes(file));
      expect(info.exif, file).toBeFalsy();
      expect(info.icc, file).toBeFalsy();
      if (info.format === "jpeg") expect(info.progressive, file).toBe(true);
    }
  });
});

describe("generator preset (scripts/images/build-responsive.ts)", () => {
  const hero = PRESETS.hero;

  it("reads its names and widths from the hero module and writes to public/img/hero", () => {
    expect(hero).toMatchObject({
      source: "scripts/images/sources/cengizhan-kose.jpg",
      outDir: "public/img/hero",
      name: HERO_IMAGE.name,
      version: HERO_IMAGE.version,
    });
    expect(hero.widths).toBe(HERO_IMAGE.widths);
    expect(existsSync(join(ROOT, hero.source))).toBe(true);
  });

  it("plans exactly the committed files, with the PERF-02 qualities", () => {
    const plan = planVariants(hero);
    expect(plan.map((v) => v.file).sort()).toEqual(
      filesUnder("public/img/hero").sort(),
    );
    const quality = Object.fromEntries(
      plan.map((v) => [`${v.width}.${v.format}`, v.quality]),
    );
    expect(quality).toEqual({
      "640.avif": 55,
      "768.avif": 55,
      "1000.avif": 45,
      "1284.avif": 45,
      "640.webp": 70,
      "768.webp": 70,
      "1000.webp": 70,
      "1284.webp": 70,
      "640.jpg": 72,
      "768.jpg": 72,
      "1000.jpg": 72,
      "1284.jpg": 72,
    });
  });

  it("names files <name>-<version>-<width>.<ext>", () => {
    expect(
      variantFileName({ name: "cover-x", version: "v2" }, 480, "webp"),
    ).toBe("cover-x-v2-480.webp");
  });

  it.each([
    [{ name: "Photo" }, /slug/],
    [{ name: "photo_1" }, /slug/],
    [{ version: "1" }, /version/],
    [{ version: "v0" }, /version/],
    [{ widths: [768, 640] }, /ascending/],
    [{ widths: [640, 640] }, /ascending/],
    [{ widths: [640.5] }, /integer/],
    [{ widths: [] }, /at least one/],
    [{ formats: [{ format: "avif", quality: () => 0 }] }, /quality/],
  ])("rejects an unsafe spec %o", (override, message) => {
    expect(() =>
      planVariants({
        source: "x.jpg",
        outDir: "public/img/x",
        name: "x",
        version: "v1",
        widths: [640],
        formats: PHOTO_FORMATS,
        ...override,
      }),
    ).toThrow(message);
  });
});

describe("old photo pipeline removed (PERF-02 / SEO-26 grep criteria)", () => {
  it("src/assets/images/photo.JPG no longer exists", () => {
    expect(existsSync(join(ROOT, "src/assets/images/photo.JPG"))).toBe(false);
  });

  // The plan's literal `grep -rn "photo.JPG" src` also finds one doc
  // comment in src/server/mime.ts (an example file name for the
  // case-insensitive MIME lookup, handed off); what matters is that no
  // code loads the old file or any upper-case .JPG asset.
  it("no source file or index.html loads the old photo or an upper-case .JPG", () => {
    const code = [...filesUnder("src"), "index.html"].filter((file) =>
      /\.(jsx?|tsx?|css|scss|html)$/.test(file),
    );
    const hits = code.filter((file) => {
      const source = read(file).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
      return (
        /assets\/images\/photo/i.test(source) ||
        /(import|from|url\()[^;\n]*\.JPG\b/.test(source)
      );
    });
    expect(hits).toEqual([]);
  });

  it("the home page has no load-gated opacity left (PERF-07, FE-18)", () => {
    const hits = filesUnder("src/pages/home").filter((file) =>
      /imageLoaded|img-placeholder|setImageLoaded|opacity: imageLoaded/.test(
        read(file),
      ),
    );
    expect(hits).toEqual([]);
  });
});
