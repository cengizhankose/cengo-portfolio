// @vitest-environment node
//
// Stylesheet guards for this package (jsdom loads no CSS, so the computed
// criteria are checked in a real browser and their source rules here):
// - DSG-07 rotator timing, reduced-motion switch-off, loading bar;
//   PERF-20 / DSG-10 reserved height of the rotating line
// - DSG-21 / FE-07 / PERF-11 cursor ring look and tokens, no hidden system
//   cursor, no filter tricks, old library gone
// - FE-24 (W5 gate): no deprecated/peer-incompatible runtime dependency
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getContent } from "../../../src/content/index.js";
import { ROOT, read, rule } from "./support.js";
import { GLOBAL_CSS } from "../css-arch/global-css.js";

const HOME = read("src/pages/home/home.module.css");
const CURSOR = read("src/components/Cursor.module.css");
const INDEX = GLOBAL_CSS;
const CONTACT = read("src/pages/contact/contact.module.css");
const REDUCE = "(prefers-reduced-motion: reduce)";

const seconds = (value) =>
  value.endsWith("ms") ? parseFloat(value) / 1000 : parseFloat(value);

function keyframes(css, name) {
  const start = css.indexOf(`@keyframes ${name} {`);
  expect(start, `@keyframes ${name}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") depth -= 1;
    if (depth === 0) return css.slice(start, i + 1).replace(/\s+/g, " ");
  }
  return "";
}

function sourceFiles(dir = "src") {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(jsx?|tsx?|css|scss|html)$/.test(entry.name) ? [path] : [];
    },
  );
}

describe("rotating line (PERF-12 rotator, DSG-07 timing)", () => {
  const step = seconds(rule(HOME, ".rotator")["--rot-step"]);
  const span = rule(HOME, ".rotator > span");
  const last = rule(HOME, ".rotator > span:last-child");
  const count = getContent("en").hero.phrases.length;

  it("stacks every phrase in one grid cell and animates only opacity", () => {
    expect(rule(HOME, ".rotator").display).toBe("grid");
    expect(span["grid-area"]).toBe("1 / 1");
    expect(span.opacity).toBe("0");
    expect(span.animation).toBe(
      "rotator-phrase var(--rot-step) linear calc(var(--i) * var(--rot-step)) 1 both",
    );
    expect(last).toMatchObject({
      opacity: "1",
      "animation-name": "rotator-last",
    });
    for (const name of ["rotator-phrase", "rotator-last"]) {
      const frames = keyframes(HOME, name);
      const properties = [...frames.matchAll(/([a-z-]+)\s*:/g)].map(
        (match) => match[1],
      );
      expect(new Set(properties)).toEqual(new Set(["opacity"]));
    }
    expect(keyframes(HOME, "rotator-phrase")).toContain(
      "10%, 90% { opacity: 1; }",
    );
  });

  it("turns once: iteration count 1, no infinite animation", () => {
    expect(span.animation).toMatch(/ 1 both$/);
    expect(HOME).not.toMatch(/infinite/);
  });

  it("settles on the last phrase within 5 s (WCAG 2.2.2) and shows each other phrase >= 0.9 s", () => {
    const settled = (count - 1) * step + seconds(last["animation-duration"]);
    expect(settled).toBeLessThanOrEqual(5);
    // rotator-phrase holds opacity 1 from 10% to 90% of a step.
    expect(step * 0.8).toBeGreaterThanOrEqual(0.9);
    // Both languages share the timing (same phrase count).
    expect(getContent("tr").hero.phrases).toHaveLength(count);
  });

  it("switches the animation off under reduced motion, for the last phrase too", () => {
    expect(
      rule(HOME, ".rotator > span, .rotator > span:last-child", REDUCE),
    ).toMatchObject({ animation: "none" });
  });

  it("keeps two lines for the line below 992px, where phrases wrap (DSG-10, PERF-20)", () => {
    expect(rule(HOME, ".introTagline")).toMatchObject({
      "line-height": "1.3",
    });
    expect(rule(HOME, ".introTagline")).not.toHaveProperty("min-height");
    const MOBILE = "(max-width: 991.98px)";
    expect(rule(HOME, ".introTagline", MOBILE)).toMatchObject({
      "min-height": "calc(2 * 1.3em)",
    });
    expect(
      rule(HOME, ".introTagline", MOBILE, "@supports (min-height: 1lh)"),
    ).toMatchObject({ "min-height": "2lh" });
  });

  it("uses Marcellus' only weight for the h1 (no synthetic bold) and the role on its own line", () => {
    expect(rule(HOME, ".introName")["font-weight"]).toBe("400");
    expect(rule(HOME, ".introRole")).toMatchObject({
      display: "block",
      "font-family": "var(--font-body)",
    });
    expect(HOME).not.toMatch(/\.intro_sec \.text h1/);
  });

  it("no longer animates every property of the CTA buttons (W3 handoff)", () => {
    const button = rule(
      read("src/components/actionbutton/button.module.css"),
      ".button",
    );
    expect(button).not.toHaveProperty("transition");
    expect(button["transition-property"]).toBe(
      "box-shadow, color, background-color, border-color",
    );
  });
});

describe("contact loading bar under reduced motion (DSG-07 criterion 4)", () => {
  it("stands still, full width", () => {
    expect(rule(CONTACT, ".loadingBar", REDUCE)).toMatchObject({
      animation: "none",
      transform: "none",
    });
  });
});

describe("cursor ring styles (DSG-21, FE-07, PERF-11)", () => {
  const ring = rule(CURSOR, ".cursorRing");

  it("is a 32 px, 1.5 px outline ring that never takes the pointer", () => {
    expect(ring).toMatchObject({
      position: "fixed",
      width: "32px",
      height: "32px",
      border: "1.5px solid var(--cursor-ring-color)",
      "border-radius": "50%",
      "pointer-events": "none",
      "z-index": "var(--z-cursor)",
      opacity: "0",
    });
    expect(ring).not.toHaveProperty("background");
    expect(ring).not.toHaveProperty("background-color");
  });

  it("appears on the first move and grows over clickables with the hover colour", () => {
    expect(rule(CURSOR, ".cursorRing[data-visible]")).toEqual({
      opacity: "1",
    });
    expect(rule(CURSOR, ".cursorRing[data-hover]")).toEqual({
      "border-color": "var(--cursor-ring-hover-color)",
      scale: "1.5",
    });
  });

  it("moves with `translate` and grows with `scale`, so hovering never shifts it", () => {
    // `scale` applies on top of `transform` (it would scale the position
    // too) but under `translate` (CSS Transforms 2 order).
    expect(ring["will-change"]).toBe("translate");
    expect(ring).not.toHaveProperty("transform");
    const source = read("src/components/Cursor.jsx");
    expect(source).toMatch(/style\.translate = /);
    expect(source).not.toMatch(/style\.transform/);
  });

  it("uses no invert filter, blend mode or !important", () => {
    expect(CURSOR.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(
      /invert|mix-blend-mode|!important/,
    );
  });

  it("takes its colours and layer from theme tokens that differ per theme and stay >= 3:1", () => {
    const root = rule(INDEX, ":root");
    const light = rule(INDEX, '[data-theme="light"]');
    expect(root).toMatchObject({
      "--cursor-ring-color": "var(--text-muted)",
      "--cursor-ring-hover-color": "var(--text-color)",
      "--z-cursor": "1070",
    });

    const resolve = (tokens, name) => {
      const value = tokens[name] ?? root[name];
      const ref = /^var\((--[a-z0-9-]+)\)$/.exec(value);
      return ref ? resolve(tokens, ref[1]) : value;
    };
    const rgb = (hex) => {
      const full =
        hex.length === 4
          ? `#${[...hex.slice(1)].map((c) => c + c).join("")}`
          : hex;
      return [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16));
    };
    const luminance = (hex) => {
      const [r, g, b] = rgb(hex).map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    const dark = {
      ring: resolve(root, "--cursor-ring-color"),
      hover: resolve(root, "--cursor-ring-hover-color"),
      bg: resolve(root, "--bg-color"),
    };
    const lightTheme = {
      ring: resolve(light, "--cursor-ring-color"),
      hover: resolve(light, "--cursor-ring-hover-color"),
      bg: resolve(light, "--bg-color"),
    };
    expect(dark).toEqual({ ring: "#a3a3a3", hover: "#fff", bg: "#0c0c0c" });
    expect(lightTheme).toEqual({
      ring: "#595959",
      hover: "#000",
      bg: "#ffffff",
    });
    for (const theme of [dark, lightTheme]) {
      expect(contrast(theme.ring, theme.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(theme.hover, theme.bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it("sits above the fixed header (Bootstrap .fixed-top z-index 1030)", () => {
    expect(Number(rule(INDEX, ":root")["--z-cursor"])).toBeGreaterThan(1030);
  });
});

describe("system cursor and the old library (FE-07 criteria 1-2, DSG-21)", () => {
  const files = sourceFiles();

  it("nothing in src hides the system cursor", () => {
    const hits = files.filter((file) => /cursor:\s*none/.test(read(file)));
    expect(hits).toEqual([]);
  });

  it("react-animated-cursor and its styles are gone", () => {
    const hits = [...files, "package.json", "bun.lock"].filter((file) =>
      /react-animated-cursor|AnimatedCursor|cursor__dot/.test(read(file)),
    );
    expect(hits).toEqual([]);
  });
});

describe("runtime dependencies (FE-24 criteria 1-2, W5 gate)", () => {
  const pkg = JSON.parse(read("package.json"));
  const require = createRequire(join(ROOT, "package.json"));

  it("lists no deprecated or replaced package", () => {
    // W10 (BE-15): everything Vite bundles is a devDependency now.
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const name of [
      "emailjs-com",
      "react-helmet-async",
      "react-animated-cursor",
      "typewriter-effect",
    ]) {
      expect(names).not.toContain(name);
    }
    expect(pkg.devDependencies["@emailjs/browser"]).toBeTruthy();
  });

  it("every runtime dependency accepts the installed React", () => {
    const semver = require("semver");
    const react = require("react/package.json").version;
    // Same lookup as the plan's command: node_modules/<name>/package.json.
    const mismatches = Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
    })
      .map((name) => [
        name,
        JSON.parse(read(`node_modules/${name}/package.json`)).peerDependencies
          ?.react,
      ])
      .filter(([, range]) => range && !semver.satisfies(react, range));
    expect(mismatches).toEqual([]);
  });
});
