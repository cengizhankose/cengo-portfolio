// Static and cross-module checks for the portfolio (ANL-09/ANL-11 exclusion
// rule with the real outbound module, DSG-08 CSS rules, lint of the files this
// package touches). The page itself is rendered in portfolio-page.test.jsx.
import { render } from "@testing-library/react";
import { ESLint } from "eslint";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { outboundProps } from "../../../src/lib/analytics/outbound.js";
import { Portfolio } from "../../../src/pages/portfolio";
import { ROOT, declared, read } from "../hero/support.js";

vi.mock("../../../src/lib/analytics/index.js", () => ({ track: vi.fn() }));

const css = read("src/pages/portfolio/portfolio.module.css");

describe("one click, one event (ANL-09 / ANL-11)", () => {
  it("the outbound listener skips every project link and counts the GitHub profile link", () => {
    render(
      <MemoryRouter initialEntries={["/portfolio"]}>
        <Portfolio />
      </MemoryRouter>,
    );
    const options = {
      baseUrl: "https://www.cengizhankose.com/portfolio",
      currentHost: "www.cengizhankose.com",
    };

    const projectLinks = [
      ...document.querySelectorAll('a[data-track="project"]'),
    ];
    // 5 case links, 9 podium evidence links (W13), 3 repos.
    expect(projectLinks).toHaveLength(17);
    for (const link of projectLinks) {
      expect(
        outboundProps(link, options),
        link.getAttribute("href"),
      ).toBeNull();
    }

    const profile = document.querySelector(
      'a[href="https://github.com/cengizhankose"]',
    );
    expect(outboundProps(profile, options)).toEqual({
      network: "github",
      location: "portfolio",
    });
  });
});

describe("portfolio stylesheet (DSG-08 step 9, DSG-25)", () => {
  it("lays the cases out one per row, screenshot beside the text from 992px on alternating sides (W13)", () => {
    expect(declared(css, ".cases")).toMatchObject({ display: "grid" });
    expect(declared(css, ".card", "(min-width: 992px)")).toMatchObject({
      "grid-template-columns": "7fr 5fr",
    });
    expect(
      declared(css, ".cases > li:nth-child(even) .card", "(min-width: 992px)"),
    ).toMatchObject({ "grid-template-columns": "5fr 7fr" });
    expect(
      declared(
        css,
        ".cases > li:nth-child(even) .cardMedia",
        "(min-width: 992px)",
      ),
    ).toMatchObject({ order: "1" });
    // The screenshot stays in view below the fixed header while the text
    // scrolls past it, only where it sits beside the text.
    expect(declared(css, ".cardMedia", "(min-width: 992px)")).toMatchObject({
      position: "sticky",
    });
    expect(declared(css, ".cardMedia").position).toBeUndefined();
  });

  it("shows the podiums as thumbnails beside the text, three a row from 768px (W13)", () => {
    expect(declared(css, ".award")).toMatchObject({
      display: "grid",
      "grid-template-columns": "6.5rem 1fr",
      "align-content": "start",
    });
    expect(declared(css, ".awardGrid", "(min-width: 768px)")).toMatchObject({
      "grid-template-columns": "repeat(3, 1fr)",
    });
    expect(declared(css, ".award", "(min-width: 768px)")).toMatchObject({
      "grid-template-columns": "1fr",
    });
    expect(declared(css, ".awardMedia")).toMatchObject({ "aspect-ratio": "1" });
    // The evidence links of a podium, one per line.
    expect(declared(css, ".awardLinks")).toMatchObject({
      display: "grid",
      gap: "var(--space-1)",
    });
    expect(declared(css, ".awardMedia img")).toMatchObject({
      "object-fit": "cover",
    });
    // The numeral of a podium without a photo is set in the display face.
    expect(declared(css, ".awardRank")).toMatchObject({
      "font-family": "var(--font-display)",
      "font-synthesis": "none",
      fill: "var(--text-muted)",
    });
  });

  it("keeps the closing call to action clear of the page frame", () => {
    // body has height: 100%, so the space under the last box must be padding:
    // a trailing margin does not extend the scroll height, and from 1280px
    // the fixed 10px frame covered the link.
    expect(declared(css, ".cta")).toMatchObject({
      margin: "0",
      "padding-bottom": "calc(var(--frame-size) + var(--space-6))",
    });
  });

  it("keeps the image box 16:10 and cropped", () => {
    expect(declared(css, ".cardMedia")).toMatchObject({
      "aspect-ratio": "16 / 10",
    });
    expect(declared(css, ".cardMedia img")).toMatchObject({
      "object-fit": "cover",
    });
  });

  it("draws the badge monochrome from the theme tokens", () => {
    const badge = declared(css, ".cardAward");
    expect(badge["border-radius"]).toBe("0.75rem");
    expect(badge.border).toBe("1px solid var(--border-color)");
    expect(badge.color).toBe("var(--text-color)");
  });

  it("never moves an image on hover (it is not a link) and never uses transition: all", () => {
    expect(css).not.toMatch(/transition:\s*all/);
    expect(css).not.toMatch(/:hover/);
    expect(css).not.toMatch(/transform/);
  });

  it("uses only theme tokens for colour, so both themes read the same", () => {
    const literal = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .match(/#[0-9a-f]{3,8}\b|rgba?\(/gi);
    expect(literal).toBeNull();
  });
});

describe("source hygiene", () => {
  it("has no stub link and no hard-coded card text in the page files", () => {
    for (const file of [
      "src/pages/portfolio/index.jsx",
      "src/pages/portfolio/ProjectCard.jsx",
      "src/pages/portfolio/Awards.jsx",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/href=["']#["']/);
      expect(source, file).not.toMatch(/picsum|Under Construction/);
      expect(source, file).toMatch(/\buseT\(/);
    }
    expect(read("src/pages/portfolio/index.jsx")).toMatch(
      /usePageMeta\(\s*getPageMeta\(/,
    );
  });

  it("lints clean: the page, the registry, the header, About and the SEO entry", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const results = await eslint.lintFiles([
      "src/pages/portfolio",
      "src/pages/about/index.jsx",
      "src/header/index.jsx",
      "src/content/projects.js",
      "src/content/awards.js",
      "src/content/en/projects.js",
      "src/content/tr/projects.js",
      "src/content/en/awards.js",
      "src/content/tr/awards.js",
      "src/content/en/featuredRepos.js",
      "src/content/tr/featuredRepos.js",
      "src/seo/pages/portfolio.js",
    ]);
    const findings = results.flatMap(({ filePath, messages }) =>
      messages.map(
        ({ ruleId, line }) =>
          `${filePath.slice(ROOT.length)}:${line} ${ruleId}`,
      ),
    );
    expect(findings).toEqual([]);
  }, 30_000);
});
