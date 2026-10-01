// @vitest-environment node
// PERF-08 / ANL-17: one self-hosted font layer. The faces list
// (scripts/fonts/faces.ts) drives the files in public/fonts/v1, the generated
// src/styles/fonts.css, the preload links in index.html and the font stacks in
// src/index.css; these tests keep the four in step and pin the budgets.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FACES,
  FALLBACK_FACES,
  FONT_STACKS,
  PRELOADED,
  faceFile,
  faceUrl,
} from "../../../scripts/fonts/faces.ts";
import {
  renderFontsCss,
  renderOfl,
} from "../../../scripts/fonts/sync-fonts.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");
const FONT_DIR = join(ROOT, "public", "fonts", "v1");
const CSS = read("src", "styles", "fonts.css");
const HTML = read("index.html");

/** Every file under a directory whose name matches `pattern`. */
function walk(dir, pattern) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, pattern);
    return pattern.test(entry.name) ? [path] : [];
  });
}

/** The @font-face blocks of a stylesheet as property maps. */
function fontFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const props = {};
    for (const [, key, value] of body.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)) {
      props[key] = value.replace(/\s+/g, " ").trim();
    }
    return props;
  });
}

describe("font files (public/fonts/v1)", () => {
  it("has one woff2 per face and nothing else but the licence", () => {
    const expected = [...FACES.map(faceFile), "OFL.txt"].sort();
    expect(readdirSync(FONT_DIR).sort()).toEqual(expected);
  });

  it.each(FACES.map((f) => [faceFile(f)]))(
    "%s is a real woff2 file",
    (name) => {
      const bytes = readFileSync(join(FONT_DIR, name));
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOF2");
      expect(bytes.length).toBeGreaterThan(5_000);
      expect(bytes.length).toBeLessThan(30_000);
    },
  );

  it("OFL.txt names both families and carries the licence", () => {
    const text = read("public", "fonts", "v1", "OFL.txt");
    expect(text).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(text).toContain('Reserved Font Name "Raleway"');
    expect(text).toContain('Reserved Font Name "Marcellus"');
    expect(text).toBe(renderOfl());
  });

  it("ships only the weight set of the type scale (DSG-17 / FE-19)", () => {
    const set = new Set(FACES.map((f) => `${f.family} ${f.weight} ${f.style}`));
    expect([...set].sort()).toEqual([
      "Marcellus 400 normal",
      "Raleway 400 italic",
      "Raleway 400 normal",
      "Raleway 500 normal",
      "Raleway 600 normal",
      "Raleway 700 normal",
    ]);
  });

  it("every numeric font-weight in src/**/*.css has a shipped Raleway weight", () => {
    const shipped = new Set(
      FACES.filter((f) => f.family === "Raleway").map((f) => f.weight),
    );
    const used = new Set();
    for (const file of walk(join(ROOT, "src"), /\.css$/)) {
      if (file.endsWith("fonts.css")) continue;
      const css = readFileSync(file, "utf8");
      for (const [, w] of css.matchAll(/font-weight:\s*(\d{3})\b/g)) {
        used.add(Number(w));
      }
    }
    expect(used.size).toBeGreaterThan(0);
    for (const weight of used) expect(shipped.has(weight)).toBe(true);
  });
});

describe("src/styles/fonts.css", () => {
  it("is exactly what scripts/fonts/sync-fonts.ts generates", async () => {
    expect(CSS).toBe(await renderFontsCss());
  });

  it("declares every face once, from our own origin, with font-display: swap", () => {
    const web = fontFaces(CSS).filter((f) => f.src?.startsWith("url("));
    expect(web).toHaveLength(FACES.length);
    const urls = web.map((f) => f.src.match(/url\("([^"]+)"\)/)[1]).sort();
    expect(urls).toEqual(FACES.map(faceUrl).sort());
    for (const face of web) {
      expect(face["font-display"]).toBe("swap");
      expect(face.src).toContain('format("woff2")');
      expect(face.src).not.toMatch(/https?:/);
      expect(face["unicode-range"]).toMatch(/^U\+/);
    }
    expect(CSS).not.toMatch(/fonts\.(googleapis|gstatic)\.com|@import/);
  });

  it("covers the Turkish letters: i-dotless in latin, g-breve s-cedilla I-dot in latin-ext (criterion 5)", () => {
    const covers = (range, cp) =>
      range.split(",").some((part) => {
        const [lo, hi = lo] = part.trim().replace(/U\+/g, "").split("-");
        return cp >= parseInt(lo, 16) && cp <= parseInt(hi, 16);
      });
    const rangeOf = (family, subset) =>
      fontFaces(CSS).find(
        (f) =>
          f["font-family"] === `"${family}"` &&
          f["font-weight"] === "400" &&
          f.src.includes(`-${subset}-400-normal`),
      )["unicode-range"];
    for (const family of ["Raleway", "Marcellus"]) {
      const latin = rangeOf(family, "latin");
      const ext = rangeOf(family, "latin-ext");
      expect(covers(latin, "ı".codePointAt(0))).toBe(true);
      for (const ch of ["ğ", "ş", "İ", "Ğ", "Ş"]) {
        expect(covers(ext, ch.codePointAt(0))).toBe(true);
        expect(covers(latin, ch.codePointAt(0))).toBe(false);
      }
      for (const ch of ["ç", "ö", "ü", "Ç", "a", "Z"]) {
        expect(covers(latin, ch.codePointAt(0))).toBe(true);
      }
    }
  });

  it("has metric-compatible fallback faces that use local fonts only", () => {
    const fallbacks = fontFaces(CSS).filter((f) => !f.src?.startsWith("url("));
    expect(fallbacks).toHaveLength(FALLBACK_FACES.length);
    expect(new Set(fallbacks.map((f) => f["font-family"]))).toEqual(
      new Set(['"Raleway Fallback"', '"Marcellus Fallback"']),
    );
    for (const face of fallbacks) {
      expect(face.src).toMatch(/^local\(/);
      for (const key of [
        "size-adjust",
        "ascent-override",
        "descent-override",
        "line-gap-override",
      ]) {
        expect(face[key]).toMatch(/^\d+(\.\d+)?%$/);
      }
      const adjust = parseFloat(face["size-adjust"]);
      expect(adjust).toBeGreaterThan(90);
      expect(adjust).toBeLessThan(115);
    }
  });
});

describe("index.html", () => {
  it("has no Google Fonts host and no external stylesheet or preconnect (criterion 1)", () => {
    expect(HTML).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(HTML).not.toMatch(/rel="preconnect"/);
    expect(HTML).not.toMatch(/<link[^>]+rel="stylesheet"/);
  });

  it("preloads exactly the first-screen faces, same-origin, with crossorigin", () => {
    const links = [...HTML.matchAll(/<link\s[^>]*rel="preload"[^>]*>/g)].map(
      ([tag]) => tag,
    );
    expect(links).toHaveLength(PRELOADED.length);
    const hrefs = links.map((tag) => tag.match(/href="([^"]+)"/)[1]);
    expect(hrefs.sort()).toEqual(PRELOADED.map(faceUrl).sort());
    for (const tag of links) {
      expect(tag).toMatch(/\bas="font"/);
      expect(tag).toMatch(/\btype="font\/woff2"/);
      expect(tag).toMatch(/\bcrossorigin\b/);
    }
  });

  it("only preloads faces that fonts.css declares, with the same URL (no double download)", () => {
    const declared = fontFaces(CSS).map((f) => f.src);
    for (const face of PRELOADED) {
      expect(declared.some((src) => src.includes(`"${faceUrl(face)}"`))).toBe(
        true,
      );
    }
  });

  it("keeps the preloaded bytes within the home budget: 2 files, at most 60 KB (criterion 3)", () => {
    const sizes = PRELOADED.map(
      (f) => statSync(join(FONT_DIR, faceFile(f))).size,
    );
    expect(sizes).toHaveLength(2);
    expect(sizes[0] + sizes[1]).toBeLessThanOrEqual(60 * 1024);
  });

  it("puts the preloads after the theme script (theme-init order contract)", () => {
    const script = HTML.indexOf("<script>");
    const firstPreload = HTML.indexOf('rel="preload"');
    expect(script).toBeGreaterThan(-1);
    expect(firstPreload).toBeGreaterThan(script);
  });
});

describe("entry and stacks", () => {
  it("entry-client.jsx imports fonts.css before index.css", () => {
    const main = read("src", "entry-client.jsx");
    const fonts = main.indexOf('import "./styles/fonts.css"');
    const index = main.indexOf('import "./index.css"');
    expect(fonts).toBeGreaterThan(-1);
    expect(index).toBeGreaterThan(fonts);
  });

  it("index.css defines the two stacks from faces.ts and uses them on body and headings", () => {
    const css = read("src", "index.css").replace(/\s+/g, " ");
    expect(css).toContain(`--font-body: ${FONT_STACKS.body};`);
    expect(css).toContain(`--font-display: ${FONT_STACKS.display};`);
    expect(css).toMatch(/body \{[^}]*font-family: var\(--font-body\);/);
    expect(css).toMatch(/h6 \{ font-family: var\(--font-display\); \}/);
  });

  it("every stack names its fallback face, a system face and a generic family", () => {
    expect(FONT_STACKS.body).toContain('"Raleway Fallback"');
    expect(FONT_STACKS.body).toMatch(/system-ui/);
    expect(FONT_STACKS.body).toMatch(/sans-serif$/);
    expect(FONT_STACKS.display).toContain('"Marcellus Fallback"');
    expect(FONT_STACKS.display).toContain("Georgia");
    expect(FONT_STACKS.display).toMatch(/serif$/);
  });

  it("no source file (css, js, jsx, ts) mentions a Google Fonts host", () => {
    const offenders = walk(join(ROOT, "src"), /\.(css|jsx?|tsx?)$/).filter(
      (file) =>
        /fonts\.(googleapis|gstatic)\.com/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
