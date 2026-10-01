// One portfolio card in isolation (FE-04 step 10, DSG-08 steps 4 and 5, DSG-29):
// the responsive <picture> when the record has an image, the text card when it
// has none, the badge rule and the stack cap.
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ProjectCard, {
  MAX_TAGS,
} from "../../../src/pages/portfolio/ProjectCard.jsx";
import {
  PROJECT_IMAGE,
  projectSrcSet,
} from "../../../src/pages/portfolio/projectImage.js";
import portfolioStyles from "../../../src/pages/portfolio/portfolio.module.css";

vi.mock("../../../src/lib/analytics/index.js", () => ({ track: vi.fn() }));

const project = {
  id: "salesgym",
  order: 1,
  status: "live",
  permission: { required: false },
  stack: ["A", "B", "C", "D", "E", "F", "G"],
  image: { name: "salesgym" },
  links: [{ type: "repo", href: "https://example.org/code" }],
};
const text = {
  id: "salesgym",
  title: "Title",
  awardLabel: "1st place · Event · 2026",
  problem: "P",
  role: "R",
  result: "S",
  imageAlt: "A screen with a video call",
  cta: { repo: "View the code" },
};

const renderCard = (props) =>
  render(
    <MemoryRouter>
      <ProjectCard project={project} text={text} position={1} {...props} />
    </MemoryRouter>,
  );

describe("card image", () => {
  it("draws a 16:10 <picture> with AVIF and WebP sets, size attributes and alt text", () => {
    const { container } = renderCard();

    const picture = container.querySelector("picture");
    const sources = [...picture.querySelectorAll("source")];
    expect(sources.map((source) => source.getAttribute("type"))).toEqual([
      "image/avif",
      "image/webp",
    ]);
    expect(sources[0].getAttribute("srcset")).toBe(
      projectSrcSet("salesgym", "avif"),
    );
    expect(sources[1].getAttribute("srcset")).toBe(
      projectSrcSet("salesgym", "webp"),
    );
    expect(sources[0].getAttribute("srcset")).toBe(
      "/img/projects/salesgym-v1-480.avif 480w, " +
        "/img/projects/salesgym-v1-800.avif 800w, " +
        "/img/projects/salesgym-v1-1280.avif 1280w",
    );
    for (const source of sources) {
      expect(source.getAttribute("sizes")).toBe(PROJECT_IMAGE.sizes);
    }
    const img = picture.querySelector("img");
    expect(img.getAttribute("src")).toBe("/img/projects/salesgym-v1-800.webp");
    expect(img).toHaveAttribute("width", "1280");
    expect(img).toHaveAttribute("height", "800");
    expect(img.getAttribute("width") / img.getAttribute("height")).toBe(1.6);
    expect(img).toHaveAttribute("alt", text.imageAlt);
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });

  it("is a text card when the record has no image", () => {
    const { container } = renderCard({ project: { ...project, image: null } });
    expect(container.querySelector("picture, img")).toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Title",
    );
  });

  it("does not draw an image without alt text", () => {
    const { container } = renderCard({
      text: { ...text, imageAlt: undefined },
    });
    expect(container.querySelector("picture, img")).toBeNull();
  });
});

describe("badge and tags", () => {
  it("prints the badge above the title only when there is a podium", () => {
    const { container, rerender } = renderCard();
    const article = container.querySelector("article");
    const badge = article.querySelector(`.${portfolioStyles.cardAward}`);
    expect(badge.textContent.trim()).toBe(text.awardLabel);
    expect(
      badge.compareDocumentPosition(article.querySelector("h2")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    rerender(
      <MemoryRouter>
        <ProjectCard
          project={project}
          text={{ ...text, awardLabel: undefined }}
          position={1}
        />
      </MemoryRouter>,
    );
    expect(container.querySelector(`.${portfolioStyles.cardAward}`)).toBeNull();
  });

  it("shows at most five stack tags", () => {
    renderCard();
    const list = screen.getByRole("list", { name: "Stack" });
    expect(MAX_TAGS).toBe(5);
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["A", "B", "C", "D", "E"]);
  });
});

describe("links", () => {
  it("draws the label of the link type with a decorative arrow and the new-tab note", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /View the code/ });
    expect(link).toHaveAttribute("href", "https://example.org/code");
    expect(link).toHaveAttribute("data-track", "project");
    expect(link.querySelector('[aria-hidden="true"]').textContent).toBe(" →");
    // The arrow is hidden from assistive technology; the new-tab note ends
    // the name (MKT-23), whatever whitespace the tree computation keeps.
    expect(link.textContent).toBe("View the code → (opens in a new tab)");
    expect(
      screen.getByRole("link", {
        name: /^View the code\s*\(opens in a new tab\)$/,
      }),
    ).toBe(link);
  });

  it("puts hreflang on a link whose page is in another language", () => {
    renderCard({
      project: {
        ...project,
        links: [
          { type: "repo", href: "https://example.org/x", hreflang: "tr" },
        ],
      },
    });
    expect(screen.getByRole("link", { name: /View the code/ })).toHaveAttribute(
      "hreflang",
      "tr",
    );
  });
});
