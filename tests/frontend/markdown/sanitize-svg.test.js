// SEC-03 / T-05 stage B groundwork: sanitizeSvg(svg), DOMPurify's SVG profile
// for pre-rendered Mermaid diagrams (PERF-05 stores and prints them).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  createSvgSanitizer,
  isSafeCss,
  sanitizeSvg,
} from "../../../src/lib/markdown/sanitizeSvg.js";

// The audit's input: a script, a handler, HTML inside foreignObject, a style
// block and a plain label.
const AUDIT_INPUT =
  '<svg><script>alert(1)</script><rect onload="x()"/><foreignObject><div>h</div></foreignObject><style>.a{}</style><text>t</text></svg>';

// Shaped like what Mermaid writes for a flowchart rendered with
// htmlLabels: false (scoped <style>, marker defs, nodes with <text>).
const DIAGRAM =
  '<svg id="mermaid-x-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" width="120" height="60" role="graphics-document document" aria-roledescription="flowchart-v2" style="background-color: transparent;">' +
  "<style>#mermaid-x-1{font-family:Raleway,sans-serif;font-size:16px;fill:#fff;}#mermaid-x-1 .node rect{fill:#1f1f1f;stroke:#a3a3a3;}#mermaid-x-1 .arrowMarkerPath{fill:url(#grad);}</style>" +
  '<g><defs><marker id="mermaid-x-1_arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowMarkerPath"/></marker><linearGradient id="grad"><stop offset="0" stop-color="#fff"/></linearGradient></defs>' +
  '<g class="nodes"><g class="node default" transform="translate(40, 20)"><rect class="basic label-container" x="-30" y="-15" width="60" height="30"/><g class="label" transform="translate(-10, -8)"><text y="0" dy="1em" text-anchor="middle"><tspan>A</tspan></text></g></g></g>' +
  '<path d="M70,20L100,20" class="flowchart-link" marker-end="url(#mermaid-x-1_arrow)"/></g></svg>';

// Real Mermaid 12 output for the same flowchart, drawn in Chrome with the
// site's dark tokens (src/lib/mermaidTheme.js): once with htmlLabels: false
// (what the publish script will use, PERF-05) and once with the default HTML
// labels (what <Mermaid> draws in the browser today).
const fixture = (name) =>
  readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
const SVG_LABELS = fixture("mermaid-flowchart-svg-labels.svg");
const HTML_LABELS = fixture("mermaid-flowchart-html-labels.svg");

const lower = (text) => text.toLowerCase();

describe("sanitizeSvg (audit criterion)", () => {
  const output = sanitizeSvg(AUDIT_INPUT);

  it("removes the script, the handler and foreignObject", () => {
    expect(lower(output)).not.toContain("<script");
    expect(lower(output)).not.toContain("onload");
    expect(lower(output)).not.toContain("foreignobject");
    expect(output).not.toContain("alert(1)");
    expect(output).not.toContain("<div");
  });

  it("keeps <style> and <text>", () => {
    expect(output).toContain("<style");
    expect(output).toContain("<text");
    expect(output).toContain(">t</text>");
  });

  it("returns the same string when sanitized again", () => {
    expect(sanitizeSvg(output)).toBe(output);
  });
});

describe("sanitizeSvg keeps what a diagram needs", () => {
  const output = sanitizeSvg(DIAGRAM);

  it("keeps the structure, classes, transforms, markers and ARIA", () => {
    for (const fragment of [
      'viewBox="0 0 120 60"',
      'role="graphics-document document"',
      'aria-roledescription="flowchart-v2"',
      'class="node default"',
      'transform="translate(40, 20)"',
      'marker-end="url(#mermaid-x-1_arrow)"',
      "<marker",
      "<linearGradient",
      "<tspan>A</tspan>",
      'text-anchor="middle"',
    ]) {
      expect(output, fragment).toContain(fragment);
    }
  });

  it("keeps the scoped <style> block, including a same-document url(#id)", () => {
    expect(output).toContain("#mermaid-x-1 .node rect{fill:#1f1f1f");
    expect(output).toContain("url(#grad)");
  });
});

describe("sanitizeSvg on real Mermaid output", () => {
  it("leaves a diagram with SVG labels (htmlLabels: false) as it was", () => {
    const output = sanitizeSvg(SVG_LABELS);
    const root = new JSDOM(output).window.document.querySelector("svg");
    const original = new JSDOM(SVG_LABELS).window.document.querySelector("svg");
    const texts = (svg) =>
      [...svg.querySelectorAll("text")].map((node) => node.textContent.trim());
    expect(texts(root).filter(Boolean)).toEqual([
      "yes",
      "Hook",
      "Spool",
      "Worker",
      "Extraction",
    ]);
    expect(texts(root)).toEqual(texts(original));
    for (const selector of [
      "style",
      "marker",
      "g.node",
      "path.flowchart-link",
      "g.edgeLabel",
    ]) {
      expect(root.querySelectorAll(selector).length, selector).toBe(
        original.querySelectorAll(selector).length,
      );
      expect(root.querySelectorAll(selector).length, selector).toBeGreaterThan(
        0,
      );
    }
    for (const attribute of [
      "id",
      "viewBox",
      "width",
      "height",
      "role",
      "aria-roledescription",
    ]) {
      expect(root.getAttribute(attribute), attribute).toBe(
        original.getAttribute(attribute),
      );
    }
    // The whole markup, character for character (style block included).
    expect(output.length).toBe(SVG_LABELS.length);
  });

  it("loses the labels of a diagram with HTML labels: the publish script must use htmlLabels: false", () => {
    expect(HTML_LABELS).toMatch(/foreignObject/);
    const output = sanitizeSvg(HTML_LABELS);
    expect(lower(output)).not.toContain("foreignobject");
    expect(output).not.toContain("Hook");
  });
});

describe("sanitizeSvg removes what must not reach the page", () => {
  it.each([
    [
      "an event handler",
      '<svg><rect onclick="x()" onmouseover="y()"/></svg>',
      /onclick|onmouseover/i,
    ],
    [
      "a javascript: link",
      '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',
      /javascript:/i,
    ],
    [
      "an xlink javascript: link",
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
      /javascript:/i,
    ],
    [
      "an external image",
      '<svg><image href="https://evil.example/t.png"/></svg>',
      /<image|evil\.example/i,
    ],
    [
      "a <use> reference",
      '<svg><use href="https://evil.example/s.svg#a"/></svg>',
      /<use|evil\.example/i,
    ],
    [
      "SMIL animation of an attribute",
      '<svg><a><animate attributeName="href" values="javascript:alert(1)"/><text>x</text></a></svg>',
      /<animate|javascript:/i,
    ],
    [
      "a <set> element",
      '<svg><a><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>',
      /<set|javascript:/i,
    ],
    [
      "HTML elements",
      '<svg><text>x</text></svg><iframe src="https://evil.example"></iframe><img src=x onerror=alert(1)>',
      /<iframe|<img|onerror/i,
    ],
    [
      "a <script> in a nested group",
      "<svg><g><g><script>alert(1)</script></g></g></svg>",
      /<script|alert/i,
    ],
  ])("%s", (_name, input, forbidden) => {
    expect(sanitizeSvg(input)).not.toMatch(forbidden);
  });

  it("drops a <style> that loads something, keeps the rest of the SVG", () => {
    for (const css of [
      "@import url(https://evil.example/a.css);",
      ".a{background:url(https://evil.example/t.png)}",
      ".a{background:url('//evil.example/t.png')}",
      ".a{width:expression(alert(1))}",
      ".a{behavior:url(#default#time2)}",
      ".a{background:url(javascript:alert(1))}",
    ]) {
      const output = sanitizeSvg(
        `<svg><style>${css}</style><text>t</text></svg>`,
      );
      expect(output, css).not.toContain("<style");
      expect(output, css).toContain("<text");
    }
  });

  it("returns an empty string for empty or non-string input", () => {
    expect(sanitizeSvg("")).toBe("");
    expect(sanitizeSvg("   ")).toBe("");
    expect(sanitizeSvg(undefined)).toBe("");
    expect(sanitizeSvg(null)).toBe("");
    expect(sanitizeSvg(42)).toBe("");
  });
});

describe("isSafeCss", () => {
  it("accepts Mermaid-style rules and same-document references", () => {
    expect(
      isSafeCss("#a .node rect{fill:#fff}@keyframes x{from{opacity:0}}"),
    ).toBe(true);
    expect(isSafeCss("#a{fill:url(#g)} #b{fill:url( '#g' )}")).toBe(true);
  });

  it("rejects external loads and script-ish values", () => {
    for (const css of [
      "@import 'x.css';",
      "a{background:url(x.png)}",
      "a{background:url(data:image/png;base64,AAAA)}",
      "a{width:expression(1)}",
      "a{background:url(javascript:1)}",
    ]) {
      expect(isSafeCss(css), css).toBe(false);
    }
  });
});

describe("createSvgSanitizer (publish scripts have no global window)", () => {
  it("works with a jsdom window and agrees with the browser-side result", () => {
    const { window } = new JSDOM("");
    const sanitize = createSvgSanitizer(window);
    expect(sanitize(AUDIT_INPUT)).toBe(sanitizeSvg(AUDIT_INPUT));
    expect(sanitize(DIAGRAM)).toBe(sanitizeSvg(DIAGRAM));
    window.close();
  });

  it("fails closed when there is no DOM", () => {
    expect(() => createSvgSanitizer({})).toThrow(/needs a DOM/);
  });
});
