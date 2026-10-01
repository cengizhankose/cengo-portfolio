// @vitest-environment node
//
// FE-29 / DSG-32 (dead rules): every class and id selector in src/**/*.css
// belongs to markup that is rendered somewhere, the unused theme toggler
// stylesheet is gone, and the leftovers the audit listed stay deleted.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, filesUnder, read, rules, stylesheets } from "./support.js";

// Classes that never appear literally in the source because they are built
// from a template string. Each entry names the place that builds it.
const BUILT = {};

const code = [
  ...filesUnder("src").filter((file) => /\.(jsx?|tsx?)$/.test(file)),
  "index.html",
]
  .map(read)
  .join("\n");

const used = (name) =>
  new RegExp(`(^|[^\\w-])${name.replace(/[-]/g, "\\-")}([^\\w-]|$)`, "m").test(
    code,
  ) || (BUILT[name] ? BUILT[name].test(code) : false);

describe("dead CSS (FE-29)", () => {
  it("has none of the leftovers the audit listed", () => {
    const pattern =
      /who_am_I|has-first-color|btn-portfolio|btn-about|wrap-icon|\.four|\.block\b|progress-bar|progress-value|animate-positive|section-title|service-section|fadeInUp|cortina__wrapper-menu|main__menu_ul|menu_right|color_pr|theme_toggler|text_2|Cinzel/;
    const hits = stylesheets().filter((file) => pattern.test(read(file)));
    expect(hits).toEqual([]);
  });

  it("deleted the theme toggler stylesheet nobody imported", () => {
    expect(existsSync(join(ROOT, "src/components/themetoggle/style.css"))).toBe(
      false,
    );
    expect(read("src/components/themetoggle/index.jsx")).not.toMatch(
      /style\.css/,
    );
  });

  it("uses every class and id selector in rendered markup", () => {
    const unused = [];
    for (const file of stylesheets()) {
      for (const rule of rules(read(file))) {
        const names = [
          ...rule.selector.matchAll(/[.#](-?[A-Za-z_][\w-]*)/g),
        ].map((match) => match[1]);
        for (const name of names) {
          if (!used(name)) unused.push(`${file}: ${name} (${rule.selector})`);
        }
      }
    }
    expect(unused).toEqual([]);
  });

  it("keeps every @keyframes in use", () => {
    const unused = [];
    for (const file of stylesheets()) {
      const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const [, name] of css.matchAll(/@keyframes\s+([\w-]+)/g)) {
        const uses = css.split(new RegExp(`\\b${name}\\b`)).length - 1;
        if (uses < 2) unused.push(`${file}: ${name}`);
      }
    }
    expect(unused).toEqual([]);
  });

  it("declares no property twice in one rule (the old .ac_btn ring layers)", () => {
    const doubled = [];
    for (const file of stylesheets()) {
      for (const rule of rules(read(file))) {
        const seen = new Set();
        for (const [prop] of rule.decls) {
          // Deliberate fallback pairs: 100vh then 100svh.
          if (seen.has(prop) && !/height$/.test(prop)) {
            doubled.push(`${file}: ${rule.selector} ${prop}`);
          }
          seen.add(prop);
        }
      }
    }
    expect(doubled).toEqual([]);
  });
});
