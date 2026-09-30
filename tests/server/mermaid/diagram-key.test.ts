// PERF-05 step 2: diagramKey() is the contract between the publish script and
// <Mermaid>. The same function runs in Bun and in the browser, so these tests
// pin its exact values (a change of the hash would orphan every stored SVG).
import { describe, expect, test } from "bun:test";
import {
  diagramKey,
  normalizeDiagramSource,
} from "../../../src/lib/diagram-key.js";

describe("diagramKey", () => {
  test("is 8 lower-case hex characters", () => {
    for (const source of ["", "flowchart TD\n  A-->B", "ğüşiöç — İ 𝒳"]) {
      expect(diagramKey(source)).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  test("FNV-1a 32 bit over the UTF-8 bytes (known vectors)", () => {
    // Reference values of the FNV-1a 32-bit test suite.
    expect(diagramKey("")).toBe("811c9dc5");
    expect(diagramKey("a")).toBe("e40c292c");
    expect(diagramKey("foobar")).toBe("bf9cf968");
  });

  test("non-ASCII input is hashed as UTF-8 bytes, not UTF-16 code units", () => {
    const reference = (bytes: Uint8Array) => {
      let hash = 0x811c9dc5;
      for (const byte of bytes) {
        hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, "0");
    };
    for (const source of ["ğ", "Hermes konuşma turu", "İ𝒳—", "日本語"]) {
      expect(diagramKey(source)).toBe(reference(Buffer.from(source, "utf8")));
    }
  });

  test("the same source gives the same key, a different source another", () => {
    const a = "flowchart LR\n  A --> B";
    expect(diagramKey(a)).toBe(diagramKey(a));
    expect(diagramKey(a)).not.toBe(diagramKey("flowchart LR\n  A --> C"));
    expect(diagramKey(a)).not.toBe(diagramKey("flowchart TD\n  A --> B"));
  });

  test("line endings and the blank space around the block do not matter", () => {
    const lf = "flowchart LR\n  A --> B\n  B --> C";
    expect(diagramKey("flowchart LR\r\n  A --> B\r\n  B --> C")).toBe(
      diagramKey(lf),
    );
    expect(diagramKey("flowchart LR\r  A --> B\r  B --> C")).toBe(
      diagramKey(lf),
    );
    expect(diagramKey(`\n\n  ${lf.trimStart()}\n\n`)).toBe(
      diagramKey(`  ${lf.trimStart()}`),
    );
    expect(diagramKey(`${lf}\n`)).toBe(diagramKey(lf));
  });

  test("indentation inside the diagram is part of the key", () => {
    expect(diagramKey("flowchart LR\n  A --> B")).not.toBe(
      diagramKey("flowchart LR\n    A --> B"),
    );
  });

  test("null and undefined are the empty source", () => {
    expect(diagramKey(undefined)).toBe(diagramKey(""));
    expect(diagramKey(null)).toBe(diagramKey(""));
    expect(normalizeDiagramSource(undefined)).toBe("");
  });

  test("normalizeDiagramSource: LF endings, trimmed", () => {
    expect(normalizeDiagramSource("  a\r\nb\r\n")).toBe("a\nb");
  });
});
