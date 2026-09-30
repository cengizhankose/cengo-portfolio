// usePageMeta (T-03, SEO-25): updates the existing <head> in place, never
// duplicates title/description/robots, and removes robots when a page is
// indexable again.
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { applyPageMeta, usePageMeta } from "../../../src/seo/usePageMeta.js";

function Probe({ meta }) {
  usePageMeta(meta);
  return null;
}

const count = (selector) => document.head.querySelectorAll(selector).length;
const content = (name) =>
  document.head.querySelector(`meta[name="${name}"]`)?.getAttribute("content");

const ABOUT = {
  title: "About | Cengizhan Köse",
  description: "About description",
  robots: null,
  lang: "en",
};
const PORTFOLIO = {
  title: "Portfolio | Cengizhan Köse",
  description: "Portfolio description",
  robots: "noindex, follow",
  lang: "en",
};

beforeEach(() => {
  document.head.innerHTML = "";
  document.documentElement.lang = "";
});

describe("usePageMeta", () => {
  it("writes title, description, robots and html lang with data-seo marks", () => {
    render(<Probe meta={PORTFOLIO} />);

    expect(document.title).toBe("Portfolio | Cengizhan Köse");
    expect(content("description")).toBe("Portfolio description");
    expect(content("robots")).toBe("noindex, follow");
    expect(document.documentElement.lang).toBe("en");
    expect(document.head.querySelector("title")).toHaveAttribute("data-seo");
    expect(
      document.head.querySelector('meta[name="description"]'),
    ).toHaveAttribute("data-seo");
  });

  it("updates the same elements when the meta changes and drops robots", () => {
    const { rerender } = render(<Probe meta={PORTFOLIO} />);
    const title = document.head.querySelector("title");
    const description = document.head.querySelector('meta[name="description"]');

    rerender(<Probe meta={ABOUT} />);

    expect(document.head.querySelector("title")).toBe(title);
    expect(document.head.querySelector('meta[name="description"]')).toBe(
      description,
    );
    expect(document.title).toBe("About | Cengizhan Köse");
    expect(content("description")).toBe("About description");
    expect(count('meta[name="robots"]')).toBe(0);
    expect(count("title")).toBe(1);
    expect(count('meta[name="description"]')).toBe(1);
  });

  it("reuses tags printed by index.html or the server instead of adding new ones", () => {
    document.head.innerHTML = [
      "<title>Cengizhan Köse | Senior Fullstack Engineer</title>",
      '<meta name="description" content="server text">',
      '<meta name="description" content="stray duplicate">',
      '<meta name="robots" content="noindex">',
    ].join("");

    render(<Probe meta={ABOUT} />);

    expect(count("title")).toBe(1);
    expect(count('meta[name="description"]')).toBe(1);
    expect(content("description")).toBe("About description");
    expect(count('meta[name="robots"]')).toBe(0);
  });

  it("switches html lang with the page locale", () => {
    const { rerender } = render(<Probe meta={ABOUT} />);
    expect(document.documentElement.lang).toBe("en");

    rerender(
      <Probe
        meta={{ ...ABOUT, title: "Hakkımda | Cengizhan Köse", lang: "tr" }}
      />,
    );
    expect(document.documentElement.lang).toBe("tr");
    expect(document.title).toBe("Hakkımda | Cengizhan Köse");
  });

  it("ignores empty input without throwing", () => {
    expect(() => applyPageMeta(null)).not.toThrow();
    applyPageMeta({ title: "", description: "", robots: "", lang: "" });
    expect(count("title")).toBe(0);
    expect(count("meta")).toBe(0);
  });
});
