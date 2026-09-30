// The rendered portfolio in both languages (FE-04 Aşama B, DSG-08, MKT-01,
// ANL-11, MKT-18). The TR pages are not live yet (LIVE.static = ['en']), so the
// route table is mocked as after SEO-11 Adım B to render /tr/portfolio.
// Analytics is mocked: the test reads what each link would send.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});
vi.mock("../../../src/lib/analytics/index.js", () => ({ track: vi.fn() }));

const { Portfolio } = await import("../../../src/pages/portfolio");
const { default: Headermain } = await import("../../../src/header");
const { getContent } = await import("../../../src/content/index.js");
const { PROJECTS, FEATURED_REPOS } =
  await import("../../../src/content/projects.js");
const { translate } = await import("../../../src/i18n/translate.js");
const { track } = await import("../../../src/lib/analytics/index.js");
const { sanitizeProps } = await import("../../../src/lib/analytics/events.js");

const renderPage = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Portfolio />
    </MemoryRouter>,
  );

const words = (element) => element.textContent.trim().split(/\s+/).length;
const cards = () => [...document.querySelectorAll("article.project-card")];
const externalLinks = (root = document) => [
  ...root.querySelectorAll('a[href^="http"]'),
];

beforeEach(() => {
  track.mockReset();
  document.head.innerHTML = "<title>x</title>";
});

describe.each([
  ["/portfolio", "en", "/about#awards", "/contact"],
  ["/tr/portfolio", "tr", "/tr/about#awards", "/tr/contact"],
])("%s", (path, locale, archiveHref, contactHref) => {
  const content = getContent(locale);
  const t = (key, vars) => translate(locale, key, vars);

  it("has one h1 and never says Under Construction (FE-04 criterion 1)", () => {
    const { container } = renderPage(path);

    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      t("portfolio.title"),
    );
    expect(container.textContent).not.toMatch(
      /Under Construction|Yapım aşamasında/i,
    );
  });

  it("shows exactly the three featured cases in order (FE-04, DSG-08, ANL-11)", () => {
    renderPage(path);

    expect(cards().map((card) => card.dataset.projectId)).toEqual([
      "salesgym",
      "farmin",
      "effort_lab",
    ]);
    // The page has no other data-project-id carrier.
    expect(document.querySelectorAll("[data-project-id]")).toHaveLength(3);
  });

  it("every card has an h2, problem / role / result, tags and a real link", () => {
    renderPage(path);

    for (const card of cards()) {
      const text = content.projects.find(
        (entry) => entry.id === card.dataset.projectId,
      );
      const heading = within(card).getByRole("heading", { level: 2 });
      expect(heading.textContent).toBe(text.title);
      expect(card).toHaveAccessibleName(text.title);

      const terms = [...card.querySelectorAll("dt")].map(
        (dt) => dt.textContent,
      );
      expect(terms).toEqual([
        t("portfolio.problem"),
        t("portfolio.role"),
        t("portfolio.result"),
      ]);
      const definitions = [...card.querySelectorAll("dd")].map(
        (dd) => dd.textContent,
      );
      expect(definitions).toEqual([text.problem, text.role, text.result]);

      const links = within(card).getAllByRole("link");
      expect(links.length).toBeGreaterThanOrEqual(1);
      for (const link of links) {
        expect(link.getAttribute("href")).toMatch(/^https:\/\//);
        expect(link.getAttribute("href")).not.toBe("#");
      }
      expect(
        card.querySelectorAll(".project-card__tags li").length,
      ).toBeLessThanOrEqual(5);
    }
  });

  it("the badge is on the two podium cases only (DSG-08 criterion 4)", () => {
    renderPage(path);

    const badges = [...document.querySelectorAll(".project-card__award")];
    expect(badges).toHaveLength(2);
    expect(
      badges.map((badge) => badge.closest("article").dataset.projectId),
    ).toEqual(["salesgym", "farmin"]);
    expect(badges[0].textContent.trim()).toBe(content.projects[0].awardLabel);
    expect(
      document
        .querySelector('[data-project-id="effort_lab"]')
        .querySelector(".project-card__award"),
    ).toBeNull();
    // The trophy is decoration.
    for (const badge of badges) {
      expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("links to other sites open in a new tab with noopener and tell assistive technology (MKT-23)", () => {
    renderPage(path);

    for (const link of externalLinks()) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toMatch(/noopener/);
      expect(link.getAttribute("rel")).toMatch(/noreferrer/);
      expect(link.querySelector(".visually-hidden")).not.toBeNull();
    }
    // The owner's own GitHub profile carries rel=me.
    const profile = screen.getByRole("link", {
      name: new RegExp(t("portfolio.repos.all")),
    });
    expect(profile.getAttribute("href")).toBe(
      "https://github.com/cengizhankose",
    );
    expect(profile.getAttribute("rel")).toMatch(/\bme\b/);
  });

  it("labels the effort comparison as Turkish with hreflang (MKT-14)", () => {
    renderPage(path);

    const link = screen.getByRole("link", {
      name: new RegExp(content.projects[2].cta.demo.replace(/[()]/g, "\\$&")),
    });
    expect(link).toHaveAttribute("href", "https://effort.cengizhankose.com");
    expect(link).toHaveAttribute("hreflang", "tr");
  });

  it("names Efe Akkurt on the Farmin card", () => {
    renderPage(path);

    expect(
      document.querySelector('[data-project-id="farmin"]').textContent,
    ).toContain("Efe Akkurt");
  });

  it("closes the cases with the hackathon archive and the awards link (MKT-01 step 3)", () => {
    renderPage(path);

    const section = screen
      .getByRole("heading", {
        level: 2,
        name: t("portfolio.archive.title", { count: content.awards.length }),
      })
      .closest("section");
    expect(section.closest("article")).toBeNull();
    expect(
      within(section).getByRole("link", {
        name: new RegExp(t("portfolio.archive.cta")),
      }),
    ).toHaveAttribute("href", archiveHref);
    expect(section.textContent).toContain(t("portfolio.archive.text"));
    // "10 podiums" is the awards archive's own count.
    expect(content.awards).toHaveLength(10);
  });

  it("lists the three selected repos under their own h2, with the profile link (MKT-18)", () => {
    renderPage(path);

    const heading = screen.getByRole("heading", {
      level: 2,
      name: t("portfolio.repos.title"),
    });
    const section = heading.closest("section");
    const links = within(section)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(links).toEqual([
      ...FEATURED_REPOS.map((repo) => repo.href),
      "https://github.com/cengizhankose",
    ]);
    for (const repo of content.featuredRepos) {
      expect(section.textContent).toContain(repo.what);
    }
    // No "what I learned" line until the owner writes one.
    expect(section.querySelector(".repo-list__learned")).toBeNull();
  });

  it("the menu has one portfolio link in the page's language (FE-04 exit)", () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Headermain />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: t("nav.label") });

    const links = within(nav).getAllByRole("link", {
      name: t("nav.portfolio"),
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      "href",
      locale === "en" ? "/portfolio" : "/tr/portfolio",
    );
  });

  it("ends on the contact link (MKT-01 criterion 5)", () => {
    const { container } = renderPage(path);

    const link = container.querySelector(`a[href$="/contact"]`);
    expect(link.getAttribute("href")).toBe(contactHref);
    expect(link.textContent).toContain(t("portfolio.contact.cta"));
    const all = [...container.querySelectorAll("a")];
    expect(all.at(-1)).toBe(link);
  });

  it("carries at least 300 words (SEO-14 exit criterion)", () => {
    const { container } = renderPage(path);
    expect(words(container)).toBeGreaterThanOrEqual(300);
  });

  it("a card without an image is a text card: no img, no empty picture", () => {
    renderPage(path);

    for (const project of PROJECTS.filter((p) => p.order !== null)) {
      if (project.image) continue;
      const card = document.querySelector(`[data-project-id="${project.id}"]`);
      expect(card.querySelector("picture, img")).toBeNull();
    }
  });

  it("ANL-11: every project link is project_clicked with id, type and position, and is not outbound-tracked", async () => {
    const user = userEvent.setup();
    renderPage(path);
    // The links are real navigations; keep jsdom from trying them.
    document.addEventListener("click", (event) => event.preventDefault());

    const sent = [];
    for (const link of document.querySelectorAll('a[data-track="project"]')) {
      await user.click(link);
      sent.push(track.mock.lastCall);
    }
    expect(sent).toEqual([
      [
        "project_clicked",
        { project_id: "salesgym", link_type: "repo", position: 1 },
      ],
      [
        "project_clicked",
        { project_id: "salesgym", link_type: "demo", position: 1 },
      ],
      [
        "project_clicked",
        { project_id: "farmin", link_type: "repo", position: 2 },
      ],
      [
        "project_clicked",
        { project_id: "farmin", link_type: "post", position: 2 },
      ],
      [
        "project_clicked",
        { project_id: "effort_lab", link_type: "demo", position: 3 },
      ],
      [
        "project_clicked",
        {
          project_id: "hackathon_archive",
          link_type: "case_study",
          position: 4,
        },
      ],
      [
        "project_clicked",
        { project_id: "voxly", link_type: "repo", position: 5 },
      ],
      [
        "project_clicked",
        { project_id: "road_to_doomsday", link_type: "repo", position: 6 },
      ],
      [
        "project_clicked",
        { project_id: "bubble_writer", link_type: "repo", position: 7 },
      ],
    ]);
    expect(track).toHaveBeenCalledTimes(sent.length);
    // The catalogue keeps every property (nothing is dropped as unknown).
    for (const [name, props] of sent) {
      expect(sanitizeProps(name, props)).toEqual(props);
    }
  });

  it("a middle click counts too, a right click does not", async () => {
    renderPage(path);
    const link = document.querySelector('a[data-track="project"]');

    link.dispatchEvent(
      new MouseEvent("auxclick", { bubbles: true, button: 2 }),
    );
    expect(track).not.toHaveBeenCalled();
    link.dispatchEvent(
      new MouseEvent("auxclick", { bubbles: true, button: 1 }),
    );
    expect(track).toHaveBeenCalledWith("project_clicked", {
      project_id: "salesgym",
      link_type: "repo",
      position: 1,
    });
  });

  it("only the selected-repos profile link and the contact link are left to the outbound listener or untracked", () => {
    renderPage(path);

    const outbound = externalLinks().filter(
      (link) => link.dataset.track !== "project",
    );
    // The GitHub profile (ANL-09 counts it as a github click).
    expect(outbound.map((link) => link.getAttribute("href"))).toEqual([
      "https://github.com/cengizhankose",
    ]);
    expect(outbound[0].closest("[data-analytics-location]")).not.toBeNull();
  });

  it("passes axe (structure, names, lists; contrast stays with the browser run)", async () => {
    renderPage(path);

    const results = await axe.run(document.body, {
      runOnly: {
        type: "rule",
        values: [
          "link-name",
          "image-alt",
          "list",
          "listitem",
          "definition-list",
          "dlitem",
          "heading-order",
          "aria-allowed-attr",
          "aria-valid-attr-value",
          "duplicate-id",
          "landmark-unique",
        ],
      },
      resultTypes: ["violations"],
    });
    expect(
      results.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target.join(" ")),
      })),
    ).toEqual([]);
  });

  it("uses h1, then only h2 (heading order)", () => {
    renderPage(path);

    const levels = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(
      (heading) => Number(heading.tagName[1]),
    );
    expect(levels[0]).toBe(1);
    expect(levels.slice(1).every((level) => level === 2)).toBe(true);
  });
});
