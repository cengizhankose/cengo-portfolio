// @vitest-environment node
//
// Bootstrap compiled from the used modules only (PERF-09, FE-21):
// - the subset compiles with the vite.config.js Sass options and logs nothing,
// - the shipped CSS stays inside the PERF-09 budget,
// - every Bootstrap class the source names is still compiled (the rendered
//   pages are checked in rendered-classes.test.jsx),
// - unused modules stay out, the contact alert and the DSG-01 table keep
//   their rules, .navbar-brand is local, and nothing imports the precompiled
//   Bootstrap CSS any more.
import { gzipSync } from "node:zlib";
import { transformWithEsbuild } from "vite";
import { beforeAll, describe, expect, it } from "vitest";
import viteConfig, { scssOptions } from "../../../vite.config.js";
import {
  classSelectors,
  compileSubset,
  filesUnder,
  fullBootstrapClasses,
  localClasses,
  read,
  sourceClassNames,
} from "./support.js";

let css;
let warnings;
let compiled;

beforeAll(async () => {
  ({ css, warnings } = await compileSubset(scssOptions));
  compiled = classSelectors(css);
}, 30_000);

const gzip = (text) => gzipSync(text, { level: 9 }).length;

// Declarations of the first rule whose selector list contains `selector`.
function declarations(source, selector) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(",").map((part) => part.trim());
    if (selectors.includes(selector)) {
      return Object.fromEntries(
        match[2]
          .split(";")
          .map((decl) => decl.trim())
          .filter(Boolean)
          .map((decl) => {
            const colon = decl.indexOf(":");
            return [decl.slice(0, colon).trim(), decl.slice(colon + 1).trim()];
          }),
      );
    }
  }
  return null;
}

describe("Sass setup (PERF-09 steps 2 and 5)", () => {
  it("compiles through sass-embedded with the vite.config.js options", () => {
    expect(viteConfig.css.preprocessorOptions.scss).toBe(scssOptions);
    expect(scssOptions.quietDeps).toBe(true);
    expect(scssOptions.silenceDeprecations).toContain("import");
    // Obsolete in Dart Sass 1.105: naming it prints its own warning.
    expect(scssOptions.silenceDeprecations).not.toContain("mixed-decls");
    expect(JSON.parse(read("package.json")).devDependencies).toHaveProperty(
      "sass-embedded",
    );
  });

  it("logs no Sass warning or deprecation", () => {
    expect(warnings).toEqual([]);
  });
});

describe("size budget (PERF-09, FE-21)", () => {
  it("compiles the subset to at most 42 kB raw and 8.7 kB gzip", () => {
    // Full bootstrap.min.css: 232,111 B. Subset: ~38.4 kB / ~7.9 kB.
    expect(css.length).toBeLessThanOrEqual(42_000);
    expect(gzip(css)).toBeLessThanOrEqual(8_700);
  });

  it("keeps the subset plus every src/ stylesheet within 76,000 B raw and 16,000 B gzip -9", async () => {
    // What `vite build` ships in assets/index-*.css: the subset plus the
    // page and component CSS, minified by esbuild (build.minify is terser, so
    // Vite minifies CSS with esbuild). Before PERF-09: 248,074 B / 34,717 B.
    const local = filesUnder("src", /\.css$/)
      .map((file) => read(file))
      .join("\n");
    const { code } = await transformWithEsbuild(
      `${css}\n${local}`,
      "index.css",
      { minify: true },
    );
    // W8 added the portfolio cards, author box, post footer and @font-face
    // rules (+2.6 kB raw). Budget raised at the W8 merge; W10-FE-css-architecture
    // (tokens + CSS Modules, dead-CSS removal) must bring it back to 70,000 / 15,000.
    expect(code.length).toBeLessThanOrEqual(76_000);
    expect(gzip(code)).toBeLessThanOrEqual(16_000);
  });
});

describe("class coverage (FE-21 step 1)", () => {
  it("compiles every Bootstrap class that a className in src/ names", () => {
    const bootstrap = fullBootstrapClasses();
    // Bootstrap class names with a local rule instead (.navbar-brand).
    const local = localClasses();
    const used = [...sourceClassNames()].filter(([name]) =>
      bootstrap.has(name),
    );
    // Sanity: the scan finds the classes the pages are built with.
    expect(used.map(([name]) => name)).toEqual(
      expect.arrayContaining(["display-4", "form-control", "table", "btn"]),
    );
    const missing = used
      .filter(([name]) => !compiled.has(name) && !local.has(name))
      .map(([name, file]) => `${name} (${file})`);
    expect(missing).toEqual([]);
  });

  it("keeps the header's helpers (W2-FE-nav-a11y handoff)", () => {
    for (const name of [
      "fixed-top",
      "d-flex",
      "flex-wrap",
      "flex-column",
      "flex-md-row",
      "justify-content-between",
      "align-items-center",
      "align-items-md-center",
      "position-absolute",
      "w-100",
      "h-100",
      "m-0",
      "p-0",
      "p-3",
      "my-3",
    ]) {
      expect(compiled, name).toContain(name);
    }
  });

  it("keeps every .container max-width (grid classes use fewer breakpoints)", () => {
    for (const [min, width] of [
      ["576px", "540px"],
      ["768px", "720px"],
      ["992px", "960px"],
      ["1200px", "1140px"],
      ["1400px", "1320px"],
    ]) {
      expect(css).toMatch(
        new RegExp(
          `@media\\(min-width: ?${min}\\)\\{[^}]*\\.container\\b[^{]*\\{max-width: ?${width}`,
        ),
      );
    }
  });

  it("keeps the grid react-bootstrap renders and the type helpers", () => {
    for (const name of [
      "container",
      "row",
      "col-lg-5",
      "col-lg-6",
      "col-lg-7",
      "col-lg-8",
      "col-lg-12",
      "display-4",
      "h3",
      "h5",
      "list-unstyled",
      "caption-top",
      "form-label",
    ]) {
      expect(compiled, name).toContain(name);
    }
  });

  it("leaves out the modules and variants the site does not use", () => {
    for (const name of [
      "navbar",
      "navbar-brand",
      "nav-link",
      "card",
      "modal",
      "dropdown-menu",
      "progress",
      "badge",
      "btn-primary",
      "btn-outline-danger",
      "alert-primary",
      "table-dark",
      "table-primary",
      "mt-md-3",
      "col-md-6",
      "col-xl-4",
      "d-sm-none",
      "order-xxl-1",
      "text-bg-primary",
      "visually-hidden",
    ]) {
      expect(compiled, name).not.toContain(name);
    }
    // No [data-bs-theme=dark] blocks: the site themes with <html data-theme>.
    expect(css).not.toMatch(/data-bs-theme=.?dark/);
  });
});

describe("components kept on purpose", () => {
  it("styles the contact alert and its close button (FE-21 criterion 4)", () => {
    for (const name of [
      "alert",
      "alert-success",
      "alert-danger",
      "alert-dismissible",
      "alert-link",
      "btn-close",
    ]) {
      expect(compiled, name).toContain(name);
    }
    expect(declarations(css, ".alert-dismissible .btn-close")).toMatchObject({
      position: "absolute",
    });
    expect(declarations(css, ".btn-close").background).toMatch(
      /var\(--bs-btn-close-bg\)/,
    );
    expect(declarations(css, ".btn-close")["--bs-btn-close-bg"]).toMatch(
      /^url\("data:image\/svg\+xml/,
    );
  });

  it("paints table cells from --bs-table-* variables, so DSG-01 still applies", () => {
    expect(declarations(css, ".table")).toMatchObject({
      "--bs-table-bg": "var(--bs-body-bg)",
      "--bs-table-color": "var(--bs-emphasis-color)",
    });
    const cell = declarations(css, ".table>:not(caption)>*>*");
    expect(cell["background-color"]).toBe("var(--bs-table-bg)");
    expect(cell.color).toMatch(/var\(--bs-table-color\)/);
    // DSG-01's override (two classes) outranks .table (one class).
    expect(
      declarations(read("src/pages/about/style.css"), ".About-header .table"),
    ).toMatchObject({
      "--bs-table-bg": "transparent",
      "--bs-table-color": "var(--text-color)",
    });
  });
});

describe("imports (PERF-09 step 6, FE-21 criterion 2)", () => {
  it("App.jsx imports the subset", () => {
    expect(read("src/app/App.jsx")).toMatch(
      /^import "\.\.\/styles\/bootstrap-subset\.scss";$/m,
    );
  });

  it("nothing under src/ imports the precompiled Bootstrap CSS", () => {
    // FE-21: grep -rn "bootstrap.min.css\|bootstrap/dist/css" src -> 0.
    const offenders = filesUnder("src", /\.(jsx?|tsx?|s?css)$/).filter((file) =>
      /bootstrap\/dist\/css|bootstrap\.min\.css/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });
});

describe(".navbar-brand is local (PERF-09 step 4, FE-21 step 4)", () => {
  const header = read("src/header/style.css");

  it("keeps the two declarations that reached the brand link", () => {
    expect(declarations(header, ".navbar-brand")).toEqual({
      "text-decoration": "none",
      "white-space": "nowrap",
    });
  });

  it("sits above .nav_ac, which still sets padding, margin, size and color", () => {
    expect(header.indexOf(".navbar-brand {")).toBeLessThan(
      header.indexOf(".nav_ac {"),
    );
    expect(declarations(header, ".nav_ac")).toMatchObject({
      padding: "5px 15px",
      margin: "0",
      "font-size": "1.25rem",
      color: "var(--text-color-2)",
    });
  });
});
