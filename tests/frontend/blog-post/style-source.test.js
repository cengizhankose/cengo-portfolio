// @vitest-environment node
// What src/pages/blog/style.css must keep (jsdom loads no stylesheet, so the
// rules that matter for layout shift are checked in the source):
//   PERF-16  the post container and so the skeleton are one screen high, the
//            skeleton only animates opacity and stops for reduced motion;
//   FE-34    the cover keeps its 1200x630 ratio;
//   no rule for the old loading placeholder is left behind.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(process.cwd(), "src/pages/blog/style.css"),
  "utf8",
);
const rule = (selector) => {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
};

describe("blog stylesheet", () => {
  it("the post container is at least one screen high (vh fallback, then svh)", () => {
    const block = rule(".blog-post-container");
    expect(block).toMatch(/min-height:\s*100vh;\s*min-height:\s*100svh;/);
  });

  it("the skeleton animates opacity only and is still for prefers-reduced-motion", () => {
    const keyframes = css.slice(css.indexOf("@keyframes blog-skeleton-pulse"));
    const body = keyframes.slice(0, keyframes.indexOf("@media"));
    expect(body).toMatch(/opacity/);
    expect(body).not.toMatch(/transform|width|height|margin|top|left/);
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion"));
    expect(reduced).toMatch(/\.blog-skeleton__bar\s*{\s*animation:\s*none;/);
  });

  it("covers keep the 1200x630 ratio", () => {
    expect(rule(".blog-post-cover")).toMatch(/aspect-ratio:\s*1200 \/ 630/);
  });

  it("the old loading placeholder is gone", () => {
    expect(css).not.toContain(".blog-loading");
  });

  it("uses theme tokens for the new blocks (no hard-coded colours)", () => {
    const newBlocks = css.slice(
      css.indexOf(".post-footer {"),
      css.indexOf("/* Markdown styling */"),
    );
    expect(newBlocks).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
  });
});
