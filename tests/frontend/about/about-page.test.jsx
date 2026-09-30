// About page semantics: SEO-13 (heading outline, skills as a list), FE-27
// (stable structure, fixed headings), SEO-20 / DSG-34 (no lang="5", Services
// in the same 5/7 grid) and the corrected section titles (MKT-09, DSG-23).
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

describe("About heading outline (SEO-13, FE-27)", () => {
  it("renders h1, four section h2s and one h3 per service, without skipping a level", () => {
    renderAbout();

    expect(headingTags()).toEqual([
      "h1",
      "h2",
      "h2",
      "h2",
      "h2",
      ...services.map(() => "h3"),
    ]);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelectorAll("h2")).toHaveLength(4);
  });

  it("names the sections without typos, in sentence case", () => {
    renderAbout();

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["A bit about myself", "Work timeline", "Skills", "Services"]);
    expect(document.body.textContent).not.toMatch(/Timline|abit about|my self/);
  });

  it("keeps the previous visual sizes through the h3 / h5 classes", () => {
    renderAbout();

    for (const heading of document.querySelectorAll("h2")) {
      expect(heading).toHaveClass("h3", "color_sec");
    }
    for (const heading of document.querySelectorAll("h3")) {
      expect(heading).toHaveClass("h5", "service__title");
    }
  });

  it("lists the skills as five list items, none of them a heading", () => {
    renderAbout();

    const items = document.querySelectorAll(".skills-list li");
    expect(items).toHaveLength(5);
    expect(items).toHaveLength(skills.length);
    expect([...items].map((li) => li.textContent)).toEqual(
      skills.map((skill) => skill.name),
    );
    expect(
      document.querySelectorAll(
        "h1.progress-title, h2.progress-title, h3.progress-title, h4.progress-title, h5.progress-title, h6.progress-title",
      ),
    ).toHaveLength(0);
    expect(screen.getAllByRole("list")).toHaveLength(1);
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

  it("puts all four section titles, Services included, in a col-lg-5 column", () => {
    renderAbout();

    expect(document.querySelectorAll(".sec_sp > .col-lg-5")).toHaveLength(4);
    const services = screen.getByRole("heading", {
      level: 2,
      name: "Services",
    });
    expect(services.parentElement).toHaveClass("col-lg-5");
  });

  it("uses the Bootstrap 5 names for the divider alignment", () => {
    renderAbout();

    const divider = document.querySelector("hr.t_border");
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
        ],
      },
      resultTypes: ["violations"],
    });

    expect(results.violations.map(({ id }) => id)).toEqual([]);
  });
});
