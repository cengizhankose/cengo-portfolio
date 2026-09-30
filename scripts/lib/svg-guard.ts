// PERF-05 / T-05 stage B: the last check before a pre-rendered SVG is stored
// in posts.diagrams, and the only thing standing between the publish machine
// and a page that prints the string with dangerouslySetInnerHTML.
//
// Order in renderMermaid(): Mermaid draws (securityLevel "strict", labels as
// SVG <text>), sanitizeSvg() (DOMPurify SVG profile) cleans, then this guard
// *verifies* the result and throws instead of repairing. It closes the gaps
// that sanitizeSvg leaves (W6 review): a <style> that hides a url() behind CSS
// escapes, image-set()/image() that load a URL without url(), an inline
// style="...url(https://...)", <feImage href>. Nothing a diagram legitimately
// needs is refused: Mermaid's own output passes (tests/server/mermaid).
//
// The rule for everything that can reach outside the document is the same:
// only a same-document "#fragment" is allowed (marker-end="url(#m-..-arrow)",
// a gradient). Nothing here opens a network connection or needs a DOM other
// than jsdom's parser.
import { JSDOM } from "jsdom";

/** A stored SVG is about 10 to 20 KB; past this something other than a diagram was drawn. */
export const MAX_SVG_BYTES = 200 * 1024;

export class UnsafeSvgError extends Error {
  override name = "UnsafeSvgError";
}

// Elements that run, load or navigate. sanitizeSvg() already removes most of
// them; naming them here keeps the guard correct on its own.
const BLOCKED_TAGS =
  /^(?:script|foreignobject|iframe|object|embed|image|use|feimage|a|link|meta|base|form|input|button|audio|video|source|mpath|animate\w*|set|handler|listener)$/;

// Attributes whose value is a URL: only "#fragment" may be there.
const URL_ATTRIBUTES = new Set([
  "href",
  "xlink:href",
  "src",
  "action",
  "formaction",
  "data",
  "poster",
  "background",
]);

// CSS at-rules Mermaid's <style> uses; @import, @namespace, @font-face ... are not among them.
const ALLOWED_AT_RULES = /^(?:-[a-z]+-)?keyframes$|^(?:media|supports|layer)$/;
// CSS functions that fetch a URL, with or without url().
const CSS_FETCHING_FUNCTIONS =
  /(?:^|[^\w-])(?:-webkit-)?(?:image-set|image|cross-fade|element|src)\s*\(|expression\s*\(/i;

let shared: JSDOM | null = null;

const isFragmentReference = (value: string) =>
  value.trim().replace(/^["']/, "").trim().startsWith("#");

function assertFragmentUrls(text: string, where: string) {
  for (const match of text.matchAll(/url\(([^)]*)\)/gi)) {
    if (!isFragmentReference(match[1])) {
      throw new UnsafeSvgError(`${where}: url() points outside the document`);
    }
  }
}

/** Throws when a <style> body can load or run anything outside the page. */
export function assertSafeCss(css: string, where = "<style>"): void {
  if (css.includes("\\")) {
    throw new UnsafeSvgError(
      `${where}: a backslash (CSS escape) can hide a URL or a keyword`,
    );
  }
  for (const match of css.matchAll(/@([\w-]+)/g)) {
    if (!ALLOWED_AT_RULES.test(match[1].toLowerCase())) {
      throw new UnsafeSvgError(`${where}: @${match[1]} is not allowed`);
    }
  }
  if (CSS_FETCHING_FUNCTIONS.test(css)) {
    throw new UnsafeSvgError(`${where}: a CSS function that loads a URL`);
  }
  if (/javascript:|-moz-binding|behavior\s*:/i.test(css)) {
    throw new UnsafeSvgError(`${where}: scriptable CSS`);
  }
  assertFragmentUrls(css, where);
}

export interface GuardOptions {
  /** The id Mermaid was given (`-I`); the root <svg> must carry it. */
  id: string;
  maxBytes?: number;
}

/**
 * Verifies a sanitised SVG string before it is stored. Throws UnsafeSvgError
 * naming the first problem (never the SVG itself); returns nothing.
 */
export function assertStoredSvg(svg: string, options: GuardOptions): void {
  const { id, maxBytes = MAX_SVG_BYTES } = options;
  if (typeof svg !== "string" || !svg.startsWith("<svg")) {
    throw new UnsafeSvgError("the sanitised output does not start with <svg");
  }
  const bytes = Buffer.byteLength(svg, "utf8");
  if (bytes > maxBytes) {
    throw new UnsafeSvgError(
      `the SVG is ${bytes} bytes, more than the ${maxBytes} allowed`,
    );
  }

  shared ??= new JSDOM("");
  const { document } = shared.window;
  const holder = document.createElement("div");
  holder.innerHTML = svg;

  const root = holder.firstElementChild;
  if (
    !root ||
    root.tagName.toLowerCase() !== "svg" ||
    holder.children.length !== 1
  ) {
    throw new UnsafeSvgError("the output is not exactly one <svg> element");
  }
  if (root.getAttribute("id") !== id) {
    throw new UnsafeSvgError(
      `the root <svg> id is "${root.getAttribute("id")}", expected "${id}" ` +
        "(ids must be unique per diagram and theme)",
    );
  }

  for (const element of holder.querySelectorAll("*")) {
    const tag = element.tagName.toLowerCase();
    if (BLOCKED_TAGS.test(tag)) {
      throw new UnsafeSvgError(`<${tag}> is not allowed in a stored diagram`);
    }
    if (tag === "style") {
      assertSafeCss(element.textContent ?? "");
    }
    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name.startsWith("on")) {
        throw new UnsafeSvgError(`<${tag}> has an event handler (${name})`);
      }
      if (URL_ATTRIBUTES.has(name) && !isFragmentReference(value)) {
        throw new UnsafeSvgError(`<${tag} ${name}> is not a #fragment`);
      }
      if (/^\s*(?:javascript|vbscript|data):/i.test(value)) {
        throw new UnsafeSvgError(`<${tag} ${name}> holds a script or data URL`);
      }
      if (name === "style") {
        assertSafeCss(value, `<${tag} style>`);
      } else if (/url\(/i.test(value)) {
        assertFragmentUrls(value, `<${tag} ${name}>`);
      }
    }
  }
}

/** Counts of the elements sanitising must never remove from a Mermaid drawing. */
export function drawingCounts(svg: string) {
  const count = (pattern: RegExp) => (svg.match(pattern) ?? []).length;
  return {
    text: count(/<text\b/g),
    style: count(/<style\b/g),
    path: count(/<path\b/g),
    marker: count(/<marker\b/g),
    foreignObject: count(/<foreignObject\b/gi),
  };
}
