// Helpers for tests/frontend/css/** (W9-DSG-typography-css-cleanup): the
// repository's stylesheets as text, and a small reader that turns a
// stylesheet into flat rules ({ selector, decls, at }) at any depth, so the
// tests can check declarations without a CSS library. jsdom loads no CSS, so
// these are source checks; the computed criteria were measured in headless
// Chrome (see the package report).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..", "..");
export const read = (file) => readFileSync(join(ROOT, file), "utf8");

/** Every file under `dir` (repository-relative paths). */
export function filesUnder(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      return entry.isDirectory() ? filesUnder(path) : [path];
    },
  );
}

/** src/**\/*.css, without the generated @font-face file. */
export const stylesheets = () =>
  filesUnder("src")
    .filter((file) => file.endsWith(".css"))
    .filter((file) => file !== "src/styles/fonts.css")
    .sort();

export const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function parseDecls(body) {
  const decls = [];
  for (const part of body.split(";")) {
    const decl = part.trim();
    if (!decl) continue;
    const colon = decl.indexOf(":");
    decls.push([
      decl.slice(0, colon).trim(),
      decl
        .slice(colon + 1)
        .replace(/\s+/g, " ")
        .trim(),
    ]);
  }
  return decls;
}

/**
 * Every style rule of `css` as { selector, selectors, decls, props, at }:
 * `at` lists the enclosing at-rules ("@media (...)", "@supports (...)"),
 * `props` merges the declarations (later ones win). Keyframe steps are
 * skipped.
 */
export function rules(css) {
  const out = [];
  const walk = (text, at) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open === -1) break;
      const head = text.slice(i, open).trim().replace(/\s+/g, " ");
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth += 1;
        if (text[j] === "}") depth -= 1;
        j += 1;
      }
      const inner = text.slice(open + 1, j - 1);
      if (head.startsWith("@keyframes") || head.startsWith("@-webkit-keyframes")) {
        // steps are not style rules
      } else if (head.startsWith("@")) {
        walk(inner, [...at, head]);
      } else {
        const decls = parseDecls(inner);
        out.push({
          selector: head,
          selectors: head.split(",").map((s) => s.trim()),
          decls,
          props: Object.fromEntries(decls),
          at,
        });
      }
      i = j;
    }
  };
  walk(stripComments(css), []);
  return out;
}

/**
 * Merged declarations of the rules whose selector list contains `selector`,
 * at the top level (no `at`) or inside exactly the at-rule chain `at`.
 */
export function declared(css, selector, at = []) {
  const merged = {};
  for (const rule of rules(css)) {
    if (!rule.selectors.includes(selector)) continue;
    if (rule.at.join(" | ") !== at.join(" | ")) continue;
    Object.assign(merged, rule.props);
  }
  return merged;
}

/** [file, property, value, selector] for every declaration in src CSS. */
export function allDeclarations() {
  return stylesheets().flatMap((file) =>
    rules(read(file)).flatMap((rule) =>
      rule.decls.map(([prop, value]) => [file, prop, value, rule.selector]),
    ),
  );
}
