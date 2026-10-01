// The site's global stylesheet as text (FE-20): src/index.css only @imports
// src/styles/tokens.css (custom properties) and src/styles/base.css (element
// defaults), so tests that check a token or a base rule read the two files
// together, the way the browser sees them. jsdom loads no CSS: these are
// source checks.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (file) => readFileSync(join(ROOT, file), "utf8");

export const TOKENS_CSS = read("src/styles/tokens.css");
export const BASE_CSS = read("src/styles/base.css");

/** tokens.css and base.css, joined (each rule still starts on its own line). */
export const GLOBAL_CSS = `\n${TOKENS_CSS}\n${BASE_CSS}\n`;
