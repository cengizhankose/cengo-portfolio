// Visible hover states and the clickable blog card (DSG-27), inline code on
// the monochrome system (DSG-26). The stylesheet checks are source checks
// (jsdom has no cascade or layout); the card markup is rendered. The computed
// criteria (force :hover, elementFromPoint, outline on Tab, code colour)
// were measured in headless Chrome, see the package report.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST_EN, POST_TR, json, renderBlog } from "../blog/support.jsx";
import { declared, read, stylesheets } from "./support.js";
import { GLOBAL_CSS } from "../css-arch/global-css.js";

const INDEX = GLOBAL_CSS;
const HEADER = read("src/header/style.css");
const BLOG = read("src/pages/blog/style.css");

// --- tokens and contrast --------------------------------------------------

function tokens(selector) {
  return Object.fromEntries(
    Object.entries(declared(INDEX, selector)).filter(([key]) =>
      key.startsWith("--"),
    ),
  );
}
const DARK = tokens(":root");
const LIGHT = { ...DARK, ...tokens('[data-theme="light"]') };

function luminance(hex) {
  const full =
    hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const token = (theme, value) => theme[/^var\((--[\w-]+)\)$/.exec(value)[1]];

describe("inline code (DSG-26)", () => {
  const inline = declared(BLOG, ".markdown-body code");
  const block = declared(BLOG, ".markdown-body pre code");

  it("is the text colour inside a hairline --border-color edge", () => {
    expect(inline).toMatchObject({
      color: "var(--text-color)",
      border: "1px solid var(--border-color)",
    });
    expect(DARK["--border-color"]).toBe("#3a3a3a");
    expect(LIGHT["--border-color"]).toBe("#d4d4d4");
  });

  it("reads at >= 4.5:1 on its own background in both themes", () => {
    for (const theme of [DARK, LIGHT]) {
      expect(
        contrast(token(theme, inline.color), token(theme, inline.background)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("drops the edge and the colour inside code blocks", () => {
    expect(block).toMatchObject({ border: "0", color: "inherit" });
  });

  it("leaves Bootstrap's pink nowhere: code inherits its colour globally", () => {
    expect(declared(INDEX, "code").color).toBe("inherit");
    for (const file of stylesheets()) {
      expect(read(file), file).not.toMatch(/#d63384|214,\s*51,\s*132/i);
    }
  });
});

// --- hover ----------------------------------------------------------------

describe("hover changes something visible (DSG-27)", () => {
  it("underlines (or thickens) every plain link on hover", () => {
    expect(declared(INDEX, "a")).toMatchObject({
      color: "var(--text-color)",
      "text-underline-offset": "3px",
    });
    expect(declared(INDEX, "a:hover")).toMatchObject({
      "text-decoration-line": "underline",
      "text-decoration-thickness": "2px",
    });
  });

  // [stylesheet, resting rule, hover rule]: the hover rule sets
  // text-decoration(-line/-thickness) or opacity to something the resting
  // rule does not have.
  it.each([
    [HEADER, ".nav_ac", ".nav_ac:hover"],
    [HEADER, ".the_menu .menu_item > a", ".the_menu .menu_item > a:hover"],
    [HEADER, ".menu_footer__social a", ".menu_footer__social a:hover"],
    [BLOG, ".blog-post-title a", ".blog-post-title a:hover"],
    [BLOG, ".blog-post-byline a", ".blog-post-byline a:hover"],
    [BLOG, ".markdown-body a", ".markdown-body a:hover"],
    [
      read("src/components/socialicons/style.css"),
      ".stick_follow_icon a",
      ".stick_follow_icon a:hover",
    ],
  ])("%#: %s", (css, resting, hover) => {
    const before = declared(css, resting);
    const after = declared(css, hover);
    const visible = [
      "text-decoration",
      "text-decoration-line",
      "text-decoration-thickness",
      "opacity",
    ].filter((prop) => prop in after && after[prop] !== before[prop]);
    expect(visible.length, `${hover} ${JSON.stringify(after)}`).toBeGreaterThan(
      0,
    );
  });

  it("keeps the underline off links drawn as buttons", () => {
    expect(
      declared(
        read("src/components/actionbutton/button.module.css"),
        ".button:hover",
      ),
    ).toMatchObject({
      "text-decoration": "none",
    });
    expect(
      declared(read("src/pages/about/about.module.css"), ".ctaButton:hover"),
    ).toMatchObject({ "text-decoration": "none" });
  });
});

describe("the whole blog card is the link (DSG-27 steps 3-4)", () => {
  it("stretches the title link over the card and rings the card on focus", () => {
    expect(declared(BLOG, ".blog-card")).toMatchObject({
      position: "relative",
    });
    expect(declared(BLOG, ".blog-post-title a::after")).toMatchObject({
      content: '""',
      position: "absolute",
      inset: "0",
    });
    expect(declared(BLOG, ".blog-card:hover .blog-post-title a")).toMatchObject(
      {
        "text-decoration": "underline",
      },
    );
    expect(declared(BLOG, ".blog-card:focus-within")).toMatchObject({
      outline: "2px solid var(--text-color)",
      "outline-offset": "4px",
    });
  });

  describe("rendered /blog", () => {
    beforeEach(() => {
      document.head.innerHTML = "<title>x</title>";
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url) =>
          String(url).includes("lang=tr") ? json([POST_TR]) : json([POST_EN]),
        ),
      );
    });
    afterEach(() => vi.unstubAllGlobals());

    it("has exactly one link per card, inside the title, to the post", async () => {
      renderBlog("/blog");
      await screen.findByRole("link", { name: POST_EN.title });
      const cards = [...document.querySelectorAll(".blog-card")];
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        const links = card.querySelectorAll("a");
        expect(links).toHaveLength(1);
        expect(links[0].closest(".blog-post-title")).not.toBeNull();
        expect(links[0].getAttribute("href")).toMatch(
          /^(\/tr)?\/blog\/[\w-]+$/,
        );
      }
    });
  });
});
