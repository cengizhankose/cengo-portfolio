// @vitest-environment node
// PERF-21, FE-08, FE-09, DSG-15, DSG-16 (K-10): the classic script in the
// index.html <head> puts the theme on <html> before the first paint.
//
// Each case parses the real index.html in a fresh jsdom with scripts enabled,
// so the script runs at its real position during parsing, against a stubbed
// localStorage / matchMedia. (The module entry is not loaded: jsdom does not
// fetch subresources here.)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { describe, expect, it } from "vitest";
import { THEME_COLORS } from "../../../src/lib/theme.js";
import { GLOBAL_CSS } from "../css-arch/global-css.js";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const HTML = readFileSync(join(ROOT, "index.html"), "utf8");
const CSS = GLOBAL_CSS;
const LIGHT_QUERY = "(prefers-color-scheme: light)";

/**
 * Loads index.html. `stored` is the localStorage "theme" value (undefined =
 * no key), `osLight` answers the prefers-color-scheme: light query,
 * `storage: "blocked"` makes the localStorage getter throw a SecurityError
 * (Chrome with "Not allowed to save data"), `matchMedia: false` removes it.
 */
function load({ stored, osLight = false, storage = "ok", matchMedia = true }) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error));
  const dom = new JSDOM(HTML, {
    url: "https://www.cengizhankose.com/",
    runScripts: "dangerously",
    virtualConsole,
    beforeParse(window) {
      if (stored !== undefined) window.localStorage.setItem("theme", stored);
      if (storage === "blocked") {
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          get() {
            throw new window.DOMException(
              "The operation is insecure.",
              "SecurityError",
            );
          },
        });
      }
      if (matchMedia) {
        window.matchMedia = (query) => ({
          matches: query === LIGHT_QUERY ? osLight : !osLight,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        });
      } else {
        delete window.matchMedia;
      }
    },
  });
  const { document } = dom.window;
  const root = document.documentElement;
  return {
    window: dom.window,
    errors,
    theme: root.getAttribute("data-theme"),
    colorScheme: root.style.colorScheme,
    metaColors: [...document.querySelectorAll('meta[name="theme-color"]')].map(
      (meta) => meta.getAttribute("content"),
    ),
    stored: () => dom.window.localStorage.getItem("theme"),
  };
}

describe("head script: stored choice wins (PERF-21, FE-09)", () => {
  it.each([
    ["light", false],
    ["light", true],
    ["dark", false],
    ["dark", true],
  ])("stored %j (OS light: %s) is applied as is", (stored, osLight) => {
    const page = load({ stored, osLight });

    expect(page.theme).toBe(stored);
    expect(page.colorScheme).toBe(stored);
    expect(page.metaColors).toEqual([
      THEME_COLORS[stored],
      THEME_COLORS[stored],
    ]);
    expect(page.stored()).toBe(stored);
    expect(page.errors).toEqual([]);
  });
});

describe("head script: no stored choice follows the system (K-10, FE-08, DSG-15)", () => {
  it.each([
    [true, "light"],
    [false, "dark"],
  ])("OS light=%s gives %s and writes nothing", (osLight, expected) => {
    const page = load({ osLight });

    expect(page.theme).toBe(expected);
    expect(page.colorScheme).toBe(expected);
    expect(page.metaColors).toEqual([
      THEME_COLORS[expected],
      THEME_COLORS[expected],
    ]);
    expect(page.stored()).toBeNull();
    expect(page.errors).toEqual([]);
  });

  it.each(["null", "", "Dark", "system", "undefined"])(
    "invalid stored value %j is dropped and never reaches data-theme",
    (stored) => {
      for (const osLight of [true, false]) {
        const page = load({ stored, osLight });

        expect(page.theme).toBe(osLight ? "light" : "dark");
        expect(page.theme).not.toBe("null");
        expect(page.stored()).toBeNull();
      }
    },
  );

  it("falls back to dark when matchMedia is missing", () => {
    const page = load({ matchMedia: false });

    expect(page.theme).toBe("dark");
    expect(page.colorScheme).toBe("dark");
    expect(page.errors).toEqual([]);
  });
});

describe("head script: blocked storage (FE-09)", () => {
  it.each([
    [true, "light"],
    [false, "dark"],
  ])(
    "SecurityError on localStorage is swallowed; OS light=%s gives %s",
    (osLight, expected) => {
      const page = load({ stored: "light", osLight, storage: "blocked" });

      expect(page.errors).toEqual([]);
      expect(page.theme).toBe(expected);
      expect(page.colorScheme).toBe(expected);
    },
  );
});

describe("index.html head structure", () => {
  const head = HTML.slice(0, HTML.indexOf("</head>"));
  const inlineScripts = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const script = inlineScripts[0]?.[1] ?? "";
  const scriptAt = head.indexOf("<script>");

  it("has exactly one inline classic script in the head", () => {
    expect(inlineScripts).toHaveLength(1);
    expect(head.match(/<script\b/g)).toHaveLength(1);
  });

  it("runs before every stylesheet, font preload and module script (FE-09)", () => {
    // PERF-08: the source holds no stylesheet link any more (the fonts are
    // self-hosted, Vite adds the CSS link at build time after the head
    // script); the two font preloads are what follows the script.
    const firstStylesheet = head.search(/<link\b[^>]*rel="stylesheet"/);
    if (firstStylesheet !== -1)
      expect(firstStylesheet).toBeGreaterThan(scriptAt);
    expect(head.indexOf('rel="preload"')).toBeGreaterThan(scriptAt);
    expect(HTML.indexOf('type="module"')).toBeGreaterThan(scriptAt);
  });

  it('FE-09 grep: the first "data-theme|stylesheet" line is the script\'s', () => {
    // Same check as `curl -s $SITE/ | grep -n "data-theme\|stylesheet"`.
    const hits = HTML.split("\n").filter((line) =>
      /data-theme|stylesheet/.test(line),
    );
    expect(hits[0]).toContain('setAttribute("data-theme"');
  });

  it("comes after the two theme-color metas it updates (DSG-16)", () => {
    const metas = [...head.matchAll(/<meta\b[^>]*name="theme-color"[^>]*>/g)];
    expect(metas).toHaveLength(2);
    for (const meta of metas) expect(meta.index).toBeLessThan(scriptAt);
  });

  it("theme-color metas start at the page backgrounds, one per OS scheme", () => {
    const metas = [
      ...head.matchAll(/<meta\b[^>]*name="theme-color"[^>]*>/g),
    ].map((m) => ({
      content: /content="([^"]*)"/.exec(m[0])?.[1],
      media: /media="([^"]*)"/.exec(m[0])?.[1],
    }));
    expect(metas).toEqual([
      { content: THEME_COLORS.dark, media: "(prefers-color-scheme: dark)" },
      { content: THEME_COLORS.light, media: "(prefers-color-scheme: light)" },
    ]);
    expect(HTML).not.toContain("#000000");
  });

  it("asks for the light scheme and stays static for the CSP hash", () => {
    expect(script).toContain(LIGHT_QUERY);
    // No template placeholders or per-request values in the hashed body.
    expect(script).not.toMatch(/%[A-Z_]+%|\{\{|\$\{|import\.meta/);
  });

  it("uses the same colors as THEME_COLORS and the --bg-color tokens", () => {
    expect(script).toContain(`"${THEME_COLORS.light}"`);
    expect(script).toContain(`"${THEME_COLORS.dark}"`);
    expect(bgColor(":root")).toBe(THEME_COLORS.dark);
    expect(bgColor('[data-theme="light"]')).toBe(THEME_COLORS.light);
  });

  it("agrees with the manifest's default (dark) theme_color", () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "public", "manifest.json"), "utf8"),
    );
    expect(manifest.theme_color).toBe(THEME_COLORS.dark);
    expect(manifest.background_color).toBe(THEME_COLORS.dark);
  });
});

function block(selector) {
  const start = CSS.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return CSS.slice(start, CSS.indexOf("}", start));
}

function bgColor(selector) {
  return /--bg-color:\s*([^;]+);/.exec(block(selector))?.[1].trim();
}
