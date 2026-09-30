// SEC-03 / T-05 (stage B): sanitizeSvg(svg) -> string
//
// A pre-rendered Mermaid diagram (PERF-05) is stored in its own field, never
// inside the markdown body, and is cleaned with DOMPurify's SVG profile
// before it is stored (publish script) and again before <Mermaid> prints it
// (defence in depth). Only <Mermaid> may put the result into the DOM
// (dangerouslySetInnerHTML), and only this function's output.
//
// What goes:
//  - everything outside the SVG profile: <script>, event-handler attributes
//    (onload, ...), javascript: URLs, HTML elements;
//  - <foreignObject>: the publish script renders with htmlLabels: false, so
//    labels are plain <text> and no HTML lives inside the SVG;
//  - elements that load something or animate attributes (<image>, <use>,
//    SMIL <animate*>/<set>), which the profile would keep;
//  - a <style> block that reaches outside the document (@import, any url()
//    that is not a same-document #fragment, expression(), javascript:).
// <style> itself stays: Mermaid writes its whole theme into one.
//
// DOMPurify needs a DOM. The browser (and Vitest's jsdom) uses the global
// window; the publish CLI has none and passes a jsdom window to
// createSvgSanitizer. Without any DOM it throws instead of returning the
// input unchanged (fail closed).
//
// Each sanitizer is its own DOMPurify instance so nothing here touches the
// shared instance that Mermaid uses for securityLevel "strict".
import DOMPurify from "dompurify";

export const SVG_PURIFY_CONFIG = Object.freeze({
  USE_PROFILES: Object.freeze({ svg: true, svgFilters: true }),
  // Mermaid marks its root role="graphics-document document"; the profile
  // keeps aria-* but not role, and role cannot run anything.
  ADD_ATTR: Object.freeze(["role"]),
  FORBID_TAGS: Object.freeze([
    "foreignobject",
    "image",
    "use",
    "animate",
    "animatecolor",
    "animatemotion",
    "animatetransform",
    "set",
  ]),
});

const UNSAFE_CSS =
  /@import|expression\s*\(|javascript:|-moz-binding|behavior\s*:/i;

/** True when a <style> body cannot load or run anything outside the page. */
export function isSafeCss(css) {
  if (UNSAFE_CSS.test(css)) return false;
  for (const match of css.matchAll(/url\(([^)]*)\)/gi)) {
    const target = match[1].trim().replace(/^["']/, "").trim();
    if (!target.startsWith("#")) return false;
  }
  return true;
}

/**
 * Returns sanitizeSvg bound to a window: `createSvgSanitizer(window)` in a
 * browser, `createSvgSanitizer(new JSDOM("").window)` in a script.
 */
export function createSvgSanitizer(win) {
  const purify = DOMPurify(win);
  if (!purify.isSupported) {
    throw new Error("sanitizeSvg needs a DOM: pass a window (e.g. from jsdom)");
  }
  const { document } = win;
  return function sanitize(svg) {
    if (typeof svg !== "string" || svg.trim() === "") return "";
    const fragment = purify.sanitize(svg, {
      ...SVG_PURIFY_CONFIG,
      RETURN_DOM_FRAGMENT: true,
    });
    for (const style of [...fragment.querySelectorAll("style")]) {
      if (!isSafeCss(style.textContent ?? "")) style.remove();
    }
    const holder = document.createElement("div");
    holder.append(fragment);
    return holder.innerHTML;
  };
}

let shared = null;

/** Sanitizes an SVG string with the global window's DOM. */
export function sanitizeSvg(svg) {
  shared ??= createSvgSanitizer(globalThis.window);
  return shared(svg);
}

export default sanitizeSvg;
