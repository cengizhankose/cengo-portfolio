// PERF-05 steps 3-7: renderMermaid() with a fake browser and the real
// sanitiser (sanitizeSvg over jsdom) and guard. What is drawn is checked by
// chrome-render.test.ts in a real Chrome; here the pipeline around the
// drawing is: keys, labels, per-theme configs, ids, cleaning, verification.
import { describe, expect, test, setDefaultTimeout } from "bun:test";
import { diagramKey } from "../../../src/lib/diagram-key.js";
import {
  DiagramError,
  extractDiagramBlocks,
  uniqueBlocks,
} from "../../../scripts/lib/diagram-blocks";
import {
  configPath,
  publishConfig,
  renderMermaid,
} from "../../../scripts/lib/render-mermaid";
import { drawingCounts } from "../../../scripts/lib/svg-guard";
import {
  FLOW_A,
  FLOW_B,
  POST_WITH_TWO,
  REAL_HTML_LABEL_SVG,
  fakeRenderer,
  fence,
  realSvg,
  smallSvg,
} from "./support";

// Shared machines get loaded: the default 5 s per test is too tight for jsdom and PGlite.
setDefaultTimeout(30_000);

const keyA = diagramKey(FLOW_A);
const keyB = diagramKey(FLOW_B);

describe("extractDiagramBlocks", () => {
  test("keys, sources, labels and lines, in document order", () => {
    expect(extractDiagramBlocks(POST_WITH_TWO, "en")).toEqual([
      { key: keyA, source: FLOW_A, label: "Diagram: Boru hattı", line: 3 },
      { key: keyB, source: FLOW_B, label: "Diagram: Worker", line: 10 },
    ]);
  });

  test("labels speak the post's language; an accTitle wins", () => {
    const tr = extractDiagramBlocks(
      `## Bölüm\n\n${fence("flowchart LR\n  accTitle: Benim adım\n  A-->B")}`,
      "tr",
    );
    expect(tr[0].label).toBe("Benim adım");
    expect(
      extractDiagramBlocks(`## Bölüm\n\n${fence(FLOW_A)}`, "tr")[0].label,
    ).toBe("Diyagram: Bölüm");
    expect(extractDiagramBlocks(fence(FLOW_A), "en")[0].label).toBe("Diagram");
  });

  test("other code blocks and a post without diagrams give nothing", () => {
    expect(
      extractDiagramBlocks("```ts\nconst a = 1;\n```\n\ntext", "en"),
    ).toEqual([]);
    expect(extractDiagramBlocks("", "en")).toEqual([]);
  });

  test("~~~ fences, longer fences and an info string are blocks too", () => {
    const blocks = extractDiagramBlocks(
      [
        fence(FLOW_A, "~~~"),
        fence(FLOW_B, "````"),
        "```mermaid title=x\nflowchart LR\n  P-->Q\n```",
      ].join("\n\n"),
      "en",
    );
    expect(blocks.map((b) => b.key)).toEqual([
      keyA,
      keyB,
      diagramKey("flowchart LR\n  P-->Q"),
    ]);
  });

  test("CRLF sources get the same key as LF sources", () => {
    const lf = extractDiagramBlocks(fence(FLOW_A), "en")[0].key;
    const crlf = extractDiagramBlocks(
      fence(FLOW_A).replace(/\n/g, "\r\n"),
      "en",
    )[0].key;
    expect(crlf).toBe(lf);
  });

  test("a fence indented by up to three spaces loses that indentation, as in the page", () => {
    const indented = "  ```mermaid\n  flowchart LR\n    A --> B\n  ```";
    expect(extractDiagramBlocks(indented, "en")[0].source).toBe(
      "flowchart LR\n  A --> B",
    );
  });

  test("a fence inside a list or a quote is refused, naming the line", () => {
    // The fence shares its line with a list marker, is nested deeper than a
    // top-level fence may be indented, or sits in a quote: the page would be
    // handed different text than this script sees.
    for (const markdown of [
      "- ```mermaid\n  flowchart LR\n  ```",
      "- item\n\n    ```mermaid\n    flowchart LR\n    ```",
      "> ```mermaid\n> flowchart LR\n> ```",
    ]) {
      expect(() => extractDiagramBlocks(markdown, "en")).toThrow(DiagramError);
      expect(() => extractDiagramBlocks(markdown, "en")).toThrow(
        /inside a list or a quote/,
      );
    }
    expect(() =>
      extractDiagramBlocks("intro\n\n> ```mermaid\n> x\n> ```", "en"),
    ).toThrow(/line 3 is inside/);
  });
});

describe("uniqueBlocks", () => {
  const block = (key: string, source: string, line = 1) => ({
    key,
    source,
    label: "L",
    line,
  });

  test("the same diagram twice is one entry", () => {
    expect(
      uniqueBlocks([
        block("aaaaaaaa", "flowchart LR\n A-->B", 1),
        block("aaaaaaaa", "flowchart LR\r\n A-->B\n", 9),
        block("bbbbbbbb", "x", 12),
      ]).map((b) => b.line),
    ).toEqual([1, 12]);
  });

  test("two different sources with one key are an error naming both lines", () => {
    expect(() =>
      uniqueBlocks([block("aaaaaaaa", "one", 3), block("aaaaaaaa", "two", 20)]),
    ).toThrow(/lines 3 and 20 .* same key aaaaaaaa/);
  });
});

describe("renderMermaid", () => {
  test("a post without diagrams draws nothing", async () => {
    const renderer = fakeRenderer();
    expect(
      await renderMermaid("# Just text", { lang: "en", renderer }),
    ).toEqual({});
    expect(renderer.calls).toEqual([]);
  });

  test("{ [key]: { label, light, dark } } for every block", async () => {
    const renderer = fakeRenderer();
    const diagrams = await renderMermaid(POST_WITH_TWO, {
      lang: "en",
      renderer,
    });
    expect(Object.keys(diagrams)).toEqual([keyA, keyB]);
    for (const [key, label] of [
      [keyA, "Diagram: Boru hattı"],
      [keyB, "Diagram: Worker"],
    ] as const) {
      const entry = diagrams[key];
      expect(Object.keys(entry).sort()).toEqual(["dark", "label", "light"]);
      expect(entry.label).toBe(label);
      expect(entry.light).toStartWith(`<svg id="m-${key}-light"`);
      expect(entry.dark).toStartWith(`<svg id="m-${key}-dark"`);
    }
  });

  test("each block is drawn once per theme with that theme's config and a unique id", async () => {
    const renderer = fakeRenderer();
    await renderMermaid(POST_WITH_TWO, { lang: "en", renderer });
    expect(renderer.calls.map((c) => c.id)).toEqual([
      `m-${keyA}-light`,
      `m-${keyA}-dark`,
      `m-${keyB}-light`,
      `m-${keyB}-dark`,
    ]);
    expect(new Set(renderer.calls.map((c) => c.id)).size).toBe(4);
    const [light, dark] = renderer.calls;
    expect(light.source).toBe(FLOW_A);
    expect(light.config.themeVariables.background).toBe("#ffffff");
    expect(dark.config.themeVariables.background).toBe("#0c0c0c");
    expect(light.config).toEqual(publishConfig("light"));
    expect(dark.config).toEqual(publishConfig("dark"));
  });

  test("labels are plain SVG text and the client never sees HTML labels", async () => {
    const renderer = fakeRenderer();
    await renderMermaid(POST_WITH_TWO, { lang: "en", renderer });
    for (const { config } of renderer.calls) {
      expect(config.securityLevel).toBe("strict");
      expect(config.htmlLabels).toBe(false);
      expect(config.flowchart).toEqual({
        htmlLabels: false,
        useMaxWidth: false,
      });
    }
  });

  test("the same source twice is drawn once", async () => {
    const renderer = fakeRenderer();
    const markdown = [fence(FLOW_A), "", "## Again", "", fence(FLOW_A)].join(
      "\n",
    );
    const diagrams = await renderMermaid(markdown, { lang: "en", renderer });
    expect(Object.keys(diagrams)).toEqual([keyA]);
    expect(renderer.calls).toHaveLength(2);
    expect(diagrams[keyA].label).toBe("Diagram");
  });

  test("a renderer that was given is not closed (its owner closes it)", async () => {
    const renderer = fakeRenderer();
    await renderMermaid(fence(FLOW_A), { lang: "en", renderer });
    expect(renderer.closed).toBe(false);
  });

  test("reports one progress line per diagram", async () => {
    const lines: string[] = [];
    await renderMermaid(POST_WITH_TWO, {
      lang: "en",
      renderer: fakeRenderer(),
      progress: (line) => lines.push(line),
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toStartWith(`${keyA} Diagram: Boru hattı (`);
  });

  test("real Mermaid output keeps every drawn part through the sanitiser", async () => {
    const renderer = fakeRenderer((_s, _c, id) => realSvg(id));
    const diagrams = await renderMermaid(fence(FLOW_A), {
      lang: "en",
      renderer,
    });
    const stored = diagrams[keyA].light;
    const raw = realSvg(`m-${keyA}-light`);
    expect(drawingCounts(stored)).toEqual(drawingCounts(raw));
    const texts = (svg: string) =>
      [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
    expect(texts(stored)).toEqual(texts(raw));
    expect(texts(stored).length).toBeGreaterThan(3);
  });

  test("a diagram that cannot be drawn stops the run and names itself", async () => {
    const renderer = fakeRenderer((source, _c, id) => {
      if (source.includes("TD")) throw new Error("Parse error on line 2");
      return smallSvg(id);
    });
    const promise = renderMermaid(POST_WITH_TWO, { lang: "en", renderer });
    await expect(promise).rejects.toThrow(DiagramError);
    await expect(promise).rejects.toThrow(
      /diagram at line 10 \("Diagram: Worker"\) could not be drawn \(light\): Parse error on line 2/,
    );
  });

  test("HTML labels (<foreignObject>) are refused: they would be cleaned away", async () => {
    const renderer = fakeRenderer(() => REAL_HTML_LABEL_SVG);
    await expect(
      renderMermaid(fence(FLOW_A), { lang: "en", renderer }),
    ).rejects.toThrow(/uses HTML labels/);
  });

  test("a sanitiser that removes part of the drawing stops the run", async () => {
    await expect(
      renderMermaid(fence(FLOW_A), {
        lang: "en",
        renderer: fakeRenderer(),
        sanitize: (svg) => svg.replace(/<text[\s\S]*?<\/text>/g, ""),
      }),
    ).rejects.toThrow(/cleaning removed 1 <text> element/);
    await expect(
      renderMermaid(fence(FLOW_A), {
        lang: "en",
        renderer: fakeRenderer(),
        sanitize: (svg) => svg.replace(/<style[\s\S]*?<\/style>/g, ""),
      }),
    ).rejects.toThrow(/cleaning removed 1 <style> element/);
  });

  test("the guard runs on the cleaned SVG (CSS escapes survive DOMPurify)", async () => {
    const renderer = fakeRenderer((_s, _c, id) =>
      smallSvg(id).replace(
        "</style>",
        ".x{background:u\\72l(https://evil.example/x)}</style>",
      ),
    );
    await expect(
      renderMermaid(fence(FLOW_A), { lang: "en", renderer }),
    ).rejects.toThrow(/backslash/);
  });

  test("the real sanitiser strips a script and a handler; the guard never sees them", async () => {
    const renderer = fakeRenderer((_s, _c, id) =>
      smallSvg(id).replace(
        "<g>",
        '<g onclick="alert(1)"><script>alert(1)</script>',
      ),
    );
    const diagrams = await renderMermaid(fence(FLOW_A), {
      lang: "en",
      renderer,
    });
    for (const svg of [diagrams[keyA].light, diagrams[keyA].dark]) {
      expect(svg).not.toMatch(/<script|onclick|alert/);
      expect(svg).toContain("<style>");
      expect(svg).toContain("<marker");
    }
  });

  test("a root id other than the one asked for is refused", async () => {
    const renderer = fakeRenderer(() => smallSvg("some-other-id"));
    await expect(
      renderMermaid(fence(FLOW_A), { lang: "en", renderer }),
    ).rejects.toThrow(/root <svg> id is "some-other-id"/);
  });

  test("the configs come from scripts/mermaid.<theme>.json unless given", async () => {
    const seen: string[] = [];
    await renderMermaid(fence(FLOW_A), {
      lang: "en",
      renderer: fakeRenderer(),
      loadConfig: async (theme) => {
        seen.push(theme);
        return { theme };
      },
    });
    expect(seen.sort()).toEqual(["dark", "light"]);
    expect(configPath("light")).toEndWith("/scripts/mermaid.light.json");
  });
});
