// @vitest-environment node
//
// Source rules behind the hero layout and first paint (jsdom loads no CSS;
// the computed criteria were measured in a real browser, see the package
// report): DSG-11 / FE-18 mobile 4:5 photo box and desktop full height,
// PERF-07 no opacity gate or transition on the photo, placeholder colour
// on the box, and no entry animation on the first page (App.css).
import { describe, expect, it } from "vitest";
import { allSelectors, declared, read } from "./support.js";

const HOME = read("src/pages/home/style.css");
const APP = read("src/app/App.css");
const MOBILE = "(max-width: 991.98px)";
const DESKTOP = "(min-width: 992px)";
const BOX = ".intro_sec .h_bg-image";

describe("hero section height (FE-18 step 6, DSG-11)", () => {
  it("has no fixed height below 992px: the section is as tall as its content", () => {
    expect(declared(HOME, ".intro_sec")).toEqual({});
    expect(declared(HOME, ".intro_sec", MOBILE)).toEqual({});
  });

  it("is one (small) viewport tall from 992px, with one height pair instead of the old double declaration", () => {
    // Later declarations win in `declared`, as in the cascade: 100svh with
    // the 100vh fallback before it in the source.
    expect(declared(HOME, ".intro_sec", DESKTOP)).toEqual({
      height: "100svh",
      "min-height": "700px",
      "margin-top": "-60px",
    });
    expect(HOME).not.toMatch(/calc\(100vh - 60px\)/);
    expect(HOME).toMatch(/height: 100vh;\s*height: 100svh;/);
  });
});

describe("photo box (DSG-11, FE-18, PERF-07)", () => {
  it("is a positioned, clipping box with a grey fill that shows until the photo decodes", () => {
    expect(declared(HOME, BOX)).toMatchObject({
      position: "relative",
      overflow: "hidden",
      "background-color": "rgb(128 128 128 / 12%)",
    });
    // No mobile-breaking minimum at the base level (DSG-11 step 3).
    expect(declared(HOME, BOX)).not.toHaveProperty("min-height");
    expect(declared(HOME, BOX)).not.toHaveProperty("height");
  });

  it("is 4:5 below 992px, sized by its width alone (DSG-11 step 3)", () => {
    // width: 100% comes from the grouped `.text, .h_bg-image` rule.
    expect(declared(HOME, BOX, MOBILE)).toEqual({
      width: "100%",
      height: "auto",
      "min-height": "0",
      "aspect-ratio": "4 / 5",
      "margin-bottom": "24px",
    });
  });

  it("fills the section's height from 992px (DSG-11 step 2)", () => {
    expect(declared(HOME, BOX, DESKTOP)).toEqual({
      height: "100%",
      "min-height": "700px",
    });
  });

  it("the photo fills the box and covers it, with no transition", () => {
    expect(declared(HOME, `${BOX} picture`)).toEqual({
      position: "absolute",
      inset: "0",
    });
    const img = declared(HOME, `${BOX} img`);
    expect(img).toEqual({
      display: "block",
      width: "100%",
      height: "100%",
      "object-fit": "cover",
      "object-position": "center",
    });
  });

  it("has no placeholder element rule and no opacity transition left (PERF-07 step 2)", () => {
    expect(allSelectors(HOME).some((s) => s.includes("img-placeholder"))).toBe(
      false,
    );
    expect(HOME).not.toMatch(/transition:\s*opacity/);
    expect(HOME).not.toMatch(/height:\s*600px|min-height:\s*75vh/);
  });
});

describe("first page after a full load is not faded in (PERF-07 step 3)", () => {
  it("App.css switches the entry animation off for .is-initial", () => {
    expect(declared(APP, ".page-transition.is-initial")).toEqual({
      animation: "none",
    });
  });

  it("the .is-initial rule comes after the fadeIn rule, so it wins at equal specificity", () => {
    expect(APP.indexOf(".page-transition.is-initial {")).toBeGreaterThan(
      APP.indexOf(".page-transition.fadeIn {"),
    );
  });

  it("later pages keep the 400ms fade (FE-17 / PERF-13 rewrite it later)", () => {
    expect(declared(APP, ".page-transition.fadeIn")).toMatchObject({
      animation: "fadeIn 400ms ease-out",
    });
  });
});
