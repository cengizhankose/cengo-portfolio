// The Turkish About page (W6-MKT-about-positioning). /tr/about is still a 404
// until W11 adds 'tr' to LIVE.static, so the route table is mocked as it will
// be after that edit (the same way i18n-routing-tr-live.test.jsx does it): the
// page must already be complete in Turkish, with the same facts as the
// English page (SEO-18, MKT-04 "derece metinleri TR", MKT-15).
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import aboutStyles from "../../../src/pages/about/about.module.css";
import proofStyles from "../../../src/components/proofstrip/proofstrip.module.css";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});

const { getContent } = await import("../../../src/content/index.js");
const { DICTIONARIES } = await import("../../../src/i18n/translate.js");
const { About } = await import("../../../src/pages/about");

const tr = getContent("tr");
const T = DICTIONARIES.tr;

const renderAbout = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <About />
    </MemoryRouter>,
  );

const words = (element) => element.textContent.trim().split(/\s+/).length;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("/tr/about", () => {
  it("carries at least 320 words of Turkish page content (SEO-18)", () => {
    const { container } = renderAbout("/tr/about");

    expect(words(container)).toBeGreaterThanOrEqual(320);
  });

  it("names the sections in Turkish", () => {
    renderAbout("/tr/about");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      T["about.title"],
    );
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      T["about.intro"],
      T["about.proof"],
      T["about.timeline"],
      T["about.skills"],
      T["about.services"],
      T["about.awards"],
      T["about.talks"],
      T["about.cta.title"],
    ]);
  });

  it("tells the same story in Turkish: lead, paragraphs, outcomes", () => {
    const { container } = renderAbout("/tr/about");

    expect(screen.getByText(tr.about.title)).toHaveClass(aboutStyles.lead);
    for (const paragraph of tr.about.story) {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    }
    const bodies = container.querySelectorAll(
      `table.${aboutStyles.timeline} > tbody`,
    );
    expect(bodies).toHaveLength(8);
    bodies.forEach((body, index) => {
      expect(body.querySelectorAll("tr")[1].textContent).toBe(
        tr.timeline[index].outcome,
      );
    });
    expect(
      container.querySelector(`table.${aboutStyles.timeline}`).textContent,
    ).toContain("2026 – günümüz");
  });

  it("groups the skills in Turkish", () => {
    const { container } = renderAbout("/tr/about");

    expect(
      [...container.querySelectorAll(`.${aboutStyles.skillGroupName}`)].map(
        (p) => p.textContent,
      ),
    ).toEqual([
      "Frontend",
      "Mobil",
      "Backend ve veri",
      "Gerçek zamanlı ve yapay zekâ",
      "Teslim ve kalite",
    ]);
  });

  it("writes the results in Turkish and links within /tr", () => {
    const { container } = renderAbout("/tr/about");

    const awards = container.querySelectorAll(`.${proofStyles.proofAwards} li`);
    expect(awards).toHaveLength(4);
    expect(awards[1].textContent).toBe(
      "AlgoHack Istanbul (Algorand Foundation × Rise In) · 2025 · Open Innovation Track birinciliği · Farmin (yeni sekmede açılır)",
    );
    expect(container.querySelector("#awards").textContent).not.toMatch(
      /1st place|2nd place|3rd place/,
    );
    expect(
      container.querySelectorAll(`#awards .${aboutStyles.awardsArchive} li`),
    ).toHaveLength(9);
    expect(
      screen.getByRole("link", {
        name: "2021’den bu yana 10 podyum → Tümünü gör",
      }),
    ).toHaveAttribute("href", "/tr/about#awards");
    // W13: the archive points to the podiums with photos on /tr/portfolio.
    expect(
      screen.getByRole("link", { name: /Fotoğraflarıyla portfolyoda gör/ }),
    ).toHaveAttribute("href", "/tr/portfolio#awards");
  });

  it("ends on the Turkish call to action pointing at /tr/contact", () => {
    const { container } = renderAbout("/tr/about");

    const sections = container.querySelectorAll("section");
    const last = sections[sections.length - 1];
    const link = within(last).getByRole("link", {
      name: "Ne geliştirdiğini anlat",
    });
    expect(link).toHaveAttribute("href", "/tr/contact");
  });

  it("still serves English at /about while TR is open", () => {
    renderAbout("/about");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      DICTIONARIES.en["about.title"],
    );
    expect(
      screen.getByRole("link", { name: "Tell me what you’re building" }),
    ).toHaveAttribute("href", "/contact");
  });
});
