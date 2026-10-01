// PERF-13 steps 2-3 / FE-17 step 2: src/app/App.module.css has one entry fade of at
// most 150 ms and no exit animation; reduced motion switches it off.
import { describe, expect, it } from "vitest";
import {
  animationMs,
  blockOf,
  read,
  ruleBody,
  stripComments,
} from "./support.js";

const CSS = read("src/app/App.module.css");
const CODE = stripComments(CSS);

function computedIn(className) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  const element = document.createElement("div");
  element.className = className;
  document.body.appendChild(element);
  const computed = getComputedStyle(element);
  const result = { animation: computed.animation };
  element.remove();
  style.remove();
  return result;
}

describe(".pageEnter (the entry fade)", () => {
  it("is one animation of at most 150 ms (computed style)", () => {
    const { animation } = computedIn("pageEnter");

    expect(animation).toContain("enter");
    expect(animationMs(animation)).toBeLessThanOrEqual(150);
    expect(animationMs(animation)).toBeGreaterThan(0);
  });

  it("uses a named keyframe rule from opacity 0 to opacity 1", () => {
    const frames = blockOf(CODE, "@keyframes enter");

    expect(frames).not.toBeNull();
    expect(frames).toMatch(/from\s*\{[^}]*opacity:\s*0/);
    expect(frames).toMatch(/to\s*\{[^}]*opacity:\s*1/);
  });

  it("holds the end state (fill-mode both), so nothing flashes at either end", () => {
    expect(ruleBody(CSS, ".pageEnter")).toMatch(/animation:[^;]*\bboth\b/);
  });

  it("is not applied to an element without the class (the landing page)", () => {
    expect(computedIn("").animation).not.toContain("enter");
  });
});

describe("reduced motion", () => {
  it("switches .pageEnter off, and nothing depends on it ending", () => {
    expect(
      ruleBody(CSS, ".pageEnter", "@media (prefers-reduced-motion: reduce)"),
    ).toMatch(/animation:\s*none/);
  });
});

describe("the exit animation and its gate are gone", () => {
  it.each([
    ["fadeOut", /fadeOut/],
    ["fadeIn", /fadeIn\b/],
    ["a 400 ms duration", /400ms/],
    [".page-transition", /page-transition/],
    [".is-initial", /is-initial/],
  ])("App.module.css has no %s", (_label, pattern) => {
    expect(CODE).not.toMatch(pattern);
  });

  it("has no rule that animates the page wrapper out", () => {
    expect(CODE).not.toMatch(/translateY\(-\d+px\)/);
  });
});

describe("the test helpers read the right scope", () => {
  it("top-level lookups do not see rules inside @media or @keyframes", () => {
    const css = `@media (x) { .a { color: red; } }\n.b { color: blue; }\n@keyframes k { from { opacity: 0; } }`;

    expect(ruleBody(css, ".a")).toBeNull();
    expect(ruleBody(css, ".b")).toBe("color: blue;");
    expect(ruleBody(css, ".a", "@media (x)")).toBe("color: red;");
  });
});
