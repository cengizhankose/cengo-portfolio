// @vitest-environment node
//
// Type scale, real weights and font fallbacks (FE-19, DSG-17) and balanced
// headings (DSG-31 step 2). Source checks: jsdom has no layout or fonts. The
// computed checks (no Marcellus element above 400, Raleway 600/700 load,
// h1 text-wrap: balance) were run in headless Chrome, see the package
// report.
import { beforeAll, describe, expect, it } from "vitest";
import { scssOptions } from "../../../vite.config.js";
import { compileSubset } from "../bootstrap/support.js";
import {
  allDeclarations,
  declared,
  read,
  rules,
  stylesheets,
} from "./support.js";

const INDEX = read("src/index.css");
const SCALE = ["sm", "base", "md", "lg", "xl", "2xl"];

const fontSizes = () =>
  allDeclarations().filter(([, prop]) => prop === "font-size");

describe("type scale (FE-19 steps 1-2)", () => {
  it("defines six --fs-* steps and the three family stacks on :root", () => {
    const root = declared(INDEX, ":root");
    for (const step of SCALE) expect(root).toHaveProperty(`--fs-${step}`);
    expect(root["--font-display"]).toMatch(/^"Marcellus", .*serif$/);
    expect(root["--font-body"]).toMatch(/^"Raleway", .*sans-serif$/);
    expect(root["--font-mono"]).toMatch(/^ui-monospace, .*monospace$/);
  });

  it("has at most 8 distinct font-size values in src CSS (the audit counted 22)", () => {
    const distinct = new Set(fontSizes().map(([, , value]) => value));
    expect(distinct.size).toBeLessThanOrEqual(8);
  });

  it("takes every font-size from the scale", () => {
    const off = fontSizes()
      .filter(
        ([, , value]) => !/^var\(--fs-(sm|base|md|lg|xl|2xl)\)$/.test(value),
      )
      .map(([file, , value, selector]) => `${file} ${selector}: ${value}`);
    expect(off).toEqual([]);
  });

  it("puts the menu links on the largest step (was 4.8vw)", () => {
    expect(
      declared(read("src/header/style.css"), ".the_menu .menu_item > a"),
    ).toMatchObject({
      "font-size": "var(--fs-2xl)",
    });
    expect(read("src/header/style.css")).not.toMatch(/\d+(\.\d+)?vw\s*;/);
  });
});

describe("font families (FE-19 step 4, W8 handoff)", () => {
  it("names no family that is not loaded and no bare Marcellus", () => {
    for (const file of stylesheets()) {
      expect(read(file), file).not.toMatch(
        /font-family:\s*Marcellus;|Cinzel|Source Code Pro|source-code-pro/,
      );
    }
  });

  it("sets every family through a --font-* stack, so the metric fallbacks apply", () => {
    const off = allDeclarations()
      .filter(([, prop]) => prop === "font-family" || prop === "font")
      .filter(([, , value]) => value !== "inherit")
      .filter(
        ([, , value]) => !/var\(--font-(body|display|mono)\)$/.test(value),
      )
      .map(([file, , value, selector]) => `${file} ${selector}: ${value}`);
    expect(off).toEqual([]);
  });

  it("sets code in the system monospace and the text colour (no Bootstrap pink)", () => {
    expect(declared(INDEX, "code")).toMatchObject({
      "font-family": "var(--font-mono)",
      color: "inherit",
    });
  });
});

describe("no synthetic bold (DSG-17, FE-19 step 3)", () => {
  const weights = () =>
    allDeclarations().flatMap(([file, prop, value, selector]) => {
      if (prop === "font-weight") return [[file, value, selector]];
      if (prop === "font") {
        const [first] = value.split(" ");
        return /^\d{3}$/.test(first) ? [[file, first, selector]] : [];
      }
      return [];
    });

  it("asks only for Raleway weights that ship and are in the scale: 400, 500, 700", () => {
    const off = weights()
      .filter(([, value]) => !["400", "500", "700", "inherit"].includes(value))
      .map(([file, value, selector]) => `${file} ${selector}: ${value}`);
    expect(off).toEqual([]);
  });

  it("keeps every Marcellus rule at 400 with font-synthesis: none", () => {
    const off = [];
    for (const file of stylesheets()) {
      for (const rule of rules(read(file))) {
        if (rule.props["font-family"] !== "var(--font-display)") continue;
        // The global h1-h6 family rule: weight and synthesis come from the
        // :is(h1, ...) rule right after it.
        if (rule.selector === "h1, h2, h3, h4, h5, h6") continue;
        if (rule.props["font-synthesis"] !== "none")
          off.push(`${file} ${rule.selector}: synthesis`);
        const weight = rule.props["font-weight"];
        if (weight && weight !== "400")
          off.push(`${file} ${rule.selector}: ${weight}`);
      }
    }
    expect(off).toEqual([]);
  });

  it("sets headings (and bold text inside them) to 400 with no synthesis", () => {
    expect(declared(INDEX, ":is(h1, h2, h3, h4, h5, h6)")).toMatchObject({
      "font-weight": "400",
      "font-synthesis": "none",
    });
    expect(
      declared(INDEX, ":is(h1, h2, h3, h4, h5, h6) :is(b, strong)"),
    ).toMatchObject({
      "font-weight": "inherit",
    });
  });

  it("gives heading classes and the logo no weight above 400", () => {
    const headingLike =
      /(^|\s|>)(h[1-6]|\.intro__name|\.blog-title|\.blog-post-title(-full)?|\.status-state__title|\.nav_ac|\.proofstrip__label|\.project-card__title)(\s|$|:|\.)/;
    const off = weights()
      .filter(([, value]) => Number(value) > 400)
      .filter(([, , selector]) =>
        selector.split(",").some((s) => headingLike.test(s.trim())),
      )
      .map(([file, value, selector]) => `${file} ${selector}: ${value}`);
    expect(off).toEqual([]);
  });

  it("compiles Bootstrap's headings, .display-* and .lead at 400 (W4 handoff)", async () => {
    const subset = read("src/styles/bootstrap-subset.scss");
    const variables = subset.indexOf('@import "bootstrap/scss/variables";');
    for (const name of ["headings", "display", "lead"]) {
      const at = subset.indexOf(`$${name}-font-weight: 400;`);
      expect(at, name).toBeGreaterThan(-1);
      expect(at, name).toBeLessThan(variables);
    }
    const { css } = await compileSubset(scssOptions);
    const compiledRules = rules(css);
    const weightOf = (test) =>
      compiledRules
        .filter((rule) => rule.selectors.some(test))
        .map((rule) => rule.props["font-weight"])
        .filter(Boolean);
    const headings = weightOf((s) => /^\.?h[1-6]$/.test(s));
    expect(headings.length).toBeGreaterThan(0);
    expect(new Set(headings)).toEqual(new Set(["400"]));
    const display = weightOf((s) => /^\.display-\d$/.test(s));
    expect(display.length).toBeGreaterThan(0);
    expect(new Set(display)).toEqual(new Set(["400"]));
    expect(new Set(weightOf((s) => s === ".lead"))).toEqual(new Set(["400"]));
  }, 30_000);
});

describe("home page renders only Raleway 400 and Marcellus 400 (PERF-08 budget, W8 handoff)", () => {
  // The stylesheets whose rules reach the home page. The language switcher
  // (500/700) joins them when TR goes live (W11); it renders nothing while
  // only EN is live.
  const HOME_SHEETS = [
    "src/index.css",
    "src/header/style.css",
    "src/pages/home/style.css",
    "src/components/socialicons/style.css",
    "src/app/App.css",
  ];

  it("asks for no weight other than 400 there", () => {
    const off = [];
    for (const file of HOME_SHEETS) {
      for (const rule of rules(read(file))) {
        const font = rule.props.font?.split(" ")[0];
        const weight =
          rule.props["font-weight"] ??
          (/^\d{3}$/.test(font ?? "") ? font : undefined);
        if (weight && !["400", "inherit"].includes(weight)) {
          off.push(`${file} ${rule.selector}: ${weight}`);
        }
      }
    }
    expect(off).toEqual([]);
  });

  it("keeps the hero role and tagline, the skip link and the social caption at the body weight", () => {
    const home = read("src/pages/home/style.css");
    expect(declared(home, ".intro__role")["font-weight"]).toBe("400");
    expect(declared(home, ".intro__tagline")).not.toHaveProperty("font-weight");
    expect(declared(INDEX, ".skip-link")).not.toHaveProperty("font-weight");
    expect(
      declared(
        read("src/components/socialicons/style.css"),
        ".stick_follow_icon p",
      ),
    ).not.toHaveProperty("font-weight");
  });
});

describe("balanced headings, pretty paragraphs (DSG-31 step 2)", () => {
  it("sets text-wrap: balance on h1-h6 and text-wrap: pretty on p", () => {
    expect(declared(INDEX, ":is(h1, h2, h3, h4, h5, h6)")["text-wrap"]).toBe(
      "balance",
    );
    expect(declared(INDEX, "p")["text-wrap"]).toBe("pretty");
  });
});
