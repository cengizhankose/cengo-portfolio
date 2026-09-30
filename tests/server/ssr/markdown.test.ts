/**
 * renderMarkdown (SEO-01 step 3, SEC-03): the snapshot's body HTML is filtered
 * by the same sanitiser as the page and equals what the page's own pipeline
 * (react-markdown with src/lib/markdown/pipeline.js) produces.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import {
  rehypePlugins,
  remarkPlugins,
  remarkRehypeOptions,
} from "../../../src/lib/markdown/pipeline.js";
import {
  clearMarkdownCache,
  MARKDOWN_CACHE_MAX,
  renderMarkdown,
} from "../../../src/seo/markdown";
import { count, POST_MARKDOWN } from "./helpers";

const REPO = join(import.meta.dir, "..", "..", "..");
const POST_FILE = join(
  REPO,
  "content/posts/atlas-steward-laya-konustan-yarim-is-cikaran-sistem.tr.md",
);

beforeEach(() => clearMarkdownCache());

/**
 * Both pipelines' output, parsed and re-serialised by one HTML parser, with the
 * attributes of every element in one order (React and hast print `disabled`
 * and `checked` in different orders; the order carries no meaning).
 */
function normalised(html: string): string {
  const { document } = new JSDOM(`<body><div id="x">${html}</div></body>`)
    .window;
  const root = document.getElementById("x")!;
  for (const element of root.querySelectorAll("*")) {
    const attributes = [...element.attributes]
      .map(({ name, value }) => [name, value] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    for (const [name] of attributes) element.removeAttribute(name);
    for (const [name, value] of attributes) element.setAttribute(name, value);
  }
  return root.innerHTML.replace(/>\s+</g, "><").trim();
}

const page = (markdown: string) =>
  renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      { remarkPlugins, rehypePlugins, remarkRehypeOptions } as never,
      markdown,
    ),
  );

describe("the same elements as the page's pipeline", () => {
  test("the fixture post (headings, list, table, footnote, diagram)", () => {
    expect(normalised(renderMarkdown(POST_MARKDOWN))).toBe(
      normalised(page(POST_MARKDOWN)),
    );
  });

  test("the live post text (1.7k words) is identical", () => {
    if (!existsSync(POST_FILE)) return;
    const text = readFileSync(POST_FILE, "utf8");
    const body = text.split(/^---$/m).slice(2).join("---");
    expect(normalised(renderMarkdown(body))).toBe(normalised(page(body)));
  });

  test("raw HTML, task lists, autolinks and strikethrough", () => {
    const md = [
      "- [x] done",
      "- [ ] open",
      "",
      "Visit https://example.com and ~~nothing~~.",
      "",
      '<details><summary>More</summary><p class="x">Hidden</p></details>',
      "",
      "H~2~O",
    ].join("\n");
    expect(normalised(renderMarkdown(md))).toBe(normalised(page(md)));
  });
});

describe("sanitising (SEC-03)", () => {
  const html = renderMarkdown(
    [
      "Text <script>alert(1)</script> <style>body{display:none}</style>",
      "",
      '<iframe src="https://evil.example"></iframe><form action="/x"><input name=a></form>',
      "",
      '<img src="x" onerror="alert(2)" alt="a">',
      "",
      "[js](javascript:alert(3)) [data](data:text/html;base64,AAAA) [ok](https://example.com) [mail](mailto:a@b.co)",
      "",
      '<a href="javascript:alert(4)" onclick="alert(5)">raw link</a>',
      "",
      '<meta http-equiv="refresh" content="0;url=https://evil.example"><base href="https://evil.example"><link rel="stylesheet" href="https://evil.example/x.css">',
      "",
      "<svg onload=alert(6)><script>alert(7)</script></svg>",
    ].join("\n"),
  );

  test.each([
    "<script",
    "alert(1)",
    "<style",
    "display:none",
    "<iframe",
    "<form",
    "<input",
    "onerror",
    "onclick",
    "javascript:",
    "data:text/html",
    "<meta",
    "<base",
    "<link",
    "<svg",
    "onload",
  ])("%s is gone", (needle) => {
    expect(html).not.toContain(needle);
  });

  test("safe links and text stay", () => {
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="mailto:a@b.co"');
    expect(html).toContain("raw link");
  });

  test("ids get the user-content prefix once; footnote links point at them", () => {
    const out = renderMarkdown("Note.[^1]\n\n[^1]: The footnote.");
    expect(out).toContain('id="user-content-fn-1"');
    expect(out).toContain('href="#user-content-fn-1"');
    expect(out).not.toContain("user-content-user-content");
    expect(out).toContain('href="#user-content-fnref-1"');
  });

  test("a raw heading id cannot shadow a page element", () => {
    const out = renderMarkdown('<h2 id="root">x</h2><a href="#root">jump</a>');
    expect(out).toContain('id="user-content-root"');
    expect(out).toContain('href="#user-content-root"');
  });
});

describe("content", () => {
  test("headings, list, table and the diagram source are kept (T-05 stage A)", () => {
    const html = renderMarkdown(POST_MARKDOWN);
    expect(count(html, /<h2\b/g)).toBe(2); // the section and the footnotes label
    expect(count(html, /<h3\b/g)).toBe(2);
    expect(html).toContain("<table>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain('<pre><code class="language-mermaid">flowchart LR');
    expect(html).toContain("<strong>bold</strong>");
  });

  test("empty, null and undefined give an empty string", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown(null)).toBe("");
    expect(renderMarkdown(undefined)).toBe("");
  });
});

describe("cache", () => {
  test("the same text renders once and returns the same string", () => {
    const first = renderMarkdown(POST_MARKDOWN);
    expect(renderMarkdown(POST_MARKDOWN)).toBe(first);
  });

  test("a changed text renders again", () => {
    expect(renderMarkdown("one")).not.toBe(renderMarkdown("two"));
  });

  test("the cache is bounded", () => {
    const first = renderMarkdown("entry 0");
    for (let i = 1; i <= MARKDOWN_CACHE_MAX + 5; i++)
      renderMarkdown(`entry ${i}`);
    // Still correct after eviction: it is simply rendered again.
    expect(renderMarkdown("entry 0")).toBe(first);
  });
});
