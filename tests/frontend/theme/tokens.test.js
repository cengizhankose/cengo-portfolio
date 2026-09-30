// @vitest-environment node
// DSG-16 / FE-09: each theme block declares its color-scheme (native
// scrollbars and form controls follow the theme). Shared W3 token contract:
// --text-muted exists in both themes with WCAG AA contrast on --bg-color
// (DSG-04 placeholders, DSG-21 cursor ring).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "src", "index.css"),
  "utf8",
);

function declarations(selector) {
  const start = CSS.indexOf(`\n${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  const body = CSS.slice(CSS.indexOf("{", start) + 1, CSS.indexOf("}", start));
  return Object.fromEntries(
    body
      .split(";")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const colon = line.indexOf(":");
        return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
      }),
  );
}

// WCAG 2.x relative luminance / contrast ratio for #rrggbb or #rgb.
function luminance(hex) {
  const full =
    hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = [
  [":root", "dark", "#a3a3a3", "#0c0c0c"],
  ['[data-theme="light"]', "light", "#595959", "#ffffff"],
];

describe("theme tokens in src/index.css", () => {
  it.each(THEMES)("%s declares color-scheme: %s", (selector, scheme) => {
    expect(declarations(selector)["color-scheme"]).toBe(scheme);
  });

  it.each(THEMES)(
    "%s (%s): --text-muted meets WCAG AA on the background",
    (selector, _scheme, muted, bg) => {
      const tokens = declarations(selector);
      expect(tokens["--text-muted"]).toBe(muted);
      expect(tokens["--bg-color"]).toBe(bg);
      expect(contrast(muted, bg)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(tokens["--text-muted"], tokens["--primary-color"]),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("matches the ratios the design plan quotes (7.75:1 and 7.00:1)", () => {
    expect(contrast("#a3a3a3", "#0c0c0c")).toBeCloseTo(7.75, 1);
    expect(contrast("#595959", "#ffffff")).toBeCloseTo(7.0, 1);
  });
});
