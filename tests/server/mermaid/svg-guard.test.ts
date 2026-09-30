// PERF-05 step 5: what may be stored in posts.diagrams. The guard verifies
// the sanitised SVG; every case here is something the page must never print.
import { describe, expect, test, setDefaultTimeout } from "bun:test";
import {
  assertSafeCss,
  assertStoredSvg,
  drawingCounts,
  MAX_SVG_BYTES,
  UnsafeSvgError,
} from "../../../scripts/lib/svg-guard";
import { realSvg, smallSvg } from "./support";

// Shared machines get loaded: the default 5 s per test is too tight for jsdom and PGlite.
setDefaultTimeout(30_000);

const ID = "m-0a1b2c3d-light";
const svg = (body: string, attrs = "") =>
  `<svg id="${ID}" xmlns="http://www.w3.org/2000/svg"${attrs}>${body}</svg>`;
const rejects = (value: string, id = ID) =>
  expect(() => assertStoredSvg(value, { id })).toThrow(UnsafeSvgError);

describe("what passes", () => {
  test("real Mermaid output (htmlLabels off)", () => {
    expect(() => assertStoredSvg(realSvg(ID), { id: ID })).not.toThrow();
  });

  test("a drawing with style, marker, path, text and fragment references", () => {
    expect(() => assertStoredSvg(smallSvg(ID), { id: ID })).not.toThrow();
    expect(() =>
      assertStoredSvg(
        svg(
          '<defs><linearGradient id="g"/></defs><rect style="fill:url(#g)" fill="url(\'#g\')"/>' +
            "<style>@media (min-width:1px){.a{fill:red}}@keyframes k{to{opacity:1}}</style>",
        ),
        { id: ID },
      ),
    ).not.toThrow();
  });
});

describe("shape", () => {
  test("must start with <svg", () => {
    rejects(`\n${svg("")}`);
    rejects(`<div>${svg("")}</div>`);
    rejects("");
  });

  test("exactly one root element", () => {
    rejects(`${svg("")}${svg("")}`);
    rejects(`${svg("")}<p>x</p>`);
  });

  test("the root id must be the one Mermaid was given", () => {
    rejects(svg(""), "m-ffffffff-light");
  });

  test("a size limit (200 KB)", () => {
    expect(MAX_SVG_BYTES).toBe(200 * 1024);
    rejects(svg(`<text>${"x".repeat(MAX_SVG_BYTES)}</text>`));
    expect(() =>
      assertStoredSvg(svg("<text>ok</text>"), { id: ID, maxBytes: 1000 }),
    ).not.toThrow();
    expect(() =>
      assertStoredSvg(svg("<text>ok</text>"), { id: ID, maxBytes: 10 }),
    ).toThrow(UnsafeSvgError);
  });
});

describe("elements that run, load or navigate", () => {
  const blocked: [string, string][] = [
    ["script", "<script>alert(1)</script>"],
    ["foreignObject", "<foreignObject><div>x</div></foreignObject>"],
    ["iframe", '<iframe src="https://evil.example"></iframe>'],
    ["object", '<object data="https://evil.example/x"></object>'],
    ["embed", '<embed src="https://evil.example/x">'],
    ["image", '<image href="https://evil.example/x.png"/>'],
    ["use", '<use href="#a"/>'],
    ["feImage", '<filter><feImage href="https://evil.example/x"/></filter>'],
    ["a", '<a href="https://evil.example"><text>x</text></a>'],
    ["animate", '<rect><animate attributeName="x" to="1"/></rect>'],
    [
      "set",
      '<rect><set attributeName="href" to="javascript:alert(1)"/></rect>',
    ],
    ["link", '<link rel="stylesheet" href="https://evil.example/x.css">'],
    [
      "meta",
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
    ],
  ];
  for (const [name, body] of blocked) {
    test(`<${name}>`, () => rejects(svg(body)));
  }
});

describe("attributes", () => {
  test("event handlers", () => {
    rejects(svg('<g onclick="x()"/>'));
    rejects(svg('<rect onload="x()"/>'));
    rejects(svg('<text onmouseover="x()">t</text>'));
  });

  test("URL attributes must be a #fragment", () => {
    rejects(svg('<g href="https://evil.example"/>'));
    rejects(svg('<g xlink:href="https://evil.example"/>'));
    rejects(svg('<g href="data:text/html,x"/>'));
    rejects(svg('<g src="x.png"/>'));
  });

  test("javascript: and data: values anywhere", () => {
    rejects(svg('<g data-x="javascript:alert(1)"/>'));
    rejects(svg('<g title="  JavaScript:alert(1)"/>'));
    rejects(svg('<g aria-label="data:text/html,x"/>'));
  });

  test("url() in a style attribute points inside the document only", () => {
    rejects(svg('<rect style="fill:url(https://evil.example/x)"/>'));
    rejects(svg('<rect fill="url(https://evil.example/x)"/>'));
    rejects(svg("<rect style=\"background:url('//evil.example/x')\"/>"));
  });

  test("a style attribute may not carry image-set() or an @import-like call", () => {
    rejects(
      svg("<rect style=\"background:image-set('https://x/a.png' 1x)\"/>"),
    );
  });
});

describe("<style> blocks (the gaps sanitizeSvg leaves)", () => {
  const css = (text: string) => svg(`<style>${text}</style>`);

  test("CSS escapes can hide a URL or a keyword: no backslash at all", () => {
    rejects(css(".a{background:u\\72l(https://evil.example/x)}"));
    rejects(css("@\\69mport 'https://evil.example/x.css';"));
    rejects(css(".a{content:'\\'}"));
  });

  test("@import and every other at-rule except keyframes, media, supports, layer", () => {
    rejects(css('@import url("https://evil.example/x.css");'));
    rejects(css("@import 'x.css';"));
    rejects(css("@namespace svg url(http://www.w3.org/2000/svg);"));
    rejects(css("@font-face{font-family:x;src:url(#a)}"));
    rejects(css("@charset 'utf-8';"));
  });

  test("functions that fetch without url()", () => {
    rejects(css(".a{background:image-set('https://x/a.png' 1x)}"));
    rejects(css(".a{background:-webkit-image-set('https://x/a.png' 1x)}"));
    rejects(css(".a{background:image('https://x/a.png')}"));
    rejects(css(".a{background:cross-fade(url(#a), url(#b), 50%)}"));
    rejects(css(".a{background:element(#x)}"));
    rejects(css(".a{width:expression(alert(1))}"));
  });

  test("url() to anything but a #fragment", () => {
    rejects(css(".a{fill:url(https://evil.example/x)}"));
    rejects(css('.a{fill:url("//evil.example/x")}'));
    rejects(css(".a{fill:url(data:image/svg+xml;base64,AAAA)}"));
    expect(() =>
      assertStoredSvg(css(".a{fill:url(#ok)}"), { id: ID }),
    ).not.toThrow();
  });

  test("scriptable CSS", () => {
    rejects(css(".a{behavior:url(#x)}"));
    rejects(css(".a{-moz-binding:url(#x)}"));
    rejects(css(".a{background:javascript:alert(1)}"));
  });

  test("assertSafeCss on its own", () => {
    expect(() =>
      assertSafeCss("#x .a{fill:#fff;stroke-width:1px}"),
    ).not.toThrow();
    expect(() => assertSafeCss("@keyframes a{from{x:0}}")).not.toThrow();
    expect(() =>
      assertSafeCss("@-webkit-keyframes a{from{x:0}}"),
    ).not.toThrow();
    expect(() => assertSafeCss("a{b:\\75}")).toThrow(UnsafeSvgError);
  });
});

describe("the errors", () => {
  test("name the problem and never print the SVG", () => {
    try {
      assertStoredSvg(svg('<g onclick="secret-marker()"/>'), { id: ID });
      throw new Error("did not throw");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafeSvgError);
      expect((error as Error).message).toContain("event handler");
      expect((error as Error).message).not.toContain("secret-marker");
    }
  });
});

describe("drawingCounts", () => {
  test("counts the parts a sanitiser must not lose", () => {
    expect(drawingCounts(smallSvg(ID))).toEqual({
      text: 1,
      style: 1,
      path: 2,
      marker: 1,
      foreignObject: 0,
    });
    expect(
      drawingCounts(svg("<FOREIGNOBJECT/><foreignObject/>")).foreignObject,
    ).toBe(2);
  });
});
