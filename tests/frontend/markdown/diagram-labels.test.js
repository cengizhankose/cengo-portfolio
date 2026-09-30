// DSG-06 step 4: every diagram gets a descriptive, unique aria-label, taken
// from the markdown (accTitle, else the heading above, in the post's language).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDiagramLabels,
  extractDiagramLabels,
} from "../../../src/lib/markdown/diagramLabels.js";

const labels = (markdown, prefix = "Diagram") =>
  extractDiagramLabels(markdown, { prefix }).map((entry) => entry.label);

const block = (source, fence = "```") =>
  `${fence}mermaid\n${source}\n${fence.replace(/mermaid/, "")}`;

describe("extractDiagramLabels", () => {
  it("uses the nearest heading above the block", () => {
    const md = [
      "# Post",
      "## First",
      block("flowchart TD\n  A-->B"),
      "### Deeper",
      block("flowchart TD\n  C-->D"),
    ].join("\n\n");
    expect(labels(md)).toEqual(["Diagram: First", "Diagram: Deeper"]);
  });

  it("only reads #, ## and ### headings (a level-4 heading is not a label)", () => {
    const md = `## Top\n\n#### Minor\n\n${block("graph LR\n  A-->B")}`;
    expect(labels(md)).toEqual(["Diagram: Top"]);
  });

  it("speaks the post's language through the prefix", () => {
    const md = `## Boru hattı\n\n${block("graph LR\n  A-->B")}`;
    expect(labels(md, "Diyagram")).toEqual(["Diyagram: Boru hattı"]);
  });

  it("uses accTitle when the block has one", () => {
    const md = `## Ignored\n\n${block("flowchart TD\n  accTitle: Request path\n  A-->B")}`;
    expect(labels(md)).toEqual(["Request path"]);
  });

  it("is just the prefix when no heading precedes the block", () => {
    const md = `${block("graph LR\n  A-->B")}\n\n${block("graph LR\n  C-->D")}`;
    expect(labels(md)).toEqual(["Diagram", "Diagram (2)"]);
  });

  it("numbers repeated names under one heading: (2), (3)", () => {
    const md = [
      "## Same",
      block("graph LR\n  A-->B"),
      block("graph LR\n  C-->D"),
      block("graph LR\n  E-->F"),
      "## Other",
      block("graph LR\n  G-->H"),
    ].join("\n\n");
    const result = labels(md);
    expect(result).toEqual([
      "Diagram: Same",
      "Diagram: Same (2)",
      "Diagram: Same (3)",
      "Diagram: Other",
    ]);
    expect(new Set(result).size).toBe(result.length);
  });

  it("strips inline markdown from the heading", () => {
    const md = `## The \`Spool\`: *dumb* [files](https://example.com) ##\n\n${block("graph LR\n  A-->B")}`;
    expect(labels(md)).toEqual(["Diagram: The Spool: dumb files"]);
  });

  it("ignores # lines inside other fenced blocks", () => {
    const md = [
      "## Real",
      "```bash\n# a comment, not a heading\n## neither\n```",
      block("graph LR\n  A-->B"),
    ].join("\n\n");
    expect(labels(md)).toEqual(["Diagram: Real"]);
  });

  it("does not treat a mermaid fence nested in a longer fence as a diagram", () => {
    const md = "## H\n\n````md\n```mermaid\ngraph LR\n  A-->B\n```\n````\n";
    expect(extractDiagramLabels(md)).toEqual([]);
  });

  it("handles ~~~ fences, blockquotes, list items and CRLF", () => {
    const md = [
      "## Quote",
      "> ```mermaid",
      "> graph LR",
      ">   A-->B",
      "> ```",
      "",
      "## List",
      "- item",
      "",
      "  ```mermaid",
      "  graph LR",
      "    C-->D",
      "  ```",
      "",
      "## Tilde",
      "~~~mermaid",
      "graph LR",
      "  E-->F",
      "~~~",
    ].join("\r\n");
    expect(labels(md)).toEqual([
      "Diagram: Quote",
      "Diagram: List",
      "Diagram: Tilde",
    ]);
  });

  it("reports the 1-based line of the opening fence and the source", () => {
    const md = "## H\n\n```mermaid\ngraph LR\n  A-->B\n```\n";
    expect(extractDiagramLabels(md)).toEqual([
      { line: 3, source: "graph LR\n  A-->B", label: "Diagram: H" },
    ]);
  });

  it("copes with empty and missing input", () => {
    expect(labels("")).toEqual([]);
    expect(extractDiagramLabels(undefined)).toEqual([]);
    expect(extractDiagramLabels(null)).toEqual([]);
  });
});

describe("createDiagramLabels(...).get", () => {
  const md = `## A\n\n${block("graph LR\n  A-->B")}\n\n## B\n\n${block("graph LR\n  C-->D")}`;
  const index = createDiagramLabels(md, { prefix: "Diagram" });

  it("finds a label by fence line", () => {
    expect(index.get({ line: 3 })).toBe("Diagram: A");
    expect(index.get({ line: 10 })).toBe("Diagram: B");
  });

  it("falls back to the source, then to the bare prefix", () => {
    expect(index.get({ source: " graph LR\n  C-->D \n" })).toBe("Diagram: B");
    expect(index.get({ line: 99, source: "graph TD" })).toBe("Diagram");
    expect(index.get()).toBe("Diagram");
  });

  it("tells two identical diagrams apart by line", () => {
    const same = `## X\n\n${block("graph LR\n  A-->B")}\n\n${block("graph LR\n  A-->B")}`;
    const both = createDiagramLabels(same);
    expect(both.get({ line: 3 })).toBe("Diagram: X");
    expect(both.get({ line: 8 })).toBe("Diagram: X (2)");
  });
});

// The live post (exported into content/posts by the publish-CLI package):
// five diagrams, each under its own heading. The DSG-06 criterion: five
// labels, all filled, all different.
const LIVE_POST = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "content",
  "posts",
  "atlas-steward-laya-konustan-yarim-is-cikaran-sistem.tr.md",
);

describe.skipIf(!existsSync(LIVE_POST))("the live post", () => {
  it("has five distinct, descriptive Turkish labels", () => {
    const result = labels(readFileSync(LIVE_POST, "utf8"), "Diyagram");
    expect(result).toHaveLength(5);
    expect(new Set(result).size).toBe(5);
    for (const label of result) {
      expect(label).toMatch(/^Diyagram: \S/);
    }
    expect(result[0]).toBe("Diyagram: Steward'ın boru hattı");
  });
});
