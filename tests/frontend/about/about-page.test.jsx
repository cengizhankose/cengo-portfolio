// About page semantics: SEO-13 (heading outline, skills as a list), FE-27
// (stable structure, fixed headings), SEO-20 / DSG-34 (no lang="5", Services
// in the same 5/7 grid) and the corrected section titles (MKT-09, DSG-23).
// W6-MKT-about-positioning (MKT-05, MKT-15, MKT-04, SEO-18) grew the outline
// to eight sections and turned the skills into five groups of chips.
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { getContent } from "../../../src/content/index.js";
import { About } from "../../../src/pages/about";

const { services, skills } = getContent("en");

function renderAbout() {
  return render(
    <MemoryRouter initialEntries={["/about"]}>
      <About />
    </MemoryRouter>,
  );
}

const headingTags = () =>
  [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((heading) =>
    heading.tagName.toLowerCase(),
  );

// BCP 47 language tags the site uses (T-12).
const VALID_LANGS = new Set(["en", "tr"]);

describe("About heading outline (SEO-13, FE-27, MKT-15)", () => {
  it("renders one h1, an h2 per section and h3s below them, without skipping a level", () => {
    renderAbout();

    expect(headingTags()).toEqual([
      "h1",
      "h2", // story
      "h2", // proof
      "h3", // worked with
      "h3", // hackathon wins (references stay hidden: none exist)
      "h2", // work timeline
      "h3", // additional ventures
      "h2", // skills
      "h2", // services
      ...services.map(() => "h3"),
      "h2", // hackathons and awards
      "h2", // talks and workshops
      "h2", // call to action
    ]);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelectorAll("h2")).toHaveLength(8);
  });

  it("names the sections without typos, in sentence case", () => {
    renderAbout();

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      "A bit about myself",
      "Where I’ve worked and what I’ve won",
      "Work timeline",
      "Skills",
      "Services",
      "Hackathons and awards",
      "Talks and workshops",
      "Let’s work together",
    ]);
    expect(document.body.textContent).not.toMatch(/Timline|abit about|my self/);
  });

  it("keeps the previous visual sizes through the h3 / h5 classes", () => {
    renderAbout();

    for (const heading of document.querySelectorAll("h2")) {
      expect(heading).toHaveClass("h3");
    }
    for (const heading of document.querySelectorAll(".service_ h3")) {
      expect(heading).toHaveClass("h5", "service__title");
    }
  });

  it("lists the skills as five named groups of chips, none of them a heading", () => {
    renderAbout();

    const groups = document.querySelectorAll(".skill-groups > li");
    expect(groups).toHaveLength(5);
    expect(groups).toHaveLength(skills.length);
    expect(
      [...groups].map(
        (li) => li.querySelector(".skill-group__name").textContent,
      ),
    ).toEqual(skills.map((group) => group.name));
    expect(
      [...document.querySelectorAll(".skill-chip")].map((li) => li.textContent),
    ).toEqual(skills.flatMap((group) => group.items));
    // Each chip list is named by its group label.
    for (const list of document.querySelectorAll(".skill-group__items")) {
      const label = document.getElementById(
        list.getAttribute("aria-labelledby"),
      );
      expect(label).toBe(list.previousElementSibling);
    }
    expect(
      document.querySelectorAll(".skill-groups :is(h1, h2, h3, h4, h5, h6)"),
    ).toHaveLength(0);
    // No percentage bars any more (MKT-05 step 3).
    expect(
      document.querySelectorAll(".progress-item, [role=progressbar]"),
    ).toHaveLength(0);
  });
});

describe("About grid and attributes (SEO-20, DSG-34, FE-28)", () => {
  it('has no lang="5" and only valid lang values', () => {
    renderAbout();

    expect(document.querySelector('[lang="5"]')).toBeNull();
    for (const element of document.body.querySelectorAll("[lang]")) {
      expect(VALID_LANGS.has(element.lang)).toBe(true);
    }
  });

  it("puts all seven section titles, Services included, in a col-lg-5 column", () => {
    renderAbout();

    expect(document.querySelectorAll(".section-gap > .col-lg-5")).toHaveLength(
      7,
    );
    const services = screen.getByRole("heading", {
      level: 2,
      name: "Services",
    });
    expect(services.parentElement).toHaveClass("col-lg-5");
  });

  it("uses the Bootstrap 5 names for the divider alignment", () => {
    renderAbout();

    const divider = document.querySelector("hr.section-rule");
    expect(divider).toHaveClass("ms-0", "text-start");
    expect(divider).not.toHaveClass("ml-0");
    expect(divider).not.toHaveClass("text-left");
  });

  it("passes the axe heading, list and lang rules", async () => {
    const { container } = renderAbout();

    const results = await axe.run(container, {
      runOnly: {
        type: "rule",
        values: [
          "heading-order",
          "empty-heading",
          "list",
          "listitem",
          "valid-lang",
          "th-has-data-cells",
          "td-has-header",
          "td-headers-attr",
          "scope-attr-valid",
          "aria-valid-attr-value",
          "link-name",
        ],
      },
      resultTypes: ["violations"],
    });

    expect(results.violations.map(({ id }) => id)).toEqual([]);
  });
});
