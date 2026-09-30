// Helpers for tests/frontend/shell/** (W7-FE-route-shell). Not a test file.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..", "..");
export const read = (file) => readFileSync(join(ROOT, file), "utf8");

/** Source files under `dir` (repository-relative), JS/JSX/CSS/SCSS. */
export function sourceFiles(dir = "src") {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(jsx?|css|scss)$/.test(entry.name) ? [path] : [];
    },
  );
}

// Code without block comments and whole-line // comments.
export function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// The body of the first rule whose selector is exactly `selector`, inside
// `media` (an at-rule prelude) or at the top level when `media` is omitted.
export function ruleBody(css, selector, media) {
  const source = stripComments(css);
  const scope = media ? blockOf(source, media) : topLevel(source);
  if (scope === null) return null;
  const match = new RegExp(
    `(?:^|\\})\\s*${escape(selector)}\\s*\\{([^}]*)\\}`,
  ).exec(scope);
  return match ? match[1].trim() : null;
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Everything outside @-blocks (good enough for App.css: flat rules).
function topLevel(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] !== "@") {
      out += source[i];
      i += 1;
      continue;
    }
    const open = source.indexOf("{", i);
    const end = source.indexOf(";", i);
    if (end !== -1 && (open === -1 || end < open)) {
      i = end + 1;
      continue;
    }
    let depth = 1;
    i = open + 1;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth += 1;
      if (source[i] === "}") depth -= 1;
      i += 1;
    }
  }
  return out;
}

// The inside of the first `@media ...{ }` / `@keyframes name { }` block whose
// prelude contains `prelude`.
export function blockOf(source, prelude) {
  const start = source.indexOf(prelude);
  if (start === -1) return null;
  const open = source.indexOf("{", start);
  let depth = 1;
  let i = open + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    i += 1;
  }
  return source.slice(open + 1, i - 1);
}

/** The first time value of an `animation` shorthand, in milliseconds. */
export function animationMs(shorthand) {
  const match = /(\d*\.?\d+)(ms|s)\b/.exec(shorthand ?? "");
  if (!match) return null;
  return Number(match[1]) * (match[2] === "s" ? 1000 : 1);
}
