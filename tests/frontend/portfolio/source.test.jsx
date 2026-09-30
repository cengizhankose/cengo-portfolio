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

const css = read("src/pages/portfolio/style.css");

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
    expect(projectLinks).toHaveLength(9);
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
  it("lays the cards out as an auto-fill grid of 18rem columns with a 2rem gap", () => {
    expect(declared(css, ".project-grid")).toMatchObject({
      display: "grid",
      "grid-template-columns": "repeat(auto-fill, minmax(18rem, 1fr))",
      gap: "2rem",
    });
  });

  it("keeps the image box 16:10 and cropped", () => {
    expect(declared(css, ".project-card__media")).toMatchObject({
      "aspect-ratio": "16 / 10",
    });
    expect(declared(css, ".project-card__media img")).toMatchObject({
      "object-fit": "cover",
    });
  });

  it("draws the badge monochrome from the theme tokens", () => {
    const badge = declared(css, ".project-card__award");
    expect(badge["border-radius"]).toBe("0.75rem");
    expect(badge.border).toBe("1px solid var(--border-color)");
    expect(badge.color).toBe("var(--text-color)");
  });

  it("moves the image on hover only when motion is allowed, and never uses transition: all", () => {
    expect(css).not.toMatch(/transition:\s*all/);
    const gated = declared(
      css,
      ".project-card:hover .project-card__media img",
      "(prefers-reduced-motion: no-preference)",
    );
    expect(gated.transform).toBe("scale(1.03)");
    expect(
      declared(css, ".project-card:hover .project-card__media img"),
    ).toEqual({});
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
      "src/content/en/projects.js",
      "src/content/tr/projects.js",
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
