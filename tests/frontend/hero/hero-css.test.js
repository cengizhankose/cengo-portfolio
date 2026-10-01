// @vitest-environment node
//
// Source rules behind the hero layout and first paint (jsdom loads no CSS;
// the computed criteria were measured in a real browser, see the package
// report): DSG-11 / FE-18 mobile 4:5 photo box and desktop full height,
// PERF-07 no opacity gate or transition on the photo, placeholder colour
// on the box, and no entry animation on the first page (App.css: only
// .page-enter animates, routes.jsx leaves it off the landing page).
import { describe, expect, it } from "vitest";
import { allSelectors, declared, read } from "./support.js";

const HOME = read("src/pages/home/home.module.css");
const APP = read("src/app/App.module.css");
const MOBILE = "(max-width: 991.98px)";
const DESKTOP = "(min-width: 992px)";
const BOX = ".heroImage";

// FE-01: the hero is a CSS grid (one column below 992px, two halves from
// there); the photo box keeps the DSG-11 / FE-18 / PERF-07 rules.
describe("hero section height (FE-18 step 6, DSG-11)", () => {
  it("has no fixed height below 992px: the section is as tall as its content", () => {
    const base = declared(HOME, ".hero");
    expect(base).toEqual({
      display: "grid",
      "grid-template-columns": "minmax(0, 1fr)",
    });
    expect(declared(HOME, ".hero", MOBILE)).toEqual({});
  });

  it("is one (small) viewport tall from 992px, with one height pair instead of the old double declaration", () => {
    // Later declarations win in `declared`, as in the cascade: 100svh with
    // the 100vh fallback before it in the source.
    expect(declared(HOME, ".hero", DESKTOP)).toEqual({
      "grid-template-columns": "repeat(2, minmax(0, 1fr))",
      height: "100svh",
      "min-height": "700px",
      "margin-top": "calc(-1 * (var(--frame-size) + var(--header-height)))",
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
    // The grid column gives the width; the box sets only its ratio.
    expect(declared(HOME, BOX, MOBILE)).toEqual({
      "aspect-ratio": "4 / 5",
      "margin-bottom": "var(--space-4)",
    });
  });

  it("fills the section's height from 992px (DSG-11 step 2)", () => {
    // A grid item stretches to the row, which is the section's height.
    expect(declared(HOME, BOX, DESKTOP)).toEqual({
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
  it("only .pageEnter animates; routes.jsx leaves it off the landing page", () => {
    expect(declared(APP, ".pageEnter")).toMatchObject({
      animation: "enter 150ms ease-out both",
    });
    expect(APP).not.toMatch(/is-initial|page-transition/);
  });

  it("the entry fade is 150ms at most and there is no exit fade (PERF-13 / FE-17)", () => {
    expect(APP).not.toMatch(/fadeOut|400ms/);
    expect(declared(APP, ".pageEnter").animation).toMatch(/\b150ms\b/);
  });
});
