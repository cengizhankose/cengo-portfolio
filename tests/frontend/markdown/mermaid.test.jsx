// FE-13 / FE-35 / DSG-06 (T-05 stage A): Mermaid is a React component behind
// the markdown `code` override. `mermaid` itself is mocked: jsdom has no
// layout, so what is checked here is the component contract (states, labels,
// theme re-render, serial renders, fallback, post switching); the real
// diagram metrics (scale, scroll, contrast) are measured in a browser.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PostMarkdown from "../../../src/pages/blog/PostMarkdown.jsx";
import { applyTheme } from "../../../src/lib/theme.js";
import { deferred, go, json, renderBlog } from "../blog/support.jsx";

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));

const ROOT = join(import.meta.dirname, "..", "..", "..");

// What the fake mermaid "drew" with: the last initialize() config, and the
// order of calls (initialize always right before its own render).
let config;
let calls;
let active;
let maxActive;

beforeEach(() => {
  config = null;
  calls = [];
  active = 0;
  maxActive = 0;
  document.head.innerHTML = "<title>x</title>";
  applyTheme("dark");
  mermaid.initialize.mockReset();
  mermaid.render.mockReset();
  mermaid.initialize.mockImplementation((next) => {
    config = next;
    calls.push("initialize");
  });
  mermaid.render.mockImplementation(async (id, source) => {
    calls.push("render");
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 0));
    active -= 1;
    const bg = config.themeVariables.background;
    return {
      svg: `<svg id="${id}" viewBox="0 0 100 40" width="100" height="40" data-bg="${bg}"><text>drawn ${source.split("\n")[0]}</text></svg>`,
    };
  });
});

const fence = (source) => `\`\`\`mermaid\n${source}\n\`\`\``;

const TWO = [
  "# Post",
  "## Pipeline",
  fence("flowchart TD\n  A-->B"),
  "### Worker",
  fence("sequenceDiagram\n  A->>B: hi"),
].join("\n\n");

const svgs = () => [...document.querySelectorAll(".mermaid-diagram svg")];

describe("FE-13: a ```mermaid block becomes a React-owned <Mermaid>", () => {
  it("shows a placeholder, never the source, until the diagram is drawn", async () => {
    const { container } = render(<PostMarkdown content={TWO} />);
    expect(container.querySelectorAll(".mermaid-placeholder")).toHaveLength(2);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/flowchart TD|sequenceDiagram/);
    expect(screen.getAllByText("Loading diagram…")).toHaveLength(2);

    await waitFor(() => expect(svgs()).toHaveLength(2));
    expect(container.querySelector(".mermaid-placeholder")).toBeNull();
  });

  it("renders two .mermaid-diagram svg for a post with two blocks, outside any <pre>", async () => {
    const { container } = render(<PostMarkdown content={TWO} />);
    await waitFor(() => expect(svgs()).toHaveLength(2));
    expect(container.querySelectorAll("pre .mermaid-diagram")).toHaveLength(0);
    expect(container.querySelectorAll("pre")).toHaveLength(0);
    expect(mermaid.render).toHaveBeenCalledTimes(2);
    expect(mermaid.render.mock.calls.map(([, source]) => source)).toEqual([
      "flowchart TD\n  A-->B",
      "sequenceDiagram\n  A->>B: hi",
    ]);
  });

  it("puts what mermaid returned into a keyboard-focusable figure with a label", async () => {
    render(<PostMarkdown content={TWO} />);
    await waitFor(() => expect(svgs()).toHaveLength(2));
    const figures = [...document.querySelectorAll("figure.mermaid-diagram")];
    expect(figures).toHaveLength(2);
    for (const figure of figures) {
      expect(figure).toHaveAttribute("role", "img");
      expect(figure.tabIndex).toBe(0);
      expect(figure.getAttribute("aria-label")).toBeTruthy();
    }
    expect(figures[0].querySelector("svg text").textContent).toBe(
      "drawn flowchart TD",
    );
  });

  it("leaves ordinary code blocks as <pre><code>", async () => {
    const { container } = render(
      <PostMarkdown content={"```ts\nconst a = 1;\n```\n\n`inline`"} />,
    );
    expect(container.querySelector("pre > code.language-ts")).toHaveTextContent(
      "const a = 1;",
    );
    expect(container.querySelector("p > code")).toHaveTextContent("inline");
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("does not load or call mermaid for a post without diagrams", async () => {
    render(<PostMarkdown content={"# Only text\n\nNo diagrams."} />);
    await act(async () => {});
    expect(mermaid.initialize).not.toHaveBeenCalled();
  });

  it("keeps the diagrams mounted when the post component re-renders", async () => {
    const { rerender } = render(<PostMarkdown content={TWO} lang="en" />);
    await waitFor(() => expect(svgs()).toHaveLength(2));
    const first = svgs()[0];
    rerender(<PostMarkdown content={TWO} lang="en" />);
    rerender(<PostMarkdown content={TWO} lang="en" />);
    await act(async () => {});
    expect(mermaid.render).toHaveBeenCalledTimes(2);
    expect(svgs()[0]).toBe(first);
  });
});

describe("FE-13: a diagram that cannot be drawn stays readable", () => {
  it("shows the source as <pre><code class=language-mermaid> and keeps the others", async () => {
    mermaid.render.mockImplementation(async (id, source) => {
      if (source.startsWith("not valid")) throw new Error("Parse error");
      return { svg: `<svg id="${id}"><text>ok</text></svg>` };
    });
    const content = [
      "## Good",
      fence("flowchart TD\n  A-->B"),
      "## Bad",
      fence("not valid mermaid"),
    ].join("\n\n");
    const { container } = render(<PostMarkdown content={content} />);

    await waitFor(() =>
      expect(
        container.querySelector("pre > code.language-mermaid"),
      ).toBeInTheDocument(),
    );
    expect(
      container.querySelector("pre > code.language-mermaid"),
    ).toHaveTextContent("not valid mermaid");
    expect(svgs()).toHaveLength(1);
    expect(container.querySelector(".mermaid-placeholder")).toBeNull();
  });

  it("falls back the same way when mermaid throws synchronously", async () => {
    mermaid.render.mockImplementation(() => {
      throw new Error("boom");
    });
    const { container } = render(
      <PostMarkdown content={fence("flowchart TD\n  A-->B")} />,
    );
    await waitFor(() =>
      expect(
        container.querySelector("pre code.language-mermaid"),
      ).toBeInTheDocument(),
    );
  });

  it("removes the scratch nodes mermaid leaves in <body> after a failed render", async () => {
    mermaid.render.mockImplementation(async (id) => {
      const scratch = document.createElement("div");
      scratch.id = `d${id}`;
      document.body.append(scratch);
      throw new Error("Parse error");
    });
    render(<PostMarkdown content={fence("broken")} />);
    await waitFor(() =>
      expect(
        document.querySelector("pre code.language-mermaid"),
      ).toBeInTheDocument(),
    );
    expect(document.querySelector('body > [id^="dmermaid-"]')).toBeNull();
  });

  it("does not update state after the post unmounted", async () => {
    const pending = deferred();
    mermaid.render.mockImplementation(() => pending.promise);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(
      <PostMarkdown content={fence("flowchart TD\n  A-->B")} />,
    );
    await waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    unmount();
    await act(async () => {
      pending.resolve({ svg: "<svg></svg>" });
    });
    expect(error).not.toHaveBeenCalled();
  });
});

describe("DSG-06: every diagram has its own accessible name", () => {
  const FIVE = [
    "## Pipeline",
    fence("graph LR\n  A-->B"),
    "### 3. Worker",
    fence("graph LR\n  C-->D"),
    fence("graph LR\n  E-->F"),
    "### Extraction",
    fence("graph LR\n  accTitle: Two-layer extraction\n  G-->H"),
    "## Failure case",
    fence("graph LR\n  I-->J"),
  ].join("\n\n");

  it("labels five diagrams: filled, all different", async () => {
    render(<PostMarkdown content={FIVE} />);
    await waitFor(() => expect(svgs()).toHaveLength(5));
    const names = [...document.querySelectorAll(".mermaid-diagram")].map(
      (figure) => figure.getAttribute("aria-label"),
    );
    expect(names).toEqual([
      "Diagram: Pipeline",
      "Diagram: 3. Worker",
      "Diagram: 3. Worker (2)",
      "Two-layer extraction",
      "Diagram: Failure case",
    ]);
    expect(new Set(names).size).toBe(5);
  });

  it("uses the post's language: Diyagram on a TR post, the loading text too", async () => {
    const { container } = render(
      <PostMarkdown
        content={"## Boru hattı\n\n" + fence("graph LR\n  A-->B")}
        lang="tr"
      />,
    );
    expect(screen.getByText("Diyagram yükleniyor…")).toBeInTheDocument();
    await waitFor(() => expect(svgs()).toHaveLength(1));
    expect(container.querySelector(".mermaid-diagram")).toHaveAttribute(
      "aria-label",
      "Diyagram: Boru hattı",
    );
  });

  it("has no axe violation for role=img, ARIA and duplicate ids", async () => {
    render(<PostMarkdown content={FIVE} />);
    await waitFor(() => expect(svgs()).toHaveLength(5));
    const results = await axe.run(document.body, {
      runOnly: {
        type: "rule",
        values: [
          "role-img-alt",
          "aria-allowed-attr",
          "aria-allowed-role",
          "aria-valid-attr",
          "aria-valid-attr-value",
          "duplicate-id",
          "duplicate-id-aria",
          "nested-interactive",
        ],
      },
      resultTypes: ["violations"],
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("FE-35: colours from the theme tokens, redrawn when the theme changes", () => {
  it("initializes mermaid with the base theme and the token colours of the page theme", async () => {
    render(<PostMarkdown content={TWO} />);
    await waitFor(() => expect(svgs()).toHaveLength(2));
    expect(config).toMatchObject({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: "Raleway, sans-serif",
      flowchart: { useMaxWidth: false },
    });
    expect(config.themeVariables).toMatchObject({
      background: "#0c0c0c",
      nodeTextColor: "#ffffff",
      darkMode: true,
    });
  });

  it("calls mermaid.render again on a theme change, and the svg changes", async () => {
    render(<PostMarkdown content={fence("flowchart TD\n  A-->B")} />);
    await waitFor(() => expect(svgs()).toHaveLength(1));
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    const before = svgs()[0].outerHTML;
    expect(before).toContain('data-bg="#0c0c0c"');

    await act(async () => applyTheme("light"));
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(svgs()[0].outerHTML).toContain('data-bg="#ffffff"'),
    );
    expect(svgs()[0].outerHTML).not.toBe(before);
    expect(config.themeVariables).toMatchObject({
      background: "#ffffff",
      nodeTextColor: "#000000",
      darkMode: false,
    });
    expect(document.querySelectorAll(".mermaid-diagram")).toHaveLength(1);
  });

  it("keeps the old drawing on screen while the new theme is being drawn", async () => {
    render(<PostMarkdown content={fence("flowchart TD\n  A-->B")} />);
    await waitFor(() => expect(svgs()).toHaveLength(1));
    const slow = deferred();
    mermaid.render.mockImplementation(() => slow.promise);
    await act(async () => applyTheme("light"));
    expect(svgs()).toHaveLength(1);
    expect(document.querySelector(".mermaid-placeholder")).toBeNull();
    await act(async () => {
      slow.resolve({ svg: '<svg data-bg="new"></svg>' });
    });
    await waitFor(() => expect(svgs()[0]).toHaveAttribute("data-bg", "new"));
  });

  it("ignores a late result of an older theme", async () => {
    const first = deferred();
    mermaid.render.mockImplementationOnce(() => first.promise);
    render(<PostMarkdown content={fence("flowchart TD\n  A-->B")} />);
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(1));
    await act(async () => applyTheme("light"));
    await act(async () => {
      first.resolve({ svg: '<svg data-bg="stale-dark"></svg>' });
    });
    await waitFor(() =>
      expect(svgs()[0]).toHaveAttribute("data-bg", "#ffffff"),
    );
    expect(document.querySelector('[data-bg="stale-dark"]')).toBeNull();
  });
});

describe("mermaid.initialize is global, so renders never overlap (DSG-06 risk)", () => {
  it("runs initialize + render pairs one after another for many diagrams", async () => {
    const content = [1, 2, 3, 4]
      .map((n) => fence(`graph LR\n  N${n}-->M${n}`))
      .join("\n\n");
    render(<PostMarkdown content={content} />);
    await waitFor(() => expect(svgs()).toHaveLength(4));
    expect(maxActive).toBe(1);
    expect(calls).toEqual(Array(4).fill(["initialize", "render"]).flat());
  });

  it("gives every render its own id and leaves no duplicate ids on the page", async () => {
    const content = [
      fence("graph LR\n  A-->B"),
      fence("graph LR\n  C-->D"),
    ].join("\n\n");
    render(<PostMarkdown content={content} />);
    await waitFor(() => expect(svgs()).toHaveLength(2));
    await act(async () => applyTheme("light"));
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(4));
    const ids = mermaid.render.mock.calls.map(([id]) => id);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(id).toMatch(/^mermaid-[\w-]+$/);
    const onPage = svgs().map((svg) => svg.id);
    expect(new Set(onPage).size).toBe(onPage.length);
  });
});

describe("a chart change never shows the previous diagram", () => {
  it("shows the placeholder while the new source is drawn, then the new one", async () => {
    const { rerender } = render(
      <PostMarkdown content={fence("graph LR\n  A-->B")} />,
    );
    await waitFor(() => expect(svgs()).toHaveLength(1));
    const slow = deferred();
    mermaid.render.mockImplementation(() => slow.promise);
    rerender(<PostMarkdown content={fence("graph TD\n  X-->Y")} />);
    expect(svgs()).toHaveLength(0);
    expect(document.querySelector(".mermaid-placeholder")).toBeInTheDocument();
    await act(async () => {
      slow.resolve({ svg: '<svg data-src="new"></svg>' });
    });
    await waitFor(() => expect(svgs()[0]).toHaveAttribute("data-src", "new"));
  });
});

describe("FE-13: switching between posts with diagrams (BlogPost)", () => {
  const post = (slug, title, content) => ({
    id: slug.length,
    slug,
    title,
    excerpt: "x",
    content,
    lang: "en",
    translationKey: null,
    translations: [],
    createdAt: "2026-01-15T12:00:00.000Z",
  });
  const A = post(
    "post-a",
    "Post A",
    `## A1\n\n${fence("graph LR\n  A1-->A2")}\n\n## A2\n\n${fence("graph LR\n  A3-->A4")}`,
  );
  const B = post(
    "post-b",
    "Post B",
    `## B1\n\n${fence("graph TD\n  B1-->B2")}`,
  );

  it("goes from post A to post B without an error and draws B's diagram", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const slug = String(url).split("/api/posts/")[1];
        return { "post-a": json(A), "post-b": json(B) }[slug] ?? json({}, 404);
      }),
    );
    renderBlog("/blog/post-a");
    await screen.findByRole("heading", { level: 1, name: "Post A" });
    await waitFor(() => expect(svgs()).toHaveLength(2));

    await go("/blog/post-b");
    await screen.findByRole("heading", { level: 1, name: "Post B" });
    await waitFor(() => expect(svgs()).toHaveLength(1));

    expect(svgs()[0].querySelector("text")).toHaveTextContent("drawn graph TD");
    expect(document.querySelector("article")).toBeInTheDocument();
    expect(
      document.querySelector(".mermaid-diagram").getAttribute("aria-label"),
    ).toBe("Diagram: B1");
    expect(error.mock.calls.flat().join(" ")).not.toMatch(
      /NotFoundError|removeChild|insertBefore|Cannot read/,
    );
  });
});

describe("source-level guards (FE-13, FE-35 criteria)", () => {
  const blogDir = join(ROOT, "src", "pages", "blog");
  const blogFiles = readdirSync(blogDir).filter((name) =>
    /\.(jsx?|css)$/.test(name),
  );

  it("has no DOM replacement, id lookup or blog-markdown-root in src/pages/blog", () => {
    for (const name of blogFiles) {
      const text = readFileSync(join(blogDir, name), "utf8");
      expect(text, name).not.toMatch(
        /replaceWith|getElementById|blog-markdown-root/,
      );
    }
  });

  it("deleted MermaidRenderer.jsx and does not import it or rehype-raw in BlogPost", () => {
    expect(existsSync(join(blogDir, "MermaidRenderer.jsx"))).toBe(false);
    const post = readFileSync(join(blogDir, "BlogPost.jsx"), "utf8");
    expect(post).not.toMatch(
      /MermaidRenderer|rehypeRaw|rehype-raw|react-markdown/,
    );
    expect(post).toContain("PostMarkdown");
  });

  function sourceFiles(dir) {
    return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
      (entry) => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return sourceFiles(path);
        return /\.(jsx?|tsx?|css|scss)$/.test(entry.name) ? [path] : [];
      },
    );
  }

  it("has none of the old GitHub-dark Mermaid colours anywhere in src", () => {
    const banned = /#1f6feb|#0d1117|#161b22|#c9d1d9|rgba\(31, 111, 235/i;
    const hits = sourceFiles("src").filter((file) =>
      banned.test(readFileSync(join(ROOT, file), "utf8")),
    );
    expect(hits).toEqual([]);
  });

  it("styles the frame square, transparent and scrollable with the border token", () => {
    const css = readFileSync(join(blogDir, "style.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const rule = (selector) =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, selectors]) =>
          selectors
            .split(",")
            .map((s) => s.trim())
            .includes(selector),
        )
        .map(([, , body]) => body)
        .join(";");
    const frame = `${rule(".mermaid-diagram")};${rule(".mermaid-diagram,\n.mermaid-placeholder")}`;
    expect(frame).toMatch(/border:\s*1px solid var\(--border-color\)/);
    expect(frame).toMatch(/border-radius:\s*0/);
    expect(frame).toMatch(/background:\s*transparent/);
    expect(frame).toMatch(/overflow-x:\s*auto/);
    expect(rule(".mermaid-diagram svg")).toMatch(/max-width:\s*none/);
    expect(rule(".mermaid-diagram:focus-visible")).toMatch(
      /outline:\s*2px solid var\(--text-color\)/,
    );
  });
});
