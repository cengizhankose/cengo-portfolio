// @vitest-environment node
//
// FE-20 / DSG-32 / DSG-25 acceptance criteria as source checks (jsdom loads no
// CSS): token and layer structure, no global leakage, the z-index scale, no
// `!important` outside base.css, no catch-all transition, and the guarantee
// that every `styles.x` in a component names a class its CSS Module defines
// (a missing one would print `class="undefined"` and style nothing).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_CSS, TOKENS_CSS } from "./global-css.js";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (file) => readFileSync(join(ROOT, file), "utf8");
const filesUnder = (dir) =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
const SRC = filesUnder("src");
const CSS = SRC.filter((file) => /\.s?css$/.test(file));
const MODULES = CSS.filter((file) => file.endsWith(".module.css"));
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Local class names of a CSS Module: every `.name` outside :global(...). */
function localClasses(file) {
  const plain = stripComments(read(file)).replace(/:global\([^)]*\)/g, "");
  return new Set(
    [...plain.matchAll(/(?<!\d)\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]),
  );
}

describe("tokens (FE-20 step 1, DSG-32 step 1)", () => {
  const dark = TOKENS_CSS.slice(TOKENS_CSS.indexOf("\n:root {"));
  const light = TOKENS_CSS.slice(
    TOKENS_CSS.indexOf('\n[data-theme="light"] {'),
  );
  const value = (block, name) =>
    new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1].trim();

  it("holds colour, layer, spacing, motion and cursor tokens in both themes", () => {
    for (const name of [
      "--bg-color",
      "--surface-color",
      "--text-color",
      "--text-muted",
      "--border-color",
    ]) {
      expect(value(dark, name), `dark ${name}`).toBeDefined();
      expect(value(light, name), `light ${name}`).toBeDefined();
    }
    for (const name of [
      "--cursor-ring-color",
      "--cursor-ring-hover-color",
      "--space-1",
      "--space-6",
      "--dur-fast",
      "--ease-out",
    ]) {
      expect(value(dark, name), name).toBeDefined();
    }
  });

  it("gives the muted text its own colour, different from the text colour, in both themes", () => {
    expect(value(dark, "--text-muted")).not.toBe(value(dark, "--text-color"));
    expect(value(light, "--text-muted")).not.toBe(value(light, "--text-color"));
  });

  it("has one z-index scale, lowest to highest: header, frame, progress, skip link, cursor", () => {
    const z = (name) => Number(value(dark, `--z-${name}`));
    const order = ["header", "frame", "progress", "skip-link", "cursor"].map(z);
    expect(order.every(Number.isInteger)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
    // Bootstrap's .fixed-top is 1030: the scale starts there.
    expect(order[0]).toBe(1030);
  });

  it("never writes a stacking value by hand: every z-index is a token or a small local order", () => {
    const hand = CSS.flatMap((file) =>
      [...stripComments(read(file)).matchAll(/z-index:\s*([^;]+);/g)]
        .map((m) => [file, m[1].trim()])
        .filter(([, v]) => !v.startsWith("var(--z-") && !/^-?\d{1,2}$/.test(v)),
    );
    expect(hand).toEqual([]);
  });
});

describe("cascade layers (FE-20 step 2)", () => {
  it("declares the order vendor, tokens, base in layers.css and index.css", () => {
    expect(read("src/styles/layers.css")).toMatch(
      /@layer vendor, tokens, base;/,
    );
    const index = read("src/index.css");
    expect(index).toMatch(/@layer vendor, tokens, base;/);
    expect(index).toMatch(/@import "\.\/styles\/tokens\.css" layer\(tokens\);/);
    expect(index).toMatch(/@import "\.\/styles\/base\.css" layer\(base\);/);
  });

  it("imports layers.css first, ahead of the Bootstrap subset", () => {
    const app = read("src/app/App.jsx");
    expect(app.indexOf("styles/layers.css")).toBeGreaterThan(-1);
    expect(app.indexOf("styles/layers.css")).toBeLessThan(
      app.indexOf("styles/bootstrap-subset.scss"),
    );
  });

  it("compiles Bootstrap into the vendor layer, with the @use lines above it", () => {
    const scss = read("src/styles/bootstrap-subset.scss");
    expect(scss).toMatch(/@layer vendor \{/);
    expect(scss.indexOf('@use "sass:list"')).toBeLessThan(
      scss.indexOf("@layer vendor {"),
    );
    expect(
      scss.match(/@import "bootstrap\/scss\/(root|reboot|utilities\/api)"/g),
    ).toHaveLength(3);
    // every component and utility import is inside the layer block
    const layered = scss.slice(scss.indexOf("@layer vendor {"));
    for (const name of ["root", "reboot", "grid", "buttons", "utilities/api"]) {
      expect(layered).toContain(`@import "bootstrap/scss/${name}"`);
    }
  });

  it("keeps component and page styles out of any layer, so they beat Bootstrap without !important", () => {
    for (const file of MODULES) {
      expect(read(file), file).not.toMatch(/@layer/);
    }
  });
});

describe("no global leakage (FE-20 steps 3, 5, 8)", () => {
  it("has no bare element selector in a page stylesheet", () => {
    for (const file of CSS.filter((f) => f.startsWith("src/pages/"))) {
      const bare = stripComments(read(file))
        .split("\n")
        .filter((line) =>
          /^\s*(section|p|a|ul|li|h[1-6]|body|html)\s*[,{]/.test(line),
        );
      expect(bare, file).toEqual([]);
    }
  });

  it("has at least four page CSS Modules, and the pages import them", () => {
    const pages = MODULES.filter((f) => f.startsWith("src/pages/"));
    expect(pages.length).toBeGreaterThanOrEqual(4);
    for (const file of pages) {
      const name = file.split("/").pop();
      const owner = SRC.filter((f) => /\.jsx$/.test(f)).filter((f) =>
        read(f).includes(`./${name}`),
      );
      expect(owner.length, file).toBeGreaterThan(0);
    }
  });

  it("only base.css writes !important", () => {
    const hits = CSS.filter((f) => f.endsWith(".css"))
      .filter((f) => f !== "src/styles/base.css")
      .filter((f) => /!important/.test(read(f)));
    expect(hits).toEqual([]);
    expect(
      read("src/styles/base.css").match(/!important/g).length,
    ).toBeGreaterThan(0);
  });

  it("has no catch-all transition, anywhere (DSG-25)", () => {
    for (const file of CSS) {
      const css = stripComments(read(file));
      expect(css, file).not.toMatch(/transition:\s*(all\b|[0-9.]+m?s)/);
      expect(css, file).not.toMatch(/transition:[^;]*\ball\b/);
      expect(css, file).not.toMatch(/transition-property:[^;]*\ball\b/);
    }
  });

  it("only the global stylesheets and the blog's stay unscoped", () => {
    const globals = CSS.filter((f) => !f.endsWith(".module.css")).sort();
    expect(globals).toEqual([
      "src/index.css",
      "src/pages/blog/style.css",
      "src/styles/base.css",
      "src/styles/bootstrap-subset.scss",
      "src/styles/fonts.css",
      "src/styles/layers.css",
      "src/styles/tokens.css",
    ]);
  });

  it("keeps the blog stylesheet global on purpose: the server finds it by its two root class names", () => {
    // src/server/static.ts BLOG_STYLE_MARKERS reads these from the CSS asset.
    const blog = read("src/pages/blog/style.css");
    expect(blog).toContain(".blog-container");
    expect(blog).toContain(".blog-post-container");
    expect(read("src/server/static.ts")).toContain('".blog-container"');
  });

  it("uses the shared global classes the pages and the header rely on, and base.css defines them", () => {
    for (const name of [
      "page-shell",
      "scroll-locked",
      "section-gap",
      "section-rule",
      "skip-link",
      "visually-hidden",
    ]) {
      expect(BASE_CSS, name).toContain(`.${name}`);
    }
    expect(read("src/app/routes.jsx")).toContain('className="page-shell"');
    expect(read("src/header/index.jsx")).toContain(
      'querySelector(".page-shell")',
    );
  });
});

describe("CSS Module usage (FE-20 step 8)", () => {
  const JSX = SRC.filter((f) => /\.(jsx|js)$/.test(f));

  it("names, in every component, only classes its module defines", () => {
    const problems = [];
    let checked = 0;
    for (const file of JSX) {
      const full = read(file);
      const source = full.replace(/^import .*$/gm, "");
      for (const [, binding, path] of full.matchAll(
        /import (\w+) from "(\.[^"]+\.module\.css)"/g,
      )) {
        const target = join(file, "..", path).replace(/\\/g, "/");
        const defined = localClasses(target);
        for (const [, name] of source.matchAll(
          new RegExp(`\\b${binding}\\.(\\w+)`, "g"),
        )) {
          checked += 1;
          if (!defined.has(name)) problems.push(`${file}: ${binding}.${name}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(problems).toEqual([]);
  });

  it("imports every CSS Module somewhere", () => {
    const sources = JSX.map(read).join("\n");
    for (const file of MODULES) {
      expect(sources, file).toContain(file.split("/").pop());
    }
  });

  it("writes module class names in camelCase (tokens and base.css stay kebab-case)", () => {
    for (const file of MODULES) {
      const bad = [...localClasses(file)].filter((name) => /[-_]/.test(name));
      expect(bad, file).toEqual([]);
    }
  });

  it("imports no stylesheet by a bare side-effect import except the global ones", () => {
    const allowed = new Set([
      "src/entry-client.jsx",
      "src/app/App.jsx",
      "src/pages/blog/BlogHome.jsx",
      "src/pages/blog/BlogPost.jsx",
    ]);
    const offenders = JSX.filter((file) =>
      /^import "[^"]+\.s?css";/m.test(read(file)),
    ).filter((file) => !allowed.has(file));
    expect(offenders).toEqual([]);
  });
});

describe("dead selectors stay gone (DSG-32 step 4)", () => {
  it("has none of the template leftovers anywhere in src", () => {
    const pattern =
      /who_am_I|cortina__wrapper-menu|main__menu_ul|menu_right|theme_toggler|fadeInUp|has-first-color|btn-portfolio|btn-about|text-color-2|--secondary-color|--primary-color|\bt_border\b|\bsec_sp\b|\bcolor_sec\b|\bAbout-header\b/;
    const hits = SRC.filter((f) => /\.(jsx?|tsx?|css|scss)$/.test(f)).filter(
      (f) => pattern.test(read(f)),
    );
    // src/lib/mermaidTheme.js only says in a comment that it does not read --primary-color.
    expect(hits).toEqual(["src/lib/mermaidTheme.js"]);
  });
});
