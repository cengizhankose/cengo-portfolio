// The rendered portfolio in both languages (FE-04 Aşama B, DSG-08, MKT-01,
// ANL-11, MKT-18, W13 redesign: case screenshots and the hackathon podiums).
// The route table is mocked as after SEO-11 Adım B to render /tr/portfolio.
// Analytics is mocked: the test reads what each link would send.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import portfolioStyles from "../../../src/pages/portfolio/portfolio.module.css";

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
const { awardRecord } = await import("../../../src/content/awards.js");
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
const cards = () => [
  ...document.querySelectorAll(`article.${portfolioStyles.card}`),
];
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

  it("every case has an h2, a summary, problem / what I built / result, tags and a real link", () => {
    renderPage(path);

    for (const card of cards()) {
      const text = content.projects.find(
        (entry) => entry.id === card.dataset.projectId,
      );
      const heading = within(card).getByRole("heading", { level: 2 });
      expect(heading.textContent).toBe(text.title);
      expect(card).toHaveAccessibleName(text.title);
      expect(
        card.querySelector(`.${portfolioStyles.cardSummary}`).textContent,
      ).toBe(text.summary);

      const terms = [...card.querySelectorAll("dt")].map(
        (dt) => dt.textContent,
      );
      expect(terms).toEqual([
        t("portfolio.problem"),
        t("portfolio.built"),
        t("portfolio.result"),
      ]);
      const definitions = [...card.querySelectorAll("dd")].map(
        (dd) => dd.textContent,
      );
      expect(definitions).toEqual([text.problem, text.built, text.result]);

      const links = within(card).getAllByRole("link");
      expect(links.length).toBeGreaterThanOrEqual(1);
      for (const link of links) {
        expect(link.getAttribute("href")).toMatch(/^https:\/\//);
        expect(link.getAttribute("href")).not.toBe("#");
      }
      expect(
        card.querySelectorAll(`.${portfolioStyles.cardTags} li`).length,
      ).toBeLessThanOrEqual(5);
    }
  });

  it("the badge is on the two podium cases only (DSG-08 criterion 4)", () => {
    renderPage(path);

    const badges = [
      ...document.querySelectorAll(`.${portfolioStyles.cardAward}`),
    ];
    expect(badges).toHaveLength(2);
    expect(
      badges.map((badge) => badge.closest("article").dataset.projectId),
    ).toEqual(["salesgym", "farmin"]);
    expect(badges[0].textContent.trim()).toBe(content.projects[0].awardLabel);
    expect(
      document
        .querySelector('[data-project-id="effort_lab"]')
        .querySelector(`.${portfolioStyles.cardAward}`),
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

  it("shows each case's own screenshot: the first loads at once, the rest lazily (W13)", () => {
    renderPage(path);

    cards().forEach((card, index) => {
      const text = content.projects.find(
        (entry) => entry.id === card.dataset.projectId,
      );
      const img = card.querySelector("picture img");
      expect(img, card.dataset.projectId).not.toBeNull();
      expect(img).toHaveAttribute("alt", text.imageAlt);
      expect(img).toHaveAttribute("loading", index === 0 ? "eager" : "lazy");
      expect(img).toHaveAttribute("decoding", "async");
      // The case number is decoration.
      const number = card.querySelector(`.${portfolioStyles.cardIndex}`);
      expect(number.textContent).toBe(`0${index + 1}`);
      expect(number).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("follows the cases with the hackathon podiums under #awards (MKT-01 step 3, W13)", () => {
    renderPage(path);

    const section = screen
      .getByRole("heading", {
        level: 2,
        name: t("portfolio.awards.title", { count: content.awards.length }),
      })
      .closest("section");
    expect(section.id).toBe("awards");
    expect(section.closest("article")).toBeNull();
    expect(section.textContent).toContain(t("portfolio.awards.text"));
    // After the last case, before the selected repos.
    expect(
      cards().at(-1).compareDocumentPosition(section) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // "10 podiums" is the archive's own count; nine are shown.
    expect(content.awards).toHaveLength(10);
    const visible = content.awards.filter((award) => !award.hidden);
    const tiles = [...section.querySelectorAll("li[data-award-id]")];
    expect(tiles.map((tile) => tile.dataset.awardId)).toEqual(
      visible.map((award) => award.id),
    );
    expect(section.textContent).not.toMatch(/IstanHack/);

    for (const [index, tile] of tiles.entries()) {
      const award = visible[index];
      const record = awardRecord(award.id);
      expect(within(tile).getByRole("heading", { level: 3 })).toHaveTextContent(
        award.event,
      );
      for (const part of [award.place, award.project, award.summary]) {
        expect(tile.textContent, award.id).toContain(part);
      }
      expect(tile.textContent).toContain(String(award.year));

      const link = within(tile).getByRole("link");
      expect(link).toHaveAttribute("href", award.url);
      expect(link.textContent).toContain(award.linkLabel);
      if (record.hreflang) {
        expect(link).toHaveAttribute("hreflang", record.hreflang);
      } else {
        expect(link).not.toHaveAttribute("hreflang");
      }

      const img = tile.querySelector("img");
      if (record.image) {
        // The photo from the owner's post: alt text, square, lazy.
        expect(img, award.id).not.toBeNull();
        expect(img).toHaveAttribute("alt", award.imageAlt);
        expect(img).toHaveAttribute("loading", "lazy");
        expect(img).toHaveAttribute("decoding", "async");
        expect(img.getAttribute("width")).toBe(img.getAttribute("height"));
        expect(img.getAttribute("src")).toMatch(
          new RegExp(`^/img/awards/${record.image.name}-v1-\\d+\\.webp$`),
        );
        expect(tile.querySelectorAll("source")).toHaveLength(2);
      } else {
        // No photo: the place as a numeral, hidden from assistive technology.
        expect(img, award.id).toBeNull();
        const numeral = tile.querySelector("svg");
        expect(numeral).toHaveAttribute("aria-hidden", "true");
        expect(numeral.textContent).toBe(String(record.rank));
      }
    }
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
    expect(section.querySelector(`.${portfolioStyles.repoLearned}`)).toBeNull();
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
      // One per shown podium (W13): the evidence links of #awards.
      ...content.awards
        .filter((award) => !award.hidden)
        .map(() => [
          "project_clicked",
          { project_id: "hackathon_archive", link_type: "post", position: 4 },
        ]),
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

  it("uses one h1, h2 for the cases and sections, h3 only for the podiums (heading order)", () => {
    renderPage(path);

    const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")];
    const levels = headings.map((heading) => Number(heading.tagName[1]));
    expect(levels[0]).toBe(1);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    // No level is skipped on the way down.
    levels.slice(1).forEach((level, index) => {
      expect(level - levels[index]).toBeLessThanOrEqual(1);
    });
    expect(Math.max(...levels)).toBe(3);
    for (const heading of headings.filter((h) => h.tagName === "H3")) {
      expect(heading.closest("#awards li[data-award-id]")).not.toBeNull();
    }
  });
});
