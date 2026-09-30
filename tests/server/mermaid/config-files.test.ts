// PERF-05 step 4: scripts/mermaid.{light,dark}.json are the Mermaid configs of
// the stored drawings. They must say what the blog's own theme mapping says
// (FE-35, src/lib/mermaidTheme.js), so a stored diagram looks like one drawn
// in the browser, plus the two settings a stored diagram needs.
import { describe, expect, test, setDefaultTimeout } from "bun:test";
import { join } from "node:path";
import {
  THEME_TOKENS,
  mermaidConfig,
  themeVariables,
} from "../../../src/lib/mermaidTheme.js";
import {
  CONFIG_DIR,
  configPath,
  publishConfig,
  THEMES,
} from "../../../scripts/lib/render-mermaid";

// Shared machines get loaded: the default 5 s per test is too tight for jsdom and PGlite.
setDefaultTimeout(30_000);

const readJson = (theme: "light" | "dark") =>
  Bun.file(configPath(theme)).json();

describe("scripts/mermaid.<theme>.json", () => {
  test("live next to the scripts", () => {
    expect(CONFIG_DIR).toEndWith("/scripts");
    expect(configPath("dark")).toBe(join(CONFIG_DIR, "mermaid.dark.json"));
  });

  for (const theme of THEMES) {
    test(`${theme}: equals publishConfig("${theme}") (bun scripts/lib/write-mermaid-config.ts rewrites it)`, async () => {
      expect(await readJson(theme)).toEqual(publishConfig(theme));
    });

    test(`${theme}: the site's theme tokens, as FE-35 maps them`, async () => {
      const config = await readJson(theme);
      const tokens = THEME_TOKENS[theme];
      expect(config.theme).toBe("base");
      expect(config.themeVariables).toEqual(themeVariables(tokens));
      expect(config.themeVariables.background).toBe(tokens.bg);
      expect(config.themeVariables.textColor).toBe(tokens.text);
      expect(config.themeVariables.lineColor).toBe(tokens.muted);
      expect(config.themeVariables.darkMode).toBe(theme === "dark");
      expect(config.fontFamily).toBe("Raleway, sans-serif");
    });

    test(`${theme}: strict security, plain SVG labels, natural size`, async () => {
      const config = await readJson(theme);
      expect(config.securityLevel).toBe("strict");
      expect(config.startOnLoad).toBe(false);
      expect(config.suppressErrorRendering).toBe(true);
      expect(config.htmlLabels).toBe(false);
      expect(config.flowchart).toEqual({
        htmlLabels: false,
        useMaxWidth: false,
      });
      // Every diagram type keeps its natural size (DSG-06 scrolls instead).
      for (const [name, value] of Object.entries(
        mermaidConfig(THEME_TOKENS[theme]),
      )) {
        if (value && typeof value === "object" && "useMaxWidth" in value) {
          expect(config[name].useMaxWidth).toBe(false);
        }
      }
    });
  }

  test("the two files differ only in the colours", async () => {
    const { themeVariables: lightVariables, ...light } =
      await readJson("light");
    const { themeVariables: darkVariables, ...dark } = await readJson("dark");
    expect(light).toEqual(dark);
    expect(lightVariables).not.toEqual(darkVariables);
  });

  test("end with a newline and parse as plain JSON", async () => {
    for (const theme of THEMES) {
      const text = await Bun.file(configPath(theme)).text();
      expect(text.endsWith("}\n")).toBe(true);
      expect(() => JSON.parse(text)).not.toThrow();
    }
  });
});
