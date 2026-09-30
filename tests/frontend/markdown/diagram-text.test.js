// The diagram strings live next to the labels until the i18n dictionaries
// take them over (handoff); until then the two languages must stay in step.
import { describe, expect, it } from "vitest";
import {
  DIAGRAM_TEXT,
  diagramText,
} from "../../../src/lib/markdown/diagramText.js";

describe("diagramText", () => {
  it("has the same keys, all filled, in EN and TR", () => {
    expect(Object.keys(DIAGRAM_TEXT.tr).sort()).toEqual(
      Object.keys(DIAGRAM_TEXT.en).sort(),
    );
    for (const lang of ["en", "tr"]) {
      for (const value of Object.values(DIAGRAM_TEXT[lang])) {
        expect(value.trim()).not.toBe("");
      }
    }
  });

  it("names the diagram in the post's language (DSG-06: Diagram / Diyagram)", () => {
    expect(diagramText("en").diagram).toBe("Diagram");
    expect(diagramText("tr").diagram).toBe("Diyagram");
  });

  it("falls back to English for any other language", () => {
    expect(diagramText("de")).toBe(DIAGRAM_TEXT.en);
    expect(diagramText(undefined)).toBe(DIAGRAM_TEXT.en);
    expect(diagramText("__proto__")).toBe(DIAGRAM_TEXT.en);
  });
});
