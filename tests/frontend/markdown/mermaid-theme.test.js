// FE-35 / DSG-06: the Mermaid configuration comes from the site's theme
// tokens, is valid for Mermaid's colour maths (hex), keeps labels readable on
// their node fills in both themes, and leaves no hard-coded palette in src/.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  THEME_TOKENS,
  contrast,
  mermaidConfig,
  mix,
  parseColor,
  readTokens,
  themeVariables,
  toHex,
  tokensForTheme,
} from "../../../src/lib/mermaidTheme.js";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const INDEX_CSS = readFileSync(join(ROOT, "src", "index.css"), "utf8");

// The declarations of a top-level rule in src/index.css.
function tokenBlock(selector) {
  const start = INDEX_CSS.indexOf(`\n${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  const body = INDEX_CSS.slice(
    INDEX_CSS.indexOf("{", start) + 1,
    INDEX_CSS.indexOf("}", start),
  );
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

const BLOCKS = { dark: ":root", light: '[data-theme="light"]' };

describe("colour helpers", () => {
  it("parses #rgb, #rrggbb and rgb() and rejects everything else", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    expect(parseColor(" #0C0c0c ")).toEqual([12, 12, 12]);
    expect(parseColor("rgb(1, 2, 3)")).toEqual([1, 2, 3]);
    expect(parseColor("rgba(1 2 3 / 50%)")).toEqual([1, 2, 3]);
    for (const bad of [
      "",
      "red",
      "#ggg",
      "#12345",
      "var(--x)",
      null,
      undefined,
    ]) {
      expect(parseColor(bad), String(bad)).toBeNull();
    }
  });

  it("normalises to #rrggbb", () => {
    expect(toHex("#abc")).toBe("#aabbcc");
    expect(toHex("rgb(255, 0, 16)")).toBe("#ff0010");
    expect(toHex("nope")).toBeNull();
  });

  it("mixes and measures contrast", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("THEME_TOKENS equals src/index.css", () => {
  it.each(Object.entries(BLOCKS))("%s", (theme, selector) => {
    const css = tokenBlock(selector);
    const tokens = THEME_TOKENS[theme];
    expect(toHex(css["--bg-color"])).toBe(tokens.bg);
    expect(toHex(css["--text-color"])).toBe(tokens.text);
    expect(toHex(css["--text-muted"])).toBe(tokens.muted);
    expect(toHex(css["--border-color"])).toBe(tokens.border);
  });

  it("declares --border-color in both theme blocks (DSG-06)", () => {
    for (const selector of Object.values(BLOCKS)) {
      expect(tokenBlock(selector)["--border-color"]).toBeTruthy();
    }
  });

  it("keeps the frame visible: --border-color is at least 3:1 on the page", () => {
    for (const tokens of Object.values(THEME_TOKENS)) {
      expect(contrast(tokens.border, tokens.bg)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("themeVariables", () => {
  it.each(Object.entries(THEME_TOKENS))(
    "%s: every colour is #rrggbb",
    (_t, tokens) => {
      const variables = themeVariables(tokens);
      for (const [name, value] of Object.entries(variables)) {
        if (name === "darkMode" || name === "fontFamily") continue;
        expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
      }
    },
  );

  it("sets darkMode from the background", () => {
    expect(themeVariables(THEME_TOKENS.dark).darkMode).toBe(true);
    expect(themeVariables(THEME_TOKENS.light).darkMode).toBe(false);
  });

  it.each(Object.entries(THEME_TOKENS))(
    "%s: node text is readable on the node, cluster and note fills (>= 4.5:1)",
    (_theme, tokens) => {
      const v = themeVariables(tokens);
      for (const fill of [
        v.mainBkg,
        v.primaryColor,
        v.secondaryColor,
        v.tertiaryColor,
        v.clusterBkg,
        v.noteBkgColor,
        v.actorBkg,
      ]) {
        expect(contrast(v.nodeTextColor, fill), fill).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrast(v.primaryTextColor, fill), fill).toBeGreaterThanOrEqual(
          4.5,
        );
      }
      // Text on the page background (edge labels, titles).
      expect(contrast(v.titleColor, tokens.bg)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(v.edgeLabelBackground, v.textColor),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(Object.entries(THEME_TOKENS))(
    "%s: lines and node borders are visible on the page (>= 3:1)",
    (_theme, tokens) => {
      const v = themeVariables(tokens);
      expect(contrast(v.lineColor, tokens.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(v.nodeBorder, tokens.bg)).toBeGreaterThanOrEqual(3);
    },
  );

  it("gives the label its exact page colour: black on white, white on black", () => {
    expect(themeVariables(THEME_TOKENS.light).nodeTextColor).toBe("#000000");
    expect(themeVariables(THEME_TOKENS.dark).nodeTextColor).toBe("#ffffff");
  });
});

describe("mermaidConfig", () => {
  const config = mermaidConfig(THEME_TOKENS.dark);

  it("is the safe, token-based base theme", () => {
    expect(config).toMatchObject({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: "base",
      fontFamily: "Raleway, sans-serif",
    });
    expect(config.themeVariables).toEqual(themeVariables(THEME_TOKENS.dark));
  });

  it("draws at natural size: no max-width shrinking for any diagram type (DSG-06)", () => {
    expect(config.flowchart).toEqual({ useMaxWidth: false });
    for (const type of [
      "sequence",
      "class",
      "state",
      "er",
      "gantt",
      "pie",
      "mindmap",
    ]) {
      expect(config[type], type).toEqual({ useMaxWidth: false });
    }
  });

  it("differs between the themes only through the tokens", () => {
    const light = mermaidConfig(THEME_TOKENS.light);
    expect(light.themeVariables.background).toBe("#ffffff");
    expect(config.themeVariables.background).toBe("#0c0c0c");
    expect(light.theme).toBe(config.theme);
  });
});

describe("tokensForTheme / readTokens", () => {
  it("returns the static tokens of a theme, dark for anything else", () => {
    expect(tokensForTheme("light")).toBe(THEME_TOKENS.light);
    expect(tokensForTheme("dark")).toBe(THEME_TOKENS.dark);
    expect(tokensForTheme(undefined)).toBe(THEME_TOKENS.dark);
  });

  it("reads the CSS variables of <html>", () => {
    const style = document.createElement("style");
    style.textContent =
      ":root{--bg-color:#102030;--text-color:#eeeeee;--text-muted:rgb(10, 20, 30);--border-color:#abc}";
    document.head.append(style);
    try {
      expect(readTokens()).toEqual({
        bg: "#102030",
        text: "#eeeeee",
        muted: "#0a141e",
        border: "#aabbcc",
      });
    } finally {
      style.remove();
    }
  });

  it("falls back to the static tokens of the current theme for a missing or invalid variable", () => {
    document.documentElement.setAttribute("data-theme", "light");
    const style = document.createElement("style");
    style.textContent = ":root{--bg-color:not-a-colour}";
    document.head.append(style);
    try {
      expect(readTokens()).toEqual(THEME_TOKENS.light);
    } finally {
      style.remove();
    }
  });
});
