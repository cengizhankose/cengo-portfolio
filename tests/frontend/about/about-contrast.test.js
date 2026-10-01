// @vitest-environment node
//
// MKT-15 criterion: the timeline text keeps a contrast of at least 4.5:1 in
// the dark theme (and the light one). jsdom computes no cascade, so this reads
// the theme tokens from src/index.css and the colours the new rules use, and
// checks the ratios with the WCAG formula. The computed-style half (real
// rendering, axe color-contrast) is checked in a real browser and recorded in
// the package report.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GLOBAL_CSS } from "../css-arch/global-css.js";

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), "utf8");
const INDEX = GLOBAL_CSS;
const ABOUT = read("src/pages/about/about.module.css");
const STRIP = read("src/components/proofstrip/proofstrip.module.css");

function declarations(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} rule`).not.toBeNull();
  return Object.fromEntries(
    match[1]
      .split(";")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const colon = line.indexOf(":");
        return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
      }),
  );
}

function luminance(hex) {
  const full =
    hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const THEMES = [
  ["dark", ":root"],
  ["light", '[data-theme="light"]'],
];

// `var(--name)` -> the token's value in that theme.
const resolve = (tokens, value) => {
  const name = value.match(/^var\((--[\w-]+)\)$/)?.[1];
  expect(name, value).toBeTruthy();
  return tokens[name];
};

describe.each(THEMES)(
  "%s theme text colours on the About page",
  (_name, selector) => {
    const tokens = declarations(INDEX, selector);
    const bg = tokens["--bg-color"];

    it("keeps the timeline rows and their outcomes at 4.5:1 or better", () => {
      // Role row: the DSG-01 table variable paints the cells with --text-color.
      const table = declarations(ABOUT, ".page :global(.table)");
      expect(table["--bs-table-bg"]).toBe("transparent");
      expect(
        contrast(resolve(tokens, table["--bs-table-color"]), bg),
      ).toBeGreaterThanOrEqual(4.5);
      // Outcome row: the muted token.
      const outcome = declarations(ABOUT, ".page .timeline .outcome > td");
      expect(outcome.color).toBe("var(--text-muted)");
      expect(
        contrast(resolve(tokens, outcome.color), bg),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it.each([
      [ABOUT, ".skillGroupName"],
      [ABOUT, ".ventureText"],
      [STRIP, ".label"],
      [STRIP, ".testimonialRole"],
    ])("keeps %#: secondary text on the muted token", (css, rule) => {
      const { color } = declarations(css, rule);
      expect(color).toBe("var(--text-muted)");
      expect(contrast(resolve(tokens, color), bg)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the call to action button legible, resting and hovered", () => {
      const resting = declarations(ABOUT, ".ctaButton");
      expect(
        contrast(resolve(tokens, resting.color), bg),
      ).toBeGreaterThanOrEqual(4.5);
      const hover = declarations(
        ABOUT,
        ".ctaButton:hover,\n.ctaButton:focus-visible",
      );
      expect(
        contrast(
          resolve(tokens, hover.color),
          resolve(tokens, hover["background-color"]),
        ),
      ).toBeGreaterThanOrEqual(4.5);
    });
  },
);
