// The rendered About page (W6-MKT-about-positioning): SEO-18 (enough current
// text), MKT-15 (timeline outcomes, story, archive, call to action), MKT-04
// (ProofStrip on the page, #awards target). English here; the Turkish page is
// in about-tr.test.jsx. Everything runs on the real content files.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getContent } from "../../../src/content/index.js";
import { About } from "../../../src/pages/about";
import aboutStyles from "../../../src/pages/about/about.module.css";
import proofStyles from "../../../src/components/proofstrip/proofstrip.module.css";

const en = getContent("en");

const renderAbout = (path = "/about") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <About />
    </MemoryRouter>,
  );

const words = (element) => element.textContent.trim().split(/\s+/).length;

let scrollIntoView;

beforeEach(() => {
  // jsdom has no scrollIntoView.
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
});

describe("text volume (SEO-18)", () => {
  it("carries at least 320 words of page content", () => {
    const { container } = renderAbout();
    // SEO-18 counts the menu and social links (about 15 words) too; the page
    // alone clears the bar.
    expect(words(container)).toBeGreaterThanOrEqual(320);
  });

  it("no longer shows the 2022 positioning or the retired rows", () => {
    const { container } = renderAbout();
    const text = container.textContent;
    expect(text).not.toMatch(
      /Part time Entrepreneur|two hackathons|CTO of another one|Bootcamp Student|Gamer Pair|Product Manager|-current/,
    );
    // The skills are the CV's groups: no Flutter, no Figma, no percent bars.
    expect(container.querySelector(".skill-groups").textContent).not.toMatch(
      /Flutter|Figma/,
    );
    expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(0);
  });
});

describe("story (MKT-15)", () => {
  it("shows the lead line and the three paragraphs", () => {
    renderAbout();

    expect(screen.getByText(en.about.title)).toHaveClass(aboutStyles.lead);
    for (const paragraph of en.about.story) {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    }
  });
});

describe("work timeline (MKT-05, MKT-15, SEO-18)", () => {
  it("has one entry per role with its outcome under the title row", () => {
    const { container } = renderAbout();

    const bodies = container.querySelectorAll(
      `table.${aboutStyles.timeline} > tbody`,
    );
    expect(bodies).toHaveLength(8);
    bodies.forEach((body, index) => {
      const row = en.timeline[index];
      const [role, outcome] = body.querySelectorAll("tr");
      expect(role.textContent).toContain(row.jobtitle);
      expect(role.textContent).toContain(row.where);
      expect(role.textContent).toContain(row.date);
      expect(outcome.textContent).toBe(row.outcome);
      // The outcome cell is tied to its role header (td-has-header).
      const header = document.getElementById(
        outcome.firstElementChild.getAttribute("headers"),
      );
      expect(header).toBe(role.querySelector("th"));
    });
    // The section is an anchor target (#timeline) and the table is named by
    // a visually hidden caption.
    expect(container.querySelector("#timeline")).toContainElement(
      container.querySelector(`table.${aboutStyles.timeline}`),
    );
    expect(screen.getByRole("table", { name: "Work timeline" })).toBe(
      container.querySelector(`table.${aboutStyles.timeline}`),
    );
  });

  it("lists the side projects without dates under Additional ventures", () => {
    const { container } = renderAbout();

    const items = container.querySelectorAll(`.${aboutStyles.ventures} > li`);
    expect(
      [...items].map(
        (li) => li.querySelector(`.${aboutStyles.ventureName}`).textContent,
      ),
    ).toEqual(["HyperCut", "Courline", "777senselabs"]);
    expect(
      container.querySelector(`.${aboutStyles.ventures}`).textContent,
    ).not.toMatch(/\b(19|20)\d{2}\b/);
    // 777senselabs has no description in the CV: none is invented.
    expect(items[2].querySelector(`.${aboutStyles.ventureText}`)).toBeNull();
  });
});

describe("ProofStrip on the page (MKT-04)", () => {
  it("shows the four first places as links and the four employers", () => {
    const { container } = renderAbout();

    const awards = container.querySelectorAll(`.${proofStyles.proofAwards} li`);
    expect(awards).toHaveLength(4);
    expect(
      [...awards].map((li) => li.querySelector("a").getAttribute("href")),
    ).toEqual(en.proof.awards.map((award) => award.url));
    // The evidence links open in a new tab (ExternalLink, MKT-23): the
    // hidden note ends the text.
    expect(awards[0].textContent).toBe(
      "ConvoAI World Istanbul (Agora Voice AI Hackathon) · 2026 · 1st place · SalesGym (opens in a new tab)",
    );
    expect(awards[0].querySelector("a")).toHaveAttribute("target", "_blank");
    expect(
      [...container.querySelectorAll(`.${proofStyles.proofCompanies} li`)].map(
        (li) => li.textContent,
      ),
    ).toEqual(["Monster Notebook", "Drivee Teknoloji", "MakasApp", "Fitmondo"]);
  });

  it("invents no reference: no blockquote, no References label", () => {
    const { container } = renderAbout();

    expect(container.querySelectorAll("figure blockquote")).toHaveLength(0);
    expect(screen.queryByText("References")).toBeNull();
  });

  it("links '10 podiums since 2021 → See all' to the archive on the same page", () => {
    renderAbout();

    const link = screen.getByRole("link", {
      name: "10 podiums since 2021 → See all",
    });
    expect(link).toHaveAttribute("href", "/about#awards");
    expect(document.getElementById("awards")).not.toBeNull();
  });
});

describe("hackathon archive and talks (MKT-04, MKT-15)", () => {
  it("lists the nine shown records in #awards and keeps IstanHack out", () => {
    const { container } = renderAbout();

    const archive = container.querySelector(
      `#awards .${aboutStyles.awardsArchive}`,
    );
    const items = archive.querySelectorAll("li");
    expect(items).toHaveLength(9);
    expect(items[0].textContent).toContain("ConvoAI World Istanbul");
    expect(items[8].textContent).toContain("Game Pair");
    expect(container.textContent).not.toMatch(/IstanHack/);
    // Eight records have public evidence and are links; MultiversX is text.
    expect(archive.querySelectorAll("a")).toHaveLength(8);
    const multiversx = [...items].find((li) =>
      li.textContent.includes("MultiversX"),
    );
    expect(multiversx.querySelector("a")).toBeNull();
    expect(multiversx.textContent).toContain("Avenrise");
  });

  it("links every talk to its post", () => {
    const { container } = renderAbout();

    const links = container.querySelectorAll(`#talks .${aboutStyles.talks} a`);
    expect(links).toHaveLength(6);
    expect([...links].map((a) => a.getAttribute("href"))).toEqual(
      en.about.talks.map((talk) => talk.url),
    );
  });

  it("scrolls #awards into view when the URL carries the hash", () => {
    renderAbout("/about#awards");

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0].id).toBe("awards");
  });

  it("scrolls there when the 'See all' link is followed, and not without a hash", () => {
    renderAbout();
    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("link", { name: "10 podiums since 2021 → See all" }),
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0].id).toBe("awards");
  });

  it("ignores a hash that matches nothing or is malformed", () => {
    renderAbout("/about#no-such-id");
    renderAbout("/about#%E0%A4%A");

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("closing call to action (MKT-15 step 7)", () => {
  it("ends on a section that links to the contact page", () => {
    const { container } = renderAbout();

    const sections = container.querySelectorAll("section");
    const last = sections[sections.length - 1];
    expect(last).toBe(container.querySelector(`section.${aboutStyles.cta}`));
    expect(container.lastElementChild.lastElementChild).toBe(last);

    const link = within(last).getByRole("link", {
      name: "Tell me what you’re building",
    });
    expect(link.getAttribute("href")).toMatch(/\/contact$/);
    expect(
      within(last).getByRole("heading", {
        level: 2,
        name: "Let’s work together",
      }),
    ).toBeInTheDocument();
  });
});
