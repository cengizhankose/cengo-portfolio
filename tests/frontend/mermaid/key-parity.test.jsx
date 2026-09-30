// PERF-05 step 2 / 9: a diagram is stored under the key the publish script
// computes from the markdown, and found by the key <Mermaid> computes from the
// code text react-markdown gives it. These tests close that loop with the
// real pipeline: drawings stored under extractDiagramBlocks() keys must all be
// found when the same markdown is rendered (nothing falls back to mermaid).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DiagramError,
  extractDiagramBlocks,
} from "../../../scripts/lib/diagram-blocks.ts";
import { DiagramsContext } from "../../../src/pages/blog/Mermaid.jsx";
import PostMarkdown from "../../../src/pages/blog/PostMarkdown.jsx";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));
vi.mock("mermaid", () => ({ default: mermaid }));

const ROOT = join(import.meta.dirname, "..", "..", "..");
const LIVE = readFileSync(
  join(
    ROOT,
    "content/posts/atlas-steward-laya-konustan-yarim-is-cikaran-sistem.tr.md",
  ),
  "utf8",
)
  .replace(/^---\n[\s\S]*?\n---\n/, "")
  .trim();

beforeEach(() => {
  mermaid.initialize.mockReset();
  mermaid.render.mockReset();
  mermaid.render.mockRejectedValue(new Error("must not be called"));
});

/** Stores a drawing for every block the script finds, then renders the markdown. */
function renderWithStored(markdown, lang = "en") {
  const blocks = extractDiagramBlocks(markdown, lang);
  const stored = Object.fromEntries(
    blocks.map((block) => [
      block.key,
      {
        label: block.label,
        light: `<svg id="m-${block.key}-light"><text>l</text></svg>`,
        dark: `<svg id="m-${block.key}-dark"><text>d</text></svg>`,
      },
    ]),
  );
  const view = render(
    <DiagramsContext.Provider value={stored}>
      <PostMarkdown content={markdown} lang={lang} />
    </DiagramsContext.Provider>,
  );
  return { blocks, stored, ...view };
}

function expectAllFound(markdown, lang) {
  const { blocks, container } = renderWithStored(markdown, lang);
  const figures = [...container.querySelectorAll("figure.mermaid-diagram")];
  expect(figures).toHaveLength(blocks.length);
  for (const figure of figures) {
    expect(figure.querySelectorAll(".mermaid-theme")).toHaveLength(2);
  }
  expect(container.querySelector(".mermaid-placeholder")).toBeNull();
  expect(mermaid.render).not.toHaveBeenCalled();
  return { blocks, figures };
}

describe("the live post", () => {
  it("has five diagrams, every one found by its key, with the page's own names", () => {
    const { blocks, figures } = expectAllFound(LIVE, "tr");
    expect(blocks).toHaveLength(5);
    expect(new Set(blocks.map((b) => b.key)).size).toBe(5);
    // the stored label is the name the page shows (same rule, same text)
    expect(figures.map((f) => f.getAttribute("aria-label"))).toEqual(
      blocks.map((b) => b.label),
    );
    expect(blocks[0].label).toBe("Diyagram: Steward'ın boru hattı");
  });
});

describe("fence spellings the script and the page must read the same way", () => {
  const FLOW = "flowchart LR\n  A[Başla] --> B[İş çıktı]\n  B --> C";

  it.each([
    ["LF, the usual fence", `text\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n\nmore`],
    [
      "CRLF line endings",
      `text\r\n\r\n\`\`\`mermaid\r\n${FLOW.replace(/\n/g, "\r\n")}\r\n\`\`\`\r\n`,
    ],
    ["a tilde fence", `~~~mermaid\n${FLOW}\n~~~`],
    ["a four-backtick fence", `\`\`\`\`mermaid\n${FLOW}\n\`\`\`\``],
    [
      "an info string after the language",
      `\`\`\`mermaid title="x"\n${FLOW}\n\`\`\``,
    ],
    [
      "blank lines at the start and end of the block",
      `\`\`\`mermaid\n\n${FLOW}\n\n\`\`\``,
    ],
    [
      "a fence indented by two spaces",
      `  \`\`\`mermaid\n  ${FLOW.replace(/\n/g, "\n  ")}\n  \`\`\``,
    ],
    [
      "a fence indented by three spaces",
      `   \`\`\`mermaid\n   ${FLOW.replace(/\n/g, "\n   ")}\n   \`\`\``,
    ],
    [
      "tabs and trailing spaces inside the source",
      `\`\`\`mermaid\nflowchart LR\n\tA --> B   \n\`\`\``,
    ],
    [
      "a heading and an accTitle",
      `## Bölüm\n\n\`\`\`mermaid\nflowchart LR\n  accTitle: Benim adım\n  A --> B\n\`\`\``,
    ],
  ])("%s", (_name, markdown) => {
    const { blocks } = expectAllFound(markdown, "tr");
    expect(blocks).toHaveLength(1);
  });

  it("two identical diagrams share one stored entry and both are found", () => {
    const markdown = `\`\`\`mermaid\n${FLOW}\n\`\`\`\n\n## Again\n\n\`\`\`mermaid\n${FLOW}\n\`\`\``;
    const { blocks, stored } = renderWithStored(markdown);
    expect(blocks).toHaveLength(2);
    expect(Object.keys(stored)).toHaveLength(1);
    expect(document.querySelectorAll(".mermaid-theme")).toHaveLength(4);
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("other code blocks next to a diagram stay code", () => {
    const { container } = renderWithStored(
      `\`\`\`ts\nconst a = 1;\n\`\`\`\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n\n\`\`\`mermaid-not\nx\n\`\`\``,
    );
    expect(container.querySelectorAll("figure.mermaid-diagram")).toHaveLength(
      1,
    );
    expect(container.querySelectorAll("pre code")).toHaveLength(2);
  });
});

describe("a fence the script cannot key the way the page does is refused at publish time", () => {
  it.each([
    ["in a blockquote", "> ```mermaid\n> flowchart LR\n> ```"],
    ["on a list-marker line", "- ```mermaid\n  flowchart LR\n  ```"],
    [
      "nested four spaces deep",
      "- a\n\n    ```mermaid\n    flowchart LR\n    ```",
    ],
  ])("%s", (_name, markdown) => {
    expect(() => extractDiagramBlocks(markdown, "en")).toThrow(DiagramError);
  });
});
