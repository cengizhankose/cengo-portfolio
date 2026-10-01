// MKT-23 step 3 / ANL-09 step 3 in the blog body: MarkdownLink (the `a`
// override of markdownComponents) opens http(s) links to other sites in a
// new tab through ExternalLink, keeps links to this site in the router and
// leaves fragments / mailto alone. The PostMarkdown wrapper names the
// placement blog_body.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PostMarkdown from "../../../src/pages/blog/PostMarkdown.jsx";
import {
  classifyMarkdownHref,
  markdownComponents,
} from "../../../src/pages/blog/markdownComponents.jsx";

// Diagrams are not drawn here (the markdown tests own that); a stub keeps
// the placeholder -> figure path working without the real library.
vi.mock("mermaid", () => ({
  default: {
    initialize: () => {},
    render: async (id) => ({ svg: `<svg id="${id}"></svg>` }),
  },
}));

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function renderPost(content, { lang = "en", router = true } = {}) {
  const post = <PostMarkdown content={content} lang={lang} />;
  return render(
    router ? (
      <MemoryRouter initialEntries={["/blog/a-post"]}>
        {post}
        <Where />
      </MemoryRouter>
    ) : (
      post
    ),
  );
}

describe("classifyMarkdownHref", () => {
  it.each([
    ["https://example.org/a", { kind: "external" }],
    ["http://example.org", { kind: "external" }],
    ["//cdn.example.org/x", { kind: "external" }],
    ["https://github.com/cengizhankose", { kind: "external" }],
    ["/about", { kind: "internal", to: "/about" }],
    ["/tr/blog/x?q=1#h", { kind: "internal", to: "/tr/blog/x?q=1#h" }],
    [
      "https://www.cengizhankose.com/blog/x?y=1#z",
      { kind: "internal", to: "/blog/x?y=1#z" },
    ],
    ["https://cengizhankose.com/about", { kind: "internal", to: "/about" }],
    ["#user-content-fn-1", { kind: "plain" }],
    ["mailto:me@cengizhankose.com", { kind: "plain" }],
    ["notes.md", { kind: "plain" }],
    ["", { kind: "plain" }],
    [undefined, { kind: "plain" }],
  ])("%s", (href, expected) => {
    expect(classifyMarkdownHref(href)).toEqual(expected);
  });

  it("is registered as the `a` component", () => {
    expect(markdownComponents.a).toBeTypeOf("function");
  });
});

describe("links in a post", () => {
  it("external: new tab, noopener noreferrer, hidden EN note, text first", () => {
    renderPost("Read [the guide](https://example.org/guide).");
    const link = screen.getByRole("link", { name: /^the guide/ });

    expect(link).toHaveAttribute("href", "https://example.org/guide");
    expect(link.target).toBe("_blank");
    expect([...link.relList]).toEqual(["noopener", "noreferrer"]);
    expect(link.relList.contains("me")).toBe(false);
    // jsdom has no CSS, so the hidden span counts as inline and the name
    // algorithm trims its leading space; in a browser the span is
    // position:absolute (block) and gets a separating space (checked in
    // headless Chrome, see the package report).
    expect(link).toHaveAccessibleName(/^the guide ?\(opens in a new tab\)$/);
    expect(link.querySelector(".visually-hidden").textContent).toBe(
      " (opens in a new tab)",
    );
  });

  it("the new-tab note speaks the post's language (TR post)", () => {
    renderPost("[Belge](https://example.org/)", { lang: "tr" });
    expect(screen.getByRole("link")).toHaveAccessibleName(
      /^Belge ?\(yeni sekmede açılır\)$/,
    );
    expect(
      screen.getByRole("link").querySelector(".visually-hidden").textContent,
    ).toBe(" (yeni sekmede açılır)");
  });

  it("raw HTML links get target/rel from MarkdownLink, whatever the author wrote", () => {
    renderPost(
      '<a href="https://example.org/raw" target="_self" rel="opener">raw</a>',
    );
    const link = screen.getByRole("link", { name: /^raw/ });
    expect(link.target).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("internal: a router link without target, followed inside the SPA", async () => {
    const user = userEvent.setup();
    renderPost("Go [about](/about) or [home](https://www.cengizhankose.com/).");
    const about = screen.getByRole("link", { name: "about" });
    expect(about).toHaveAttribute("href", "/about");
    expect(about).not.toHaveAttribute("target");
    expect(screen.getByRole("link", { name: "home" })).toHaveAttribute(
      "href",
      "/",
    );

    await user.click(about);
    expect(screen.getByTestId("where").textContent).toBe("/about");
  });

  it("outside a router an internal link is a plain <a>", () => {
    renderPost("Go [about](/about).", { router: false });
    const about = screen.getByRole("link", { name: "about" });
    expect(about).toHaveAttribute("href", "/about");
    expect(about).not.toHaveAttribute("target");
  });

  it("footnotes and mailto keep their plain links and attributes", () => {
    renderPost(
      "Text[^1] and [mail](mailto:me@cengizhankose.com).\n\n[^1]: Note.",
    );
    const mail = screen.getByRole("link", { name: "mail" });
    expect(mail).toHaveAttribute("href", "mailto:me@cengizhankose.com");
    expect(mail).not.toHaveAttribute("target");

    const ref = document.querySelector("a[data-footnote-ref]");
    expect(ref).not.toBeNull();
    expect(ref.getAttribute("href")).toMatch(/^#user-content-/);
    expect(ref).not.toHaveAttribute("target");
    expect(ref).not.toHaveAttribute("node");
  });

  it("every http(s) link in a post opens in a new tab (MKT-23 criterion 3)", () => {
    renderPost(
      [
        "[a](https://example.org) [b](https://github.com/x) [c](/about)",
        '<a href="https://x.com/cengzhnkse">d</a>',
        "https://auto.example.org/link",
      ].join("\n\n"),
    );
    expect(
      document.querySelectorAll('a[href^="http"]:not([target="_blank"])')
        .length,
    ).toBe(0);
    expect(document.querySelectorAll('a[target="_blank"]')).toHaveLength(4);
  });

  it("the post wrapper is the blog_body placement (ANL-09 step 3)", () => {
    renderPost("[a](https://example.org)");
    expect(
      screen.getByRole("link").closest("[data-analytics-location]"),
    ).toHaveAttribute("data-analytics-location", "blog_body");
    expect(
      document.querySelector(".blog-content.markdown-body"),
    ).toHaveAttribute("data-analytics-location", "blog_body");
  });
});

// Ledger items in this file's scope (W6-FE-markdown-mermaid review): the
// `code` override draws only fenced blocks, and matches the language as
// case-insensitively as diagramLabels.js counts it.
describe("mermaid detection in markdownComponents", () => {
  it("```Mermaid (capitalised) is drawn like ```mermaid, not left as <pre>", () => {
    renderPost("```Mermaid\nflowchart TD\n  A-->B\n```");
    expect(document.querySelector("pre")).toBeNull();
    expect(
      document.querySelector(".mermaid-placeholder, .mermaid-diagram"),
    ).not.toBeNull();
  });

  it("an inline raw <code class=language-mermaid> stays code inside its paragraph", () => {
    renderPost('Text <code class="language-mermaid">A-->B</code> more.');
    const code = document.querySelector("p > code.language-mermaid");
    expect(code).not.toBeNull();
    expect(code.textContent).toBe("A-->B");
    expect(
      document.querySelector("p figure, p .mermaid-placeholder"),
    ).toBeNull();
  });

  it("a normal code block keeps its <pre><code>", () => {
    renderPost("```js\nconst a = 1;\n```");
    expect(document.querySelector("pre > code.language-js")).not.toBeNull();
  });
});
