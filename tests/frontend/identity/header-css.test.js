// @vitest-environment node
//
// FE-01 / DSG-18 / DSG-22, checked on the stylesheet sources (jsdom loads no
// CSS; the same criteria were measured in headless Chrome at 1440, 992, 991
// and 375px for the package report):
//   - from 992px the navigation is a static row of tabs and the menu button
//     is gone; below it the navigation is the hidden full-screen panel
//   - the current page is underlined, the other links are not
//   - the strip is clear at the top and takes the page background once
//     scrolled; html scroll-padding-top is the header offset, 70px
//   - the frame is one box that never takes a pointer event
//   - every colour token is one of the six palette colours of the design
//     plan, and the design plan holds what FE-01 criterion 1 lists
import { describe, expect, it } from "vitest";
import { declared, read } from "../hero/support.js";

const HEADER = read("src/header/header.module.css");
const TOKENS = read("src/styles/tokens.css");
const BASE = read("src/styles/base.css");
const DESKTOP = "(min-width: 992px)";
const PLAN = read("claudedocs/design/design-plan.md");

// Custom properties of one tokens.css rule, as written.
const tokens = (selector) => declared(TOKENS, selector);

describe("desktop navigation (DSG-18 criteria 1-2)", () => {
  it("is a hidden full-screen panel below 992px", () => {
    expect(declared(HEADER, ".siteNavigation")).toMatchObject({
      position: "fixed",
      inset: "0",
      visibility: "hidden",
    });
    expect(declared(HEADER, ".menuOpen")).toEqual({ visibility: "visible" });
    expect(declared(HEADER, ".menuButton")).toEqual({});
  });

  it("becomes a visible row of tabs from 992px, and the menu button goes", () => {
    expect(declared(HEADER, ".siteNavigation", DESKTOP)).toMatchObject({
      position: "static",
      visibility: "visible",
    });
    expect(declared(HEADER, ".menuPanel", DESKTOP)).toMatchObject({
      transform: "none",
    });
    expect(declared(HEADER, ".menuList", DESKTOP)).toMatchObject({
      "flex-direction": "row",
    });
    expect(declared(HEADER, ".navLink", DESKTOP)).toMatchObject({
      height: "var(--header-height)",
      background: "var(--surface-color)",
    });
    expect(declared(HEADER, ".menuButton", DESKTOP)).toEqual({
      display: "none",
    });
  });
});

describe("current page (DSG-18 criterion 4)", () => {
  it("underlines the current link (2px), the others are plain", () => {
    expect(declared(HEADER, ".navLink")).toMatchObject({
      "text-decoration": "none",
    });
    expect(declared(HEADER, '.navLink[aria-current="page"]')).toMatchObject({
      "text-decoration": "underline",
      "text-decoration-thickness": "2px",
    });
  });

  it("gives every header link and button a visible keyboard outline", () => {
    expect(declared(HEADER, ".navAction:focus-visible")).toMatchObject({
      outline: "2px solid var(--text-color)",
    });
    expect(declared(HEADER, ".siteNavigation a:focus-visible")).toMatchObject({
      outline: "2px solid var(--text-color)",
    });
    expect(declared(HEADER, ".menuFooter a:focus-visible")).toMatchObject({
      outline: "2px solid var(--text-color)",
    });
  });
});

describe("strip and scroll padding (DSG-22)", () => {
  it("is clear at the top of the page and takes the page background once scrolled", () => {
    const strip = declared(HEADER, ".siteHeader");
    expect(strip).toMatchObject({
      position: "fixed",
      "z-index": "var(--z-header)",
    });
    expect(strip).not.toHaveProperty("background");
    expect(strip).not.toHaveProperty("background-color");
    expect(declared(HEADER, ".isScrolled")).toEqual({
      "background-color": "var(--bg-color)",
    });
  });

  it("pads html scrolling by the header offset, which is 70px", () => {
    expect(declared(BASE, "html")).toMatchObject({
      "scroll-padding-top": "var(--header-offset)",
    });
    const root = tokens(":root");
    const px = (value) => Number.parseInt(value, 10);
    expect(root["--header-offset"]).toBe(
      "calc(2 * var(--frame-size) + var(--header-height))",
    );
    expect(2 * px(root["--frame-size"]) + px(root["--header-height"])).toBe(70);
  });

  it("clears the fixed header with the same tokens in the body padding", () => {
    expect(declared(BASE, "body").padding).toBe(
      "calc(var(--frame-size) + var(--header-height)) var(--frame-size) 0",
    );
  });
});

describe("page frame (signature element)", () => {
  it("is one fixed box whose border is the frame, above the header, click-through", () => {
    expect(declared(HEADER, ".frame")).toEqual({
      position: "fixed",
      inset: "0",
      "z-index": "var(--z-frame)",
      border: "var(--frame-size) solid var(--surface-color)",
      "pointer-events": "none",
    });
    expect(HEADER).not.toMatch(/\.frame(Top|Bottom|Left|Right)\b/);
  });
});

describe("palette (FE-01 design plan §3)", () => {
  const PALETTE = [
    "#0c0c0c",
    "#ffffff",
    "#a3a3a3",
    "#595959",
    "#3a3a3a",
    "#d4d4d4",
  ];
  const long = (hex) =>
    hex.length === 4
      ? `#${[...hex.slice(1)].map((c) => c + c).join("")}`
      : hex.toLowerCase();

  it("maps every colour token of both themes to one of the six named colours", () => {
    for (const selector of [":root", '[data-theme="light"]']) {
      const colours = Object.entries(tokens(selector)).filter(([, value]) =>
        value.startsWith("#"),
      );
      expect(colours.length, selector).toBeGreaterThanOrEqual(4);
      for (const [name, value] of colours) {
        expect(PALETTE, `${selector} ${name}`).toContain(long(value));
      }
    }
  });

  it("swaps ink and paper between the themes", () => {
    const dark = tokens(":root");
    const light = tokens('[data-theme="light"]');
    expect(long(dark["--bg-color"])).toBe(long(light["--text-color"]));
    expect(long(light["--bg-color"])).toBe(long(dark["--text-color"]));
  });

  it("names the six colours in the design plan", () => {
    for (const hex of PALETTE) expect(PLAN.toLowerCase()).toContain(hex);
  });
});

describe("design plan (FE-01 criterion 1)", () => {
  it("has type roles, two or more ASCII wireframes, principles, the signature and an owner approval line", () => {
    expect(PLAN).toMatch(/## 4\. Tipografi/);
    expect(PLAN).toMatch(/Marcellus/);
    expect(PLAN).toMatch(/Raleway/);
    // Fenced wireframes: header (desktop + mobile), hero, social strip.
    const fences = PLAN.match(/^```\s*$/gm) ?? [];
    expect(fences.length / 2).toBeGreaterThanOrEqual(2);
    expect(PLAN).toMatch(/### 6\.1 Header/);
    expect(PLAN).toMatch(/### 6\.2 Hero/);
    expect(PLAN).toMatch(/## 9\. İlkeler/);
    expect(PLAN).toMatch(/## 7\. İmza öğesi/);
    expect(PLAN).toMatch(/## 10\. Sahip onayı[\s\S]*- \[[ x]\] .*tarih/);
  });
});
