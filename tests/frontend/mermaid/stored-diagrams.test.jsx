// PERF-05 / T-05 stage B: <Mermaid> prints the diagrams a post carries
// (posts.diagrams) instead of drawing them. `mermaid` is a spy: for a stored
// diagram it must not even be imported; for a missing one the stage A client
// drawing still runs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { diagramKey } from "../../../src/lib/diagram-key.js";
import { applyTheme } from "../../../src/lib/theme.js";
import { DiagramsContext } from "../../../src/pages/blog/Mermaid.jsx";
import PostMarkdown from "../../../src/pages/blog/PostMarkdown.jsx";
import { json, renderBlog } from "../blog/support.jsx";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
  imported: 0,
}));
vi.mock("mermaid", () => {
  mermaid.imported += 1;
  return { default: mermaid };
});

const ROOT = join(import.meta.dirname, "..", "..", "..");
const STYLE = readFileSync(
  join(ROOT, "src", "pages", "blog", "style.css"),
  "utf8",
);

const FLOW_A = "flowchart LR\n  A --> B";
const FLOW_B = "flowchart TD\n  X --> Y";
const fence = (source) => `\`\`\`mermaid\n${source}\n\`\`\``;
const CONTENT = [
  "## Pipeline",
  fence(FLOW_A),
  "### Worker",
  fence(FLOW_B),
].join("\n\n");

const drawing = (id, text) =>
  `<svg id="${id}" viewBox="0 0 100 40" width="100" height="40" role="graphics-document document"><style>#${id}{fill:red}</style><text>${text}</text></svg>`;

// What the publish script stores for one diagram.
const entry = (source, label) => {
  const key = diagramKey(source);
  return {
    [key]: {
      label,
      light: drawing(`m-${key}-light`, `light ${source.split("\n")[0]}`),
      dark: drawing(`m-${key}-dark`, `dark ${source.split("\n")[0]}`),
    },
  };
};
const STORED = {
  ...entry(FLOW_A, "Stored: A"),
  ...entry(FLOW_B, "Stored: B"),
};

const renderStored = (diagrams, content = CONTENT, lang = "en") =>
  render(
    <DiagramsContext.Provider value={diagrams}>
      <PostMarkdown content={content} lang={lang} />
    </DiagramsContext.Provider>,
  );

const figures = () => [...document.querySelectorAll("figure.mermaid-diagram")];

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  document.body.removeAttribute("style");
  applyTheme("dark");
  mermaid.imported = 0;
  mermaid.initialize.mockReset();
  mermaid.render.mockReset();
  mermaid.render.mockImplementation(async (id, source) => ({
    svg: `<svg id="${id}"><text>client ${source.split("\n")[0]}</text></svg>`,
  }));
});

describe("a stored diagram is printed, not drawn", () => {
  it("renders both themes of every diagram at once, with no placeholder", () => {
    const { container } = renderStored(STORED);
    // synchronously: nothing to wait for, nothing to load
    expect(figures()).toHaveLength(2);
    expect(container.querySelector(".mermaid-placeholder")).toBeNull();
    for (const figure of figures()) {
      const themes = [...figure.querySelectorAll(":scope > div.mermaid-theme")];
      expect(themes.map((div) => [...div.classList].sort())).toEqual([
        ["mermaid-theme", "mermaid-theme--light"],
        ["mermaid-theme", "mermaid-theme--dark"].sort(),
      ]);
      expect(
        themes.every((div) => div.querySelectorAll("svg").length === 1),
      ).toBe(true);
    }
    expect(
      figures()[0].querySelector(".mermaid-theme--light svg"),
    ).toHaveTextContent("light flowchart LR");
    expect(
      figures()[0].querySelector(".mermaid-theme--dark svg"),
    ).toHaveTextContent("dark flowchart LR");
    expect(
      figures()[1].querySelector(".mermaid-theme--dark svg"),
    ).toHaveTextContent("dark flowchart TD");
  });

  it("never imports or calls mermaid", async () => {
    renderStored(STORED);
    await act(async () => {});
    await act(async () => applyTheme("light"));
    expect(mermaid.imported).toBe(0);
    expect(mermaid.initialize).not.toHaveBeenCalled();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("keeps the figure markup of stage A: role img, a name, a tab stop, outside any <pre>", () => {
    const { container } = renderStored(STORED);
    for (const figure of figures()) {
      expect(figure).toHaveAttribute("role", "img");
      expect(figure.tabIndex).toBe(0);
      expect(figure.getAttribute("aria-label")).toBeTruthy();
    }
    expect(container.querySelectorAll("pre")).toHaveLength(0);
    // the name is the one the page derives from the markdown (DSG-06)
    expect(figures().map((f) => f.getAttribute("aria-label"))).toEqual([
      "Diagram: Pipeline",
      "Diagram: Worker",
    ]);
  });

  it("speaks the post's language; the stored label is the fallback name", () => {
    renderStored(STORED, `## Boru hattı\n\n${fence(FLOW_A)}`, "tr");
    expect(figures()[0]).toHaveAttribute("aria-label", "Diyagram: Boru hattı");
  });

  it("the name comes from the stored entry when the page has none of its own", () => {
    const { container } = render(
      <DiagramsContext.Provider value={STORED}>
        <PostMarkdown content={fence(FLOW_A)} />
      </DiagramsContext.Provider>,
    );
    // no heading above: the page label is the bare prefix, which wins
    expect(container.querySelector("figure")).toHaveAttribute(
      "aria-label",
      "Diagram",
    );
  });

  it("does not redraw when the theme changes: the same two SVG nodes stay", async () => {
    renderStored(STORED);
    const before = [...document.querySelectorAll(".mermaid-diagram svg")];
    expect(before).toHaveLength(4);
    await act(async () => applyTheme("light"));
    await act(async () => applyTheme("dark"));
    const after = [...document.querySelectorAll(".mermaid-diagram svg")];
    expect(after).toHaveLength(4);
    after.forEach((svg, i) => expect(svg).toBe(before[i]));
  });

  it("keeps the nodes across unrelated re-renders of the post", () => {
    const tree = (
      <DiagramsContext.Provider value={STORED}>
        <PostMarkdown content={CONTENT} lang="en" />
      </DiagramsContext.Provider>
    );
    const { rerender } = render(tree);
    const first = document.querySelector(".mermaid-diagram svg");
    rerender(tree);
    rerender(tree);
    expect(document.querySelector(".mermaid-diagram svg")).toBe(first);
  });

  it("gives the page unique SVG ids (one per diagram and theme) and passes axe", async () => {
    renderStored(STORED);
    const ids = [...document.querySelectorAll(".mermaid-diagram svg")].map(
      (svg) => svg.id,
    );
    expect(new Set(ids).size).toBe(4);
    expect(ids.sort()).toEqual(
      [FLOW_A, FLOW_B]
        .flatMap((src) =>
          ["light", "dark"].map((t) => `m-${diagramKey(src)}-${t}`),
        )
        .sort(),
    );
    const results = await axe.run(document.body, {
      runOnly: {
        type: "rule",
        values: [
          "role-img-alt",
          "aria-allowed-attr",
          "aria-allowed-role",
          "duplicate-id",
          "nested-interactive",
        ],
      },
      resultTypes: ["violations"],
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("the theme is chosen by CSS alone", () => {
  beforeEach(() => {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.append(style);
  });
  const visible = (figure) =>
    [...figure.querySelectorAll(":scope > .mermaid-theme")].filter(
      (div) => getComputedStyle(div).display !== "none",
    );

  it("shows exactly the dark drawing in the dark theme and the light one in the light theme", async () => {
    renderStored(STORED);
    for (const theme of ["dark", "light", "dark", "light"]) {
      await act(async () => applyTheme(theme));
      for (const figure of figures()) {
        const shown = visible(figure);
        expect(shown).toHaveLength(1);
        expect(shown[0]).toHaveClass(`mermaid-theme--${theme}`);
      }
    }
  });

  it("without a data-theme attribute the site's default, dark, is the one shown", () => {
    renderStored(STORED);
    document.documentElement.removeAttribute("data-theme");
    for (const figure of figures()) {
      const shown = visible(figure);
      expect(shown).toHaveLength(1);
      expect(shown[0]).toHaveClass("mermaid-theme--dark");
    }
  });
});

describe("a diagram without a stored drawing is drawn by the client (stage A)", () => {
  it("draws the one that is missing, prints the one that is stored", async () => {
    renderStored(entry(FLOW_A, "Stored: A"));
    expect(figures()).toHaveLength(1);
    await waitFor(() => expect(figures()).toHaveLength(2));
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    expect(mermaid.render.mock.calls[0][1]).toBe(FLOW_B);
    expect(figures()[0].querySelector(".mermaid-theme")).toBeInTheDocument();
    expect(figures()[1].querySelector(".mermaid-theme")).toBeNull();
    expect(figures()[1].querySelector("svg")).toHaveTextContent(
      "client flowchart TD",
    );
  });

  it("draws everything when the post has no diagrams field at all", async () => {
    for (const value of [null, undefined, {}]) {
      mermaid.render.mockClear();
      const { unmount } = renderStored(value);
      await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
      unmount();
    }
  });

  it("an edited source has another key, so its old drawing is not shown", async () => {
    renderStored(STORED, `## P\n\n${fence("flowchart LR\n  A --> C")}`);
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(1));
    expect(document.querySelector(".mermaid-theme")).toBeNull();
  });

  it.each([
    ["a missing theme", (e) => ({ ...e, dark: undefined })],
    ["a non-string drawing", (e) => ({ ...e, light: { html: "<svg/>" } })],
    [
      "something that is not an <svg>",
      (e) => ({ ...e, light: "<div>x</div>" }),
    ],
    [
      "a script",
      (e) => ({ ...e, light: `${e.light}<script>alert(1)</script>` }),
    ],
    [
      "a script inside the svg",
      (e) => ({
        ...e,
        dark: e.dark.replace("<text>", "<script>alert(1)</script><text>"),
      }),
    ],
    [
      "an event handler",
      (e) => ({
        ...e,
        dark: e.dark.replace("<svg ", '<svg onload="alert(1)" '),
      }),
    ],
    [
      "an event handler on an inner element",
      (e) => ({
        ...e,
        dark: e.dark.replace("<text>", '<text onclick = "x()">'),
      }),
    ],
    [
      "a javascript: URL",
      (e) => ({
        ...e,
        light: e.light.replace(
          "<text>",
          '<a href="javascript:alert(1)"><text>',
        ),
      }),
    ],
    [
      "a foreignObject",
      (e) => ({
        ...e,
        light: e.light.replace(
          "<text>",
          "<foreignObject><div>x</div></foreignObject><text>",
        ),
      }),
    ],
  ])(
    "a damaged entry (%s) is not printed; the client draws it",
    async (_name, damage) => {
      const key = diagramKey(FLOW_A);
      const { container } = renderStored(
        { [key]: damage(STORED[key]) },
        fence(FLOW_A),
      );
      expect(container.querySelector(".mermaid-theme")).toBeNull();
      expect(container.innerHTML).not.toMatch(/alert\(1\)|onload|onclick/);
      await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(1));
    },
  );
});

describe("BlogPost provides the post's diagrams", () => {
  const post = (content, diagrams) => ({
    id: 7,
    slug: "with-diagrams",
    title: "With diagrams",
    excerpt: "x",
    content,
    lang: "en",
    translationKey: null,
    translations: [],
    createdAt: "2026-01-15T12:00:00.000Z",
    ...(diagrams === undefined ? null : { diagrams }),
  });

  it("prints the stored SVGs of /api/posts/:slug: no placeholder, no mermaid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(post(CONTENT, STORED))),
    );
    renderBlog("/blog/with-diagrams");
    await screen.findByRole("heading", { level: 1, name: "With diagrams" });
    expect(figures()).toHaveLength(2);
    expect(
      document.querySelectorAll(".mermaid-diagram .mermaid-theme"),
    ).toHaveLength(4);
    expect(document.querySelector(".mermaid-placeholder")).toBeNull();
    await act(async () => {});
    expect(mermaid.imported).toBe(0);
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("an API payload with diagrams: {} or without the field still draws in the client", async () => {
    for (const diagrams of [{}, undefined, null]) {
      mermaid.render.mockClear();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => json(post(fence(FLOW_A), diagrams))),
      );
      const { unmount } = renderBlog("/blog/with-diagrams");
      await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(1));
      unmount();
    }
  });
});

describe("the CSS and the source", () => {
  it("hides the other theme's drawing (dark is the default, light needs the attribute)", () => {
    const css = STYLE.replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = css.match(
      /:root\[data-theme="light"\] \.mermaid-theme--dark,\s*:root:not\(\[data-theme="light"\]\) \.mermaid-theme--light\s*\{\s*display:\s*none;\s*\}/,
    );
    expect(rule).not.toBeNull();
  });

  it("Mermaid.jsx has no static import of mermaid (only the stage A dynamic one) and no sanitiser", () => {
    const source = readFileSync(
      join(ROOT, "src", "pages", "blog", "Mermaid.jsx"),
      "utf8",
    );
    expect(source).not.toMatch(/^import[^;]*from ["']mermaid["']/m);
    expect(source.match(/import\("mermaid"\)/g)).toHaveLength(1);
    expect(source).not.toMatch(/dompurify|jsdom/i);
  });
});
