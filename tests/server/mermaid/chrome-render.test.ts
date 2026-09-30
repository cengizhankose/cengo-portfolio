// PERF-05: the drawing itself, in a real headless Chrome. Runs where a Chrome
// or Chromium is installed (the owner's machine, CI with a browser); the
// Docker test gate has none, so this file is skipped there and the rest of
// tests/server/mermaid covers the pipeline around the drawing with a fake.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parsePostFile } from "../../../scripts/content/post-file";
import {
  ChromeError,
  findChrome,
  openChromePage,
} from "../../../scripts/lib/chrome";
import { createBrowserRenderer } from "../../../scripts/lib/mermaid-browser";
import {
  DiagramError,
  extractDiagramBlocks,
  publishConfig,
  renderMermaid,
} from "../../../scripts/lib/render-mermaid";
import { assertStoredSvg } from "../../../scripts/lib/svg-guard";
import { REPO_ROOT } from "./support";

const chrome = (() => {
  try {
    return findChrome();
  } catch {
    return null;
  }
})();
const LIVE_POST = join(
  REPO_ROOT,
  "content/posts/atlas-steward-laya-konustan-yarim-is-cikaran-sistem.tr.md",
);
const TIMEOUT = 90_000;

describe.skipIf(!chrome)("diagrams drawn in Chrome", () => {
  let renderer: Awaited<ReturnType<typeof createBrowserRenderer>>;

  beforeAll(async () => {
    renderer = await createBrowserRenderer();
  }, TIMEOUT);
  afterAll(async () => {
    await renderer.close();
  });

  test(
    "the live post: 5 diagrams, each a light and a dark SVG that passes the guard",
    async () => {
      const parsed = parsePostFile(await Bun.file(LIVE_POST).text());
      if (!parsed.ok) throw new Error("the live post does not parse");
      const body = parsed.value.body;
      const blocks = extractDiagramBlocks(body, "tr");
      expect(blocks).toHaveLength(5);

      const diagrams = await renderMermaid(body, { lang: "tr", renderer });
      expect(Object.keys(diagrams).sort()).toEqual(
        blocks.map((b) => b.key).sort(),
      );
      for (const block of blocks) {
        const entry = diagrams[block.key];
        expect(entry.label).toBe(block.label);
        expect(entry.label).toStartWith("Diyagram");
        for (const theme of ["light", "dark"] as const) {
          const svg = entry[theme];
          expect(() =>
            assertStoredSvg(svg, { id: `m-${block.key}-${theme}` }),
          ).not.toThrow();
          expect(svg).not.toMatch(/<script|foreignObject|onload=|javascript:/i);
          expect(svg).toContain("<text");
          // natural size, not width="100%" (DSG-06 scrolls instead of shrinking)
          expect(svg).toMatch(/^<svg[^>]* width="\d+(?:\.\d+)?"/);
        }
        // the theme tokens of FE-35: black on white, white on near-black
        expect(entry.light).toContain("#000000");
        expect(entry.dark).toContain("#ffffff");
        expect(entry.dark).not.toBe(entry.light);
      }
      // Turkish letters were drawn (latin-ext subset of Raleway loaded)
      expect(
        Object.values(diagrams)
          .map((d) => d.light)
          .join(""),
      ).toMatch(/[ğüşıöçİĞÜŞÖÇ]/);
    },
    TIMEOUT,
  );

  test(
    "labels are measured with the font of the config (Raleway wraps less than Courier)",
    async () => {
      // Node boxes have a fixed width and long labels wrap inside them, so
      // the font shows in the height: the narrower the font, the fewer lines.
      const source =
        "flowchart LR\n  A[Konuşma bitti ve iş çıktı sonra kayıt doğdu] --> B[Tamam]";
      const height = (svg: string) =>
        Number(/^<svg[^>]* height="([\d.]+)"/.exec(svg)![1]);
      const raleway = await renderer.render(
        source,
        publishConfig("light"),
        "m-w-raleway",
      );
      const courier = publishConfig("light");
      courier.fontFamily = "Courier New, monospace";
      courier.themeVariables.fontFamily = "Courier New, monospace";
      const other = await renderer.render(source, courier, "m-w-courier");
      expect(height(raleway)).toBeGreaterThan(50);
      expect(height(other)).toBeGreaterThan(height(raleway));
    },
    TIMEOUT,
  );

  test(
    "a diagram that does not parse is an error naming it",
    async () => {
      await expect(
        renderMermaid("## Broken\n\n```mermaid\nnot a diagram ((\n```", {
          lang: "en",
          renderer,
        }),
      ).rejects.toThrow(
        /diagram at line 3 \("Diagram: Broken"\) could not be drawn/,
      );
      await expect(
        renderMermaid("```mermaid\nnot a diagram ((\n```", {
          lang: "en",
          renderer,
        }),
      ).rejects.toBeInstanceOf(DiagramError);
    },
    TIMEOUT,
  );

  test(
    "the renderer keeps working after a failed diagram",
    async () => {
      const svg = await renderer.render(
        "flowchart LR\n  A-->B",
        publishConfig("dark"),
        "m-after-error",
      );
      expect(svg).toStartWith('<svg id="m-after-error"');
    },
    TIMEOUT,
  );
});

describe.skipIf(!chrome)("the browser is isolated", () => {
  test(
    "only loopback is reachable from the page; close() ends the session",
    async () => {
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: () =>
          new Response("<!doctype html><title>ok</title>", {
            headers: { "Content-Type": "text/html" },
          }),
      });
      const page = await openChromePage(`http://127.0.0.1:${server.port}/`);
      try {
        expect(
          await page.evaluate<string>(
            `fetch("http://127.0.0.1:${server.port}/").then(() => "reached", () => "blocked")`,
          ),
        ).toBe("reached");
        expect(
          await page.evaluate<string>(
            `fetch("http://example.com/", { mode: "no-cors" }).then(() => "reached", () => "blocked")`,
          ),
        ).toBe("blocked");
        expect(
          await page.evaluate<string>(
            `fetch("http://93.184.216.34/", { mode: "no-cors" }).then(() => "reached", () => "blocked")`,
          ),
        ).toBe("blocked");
      } finally {
        await page.close();
        await server.stop(true);
      }
      await expect(page.evaluate("1 + 1")).rejects.toBeInstanceOf(ChromeError);
    },
    TIMEOUT,
  );

  test("an unusable executable is an error, not a hang", async () => {
    await expect(
      openChromePage("about:blank", {
        executable: "/bin/echo",
        timeoutMs: 1500,
      }),
    ).rejects.toThrow(/did not report a DevTools address/);
  });
});
