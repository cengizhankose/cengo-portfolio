// Shared helpers for the Bootstrap subset tests (PERF-09, FE-21).
// Works in both Vitest environments (node and jsdom): sass-embedded runs in
// either, vite.config.js is only imported by the node-environment file.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileAsync } from "sass-embedded";

// A string, not new URL(): under jsdom the global URL is jsdom's.
export const ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
export const SUBSET = join(ROOT, "src/styles/bootstrap-subset.scss");
export const read = (file) => readFileSync(join(ROOT, file), "utf8");

// Compiles the subset the way the production build does (Vite resolves the
// bare "bootstrap/scss/..." imports from node_modules). Deprecation options
// only change what is logged, never the CSS; pass the vite.config.js ones to
// check the log.
export async function compileSubset(options = {}) {
  const warnings = [];
  const result = await compileAsync(SUBSET, {
    loadPaths: [join(ROOT, "node_modules")],
    style: "compressed",
    ...options,
    logger: {
      warn(message, { deprecation, deprecationType }) {
        warnings.push({ message, deprecation, id: deprecationType?.id });
      },
      debug() {},
    },
  });
  return { css: result.css, warnings };
}

// Class names that appear in selectors (declaration blocks removed first, so
// values such as ".5rem" or data URIs never count).
export function classSelectors(css) {
  const selectorsOnly = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{[^{}]*\}/g, "{}");
  const names = new Set();
  for (const match of selectorsOnly.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
    names.add(match[1]);
  }
  return names;
}

// Every class the full Bootstrap 5.3 build defines: a class in the markup that
// is in this set but not in the subset is a Bootstrap class the subset lost.
export function fullBootstrapClasses() {
  return classSelectors(read("node_modules/bootstrap/dist/css/bootstrap.css"));
}

// Repo-relative paths of the files under `dir` whose name matches `pattern`.
export function filesUnder(dir, pattern) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) {
      out.push(...filesUnder(rel, pattern));
    } else if (pattern.test(name)) out.push(rel);
  }
  return out;
}

// Class names that the site's own stylesheets define (src/**/*.css), e.g. the
// local .navbar-brand rule.
export function localClasses() {
  return classSelectors(
    filesUnder("src", /\.css$/)
      .map((file) => read(file))
      .join("\n"),
  );
}

// The string content of a `className` value: a quoted literal, or every
// string/template literal inside a {...} expression (template ${} parts
// dropped). Also covers `el.className = "..."` assignments.
function classNameValues(source) {
  const values = [];
  for (const match of source.matchAll(/className\s*=\s*/g)) {
    let i = match.index + match[0].length;
    const open = source[i];
    if (open === '"' || open === "'") {
      const end = source.indexOf(open, i + 1);
      values.push(source.slice(i + 1, end));
      continue;
    }
    if (open !== "{") continue;
    let depth = 0;
    const start = i;
    for (; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}" && --depth === 0) break;
    }
    const expression = source.slice(start + 1, i).replace(/\$\{[^}]*\}/g, " ");
    for (const literal of expression.matchAll(
      /(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g,
    )) {
      values.push(literal[2]);
    }
  }
  return values;
}

// Class tokens named in className values anywhere under src/, with the file
// that uses them.
export function sourceClassNames() {
  const used = new Map();
  for (const file of filesUnder("src", /\.(jsx?|tsx?)$/)) {
    for (const value of classNameValues(read(file))) {
      for (const token of value.split(/\s+/).filter(Boolean)) {
        if (!used.has(token)) used.set(token, file);
      }
    }
  }
  return used;
}
