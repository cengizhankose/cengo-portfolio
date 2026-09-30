// K-06b hero: SEO-12, FE-23, DSG-09 (static h1 with name + role), PERF-12 /
// DSG-07 (one rotating line outside the h1, aria-hidden, last phrase for
// screen readers), content from 00-icerik-girdileri §2.4 in EN and TR.
// The TR pages are not live yet (LIVE.static = ['en']), so the route table
// is mocked as after SEO-11 Adım B to render /tr.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { read } from "./support.js";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});

const { Home } = await import("../../../src/pages/home/index.jsx");
const { getContent } = await import("../../../src/content/index.js");

const EN = getContent("en").hero;
const TR = getContent("tr").hero;

function renderHome(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Home />
    </MemoryRouter>,
  );
}

const normalise = (text) => text.replace(/\s+/g, " ").trim();
const headings = () =>
  [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(
    (heading) => heading.tagName,
  );

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
});

describe("hero content (00-icerik-girdileri §2.4)", () => {
  it("EN: name, role, rotating phrases and lead", () => {
    expect(EN.name).toBe("Cengizhan Köse");
    expect(EN.role).toBe("Senior Fullstack Engineer");
    expect(EN.phrases).toEqual([
      "Shipping for fleet technology",
      "Shipping for e-commerce",
      "Fleet tech, e-commerce and AI.",
    ]);
    expect(EN.lead).toBe(
      "I build web and mobile products end to end with TypeScript, React, Node.js and React Native.",
    );
  });

  it("TR: its own phrases and lead, the role stays English", () => {
    expect(TR.name).toBe("Cengizhan Köse");
    expect(TR.role).toBe("Senior Fullstack Engineer");
    expect(TR.roleLang).toBe("en");
    expect(TR.phrases).toEqual([
      "Filo teknolojisi için ürün geliştiriyorum",
      "E-ticaret için ürün geliştiriyorum",
      "Filo teknolojisi, e-ticaret ve yapay zekâ.",
    ]);
    expect(TR.lead).toBe(
      "TypeScript, React, Node.js ve React Native ile web ve mobil ürünleri uçtan uca geliştiriyorum.",
    );
  });

  it("DSG-07: the same number of phrases in both languages, at most 4", () => {
    expect(TR.phrases).toHaveLength(EN.phrases.length);
    expect(EN.phrases.length).toBeLessThanOrEqual(4);
    expect(new Set(EN.phrases).size).toBe(EN.phrases.length); // keys
    expect(new Set(TR.phrases).size).toBe(TR.phrases.length);
  });

  it("drops the old template copy (MKT-02 criterion 3)", () => {
    const sources = ["src/content/en/hero.js", "src/content/tr/hero.js"]
      .map(read)
      .join("\n");
    expect(sources).not.toMatch(
      /I love coding|I have some startup|high.quality products|I’m Cengizhan/,
    );
  });
});

describe.each([
  ["/", "en", EN],
  ["/tr", "tr", TR],
])("%s", (path, locale, hero) => {
  it("has one static h1: the name and the role, filled in the first render", () => {
    renderHome(path);

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(normalise(h1.textContent)).toBe(
      "Cengizhan Köse Senior Fullstack Engineer",
    );
    expect(h1.querySelector(".intro__role").textContent).toBe(hero.role);
  });

  it("starts the page outline with the h1 and has no other hero heading", () => {
    renderHome(path);

    expect(headings()).toEqual(["H1"]);
    expect(document.querySelectorAll("#home h2")).toHaveLength(0);
  });

  it("marks the English role as English only on pages in another language", () => {
    renderHome(path);

    const role = document.querySelector("h1 .intro__role");
    if (locale === "en") expect(role).not.toHaveAttribute("lang");
    else expect(role).toHaveAttribute("lang", "en");
  });

  it("puts the rotating line under the h1, hidden from screen readers, with the last phrase as text", () => {
    renderHome(path);

    const rotator = document.querySelector(".rotator");
    expect(rotator.closest("h1")).toBeNull();
    expect(rotator).toHaveAttribute("aria-hidden", "true");
    expect(rotator.closest("p.intro__tagline")).not.toBeNull();
    expect(
      [...rotator.children].map((span) => [
        span.textContent,
        span.style.getPropertyValue("--i"),
      ]),
    ).toEqual(hero.phrases.map((phrase, index) => [phrase, String(index)]));
    expect(
      document.querySelector(".intro__tagline .visually-hidden").textContent,
    ).toBe(hero.phrases.at(-1));
    // What assistive technology gets from the hero, in order.
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.compareDocumentPosition(rotator)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("shows the lead under the rotating line", () => {
    renderHome(path);

    expect(document.querySelector(".intro__lead").textContent).toBe(hero.lead);
  });

  it("does not change the h1 on later renders (no JS timer, no typewriter)", () => {
    const { rerender } = renderHome(path);
    const before = screen.getByRole("heading", { level: 1 }).textContent;
    rerender(
      <MemoryRouter initialEntries={[path]}>
        <Home />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(before);
    expect(
      document.querySelector(".Typewriter, .Typewriter__wrapper"),
    ).toBeNull();
  });
});

describe("no typewriter left (PERF-20, FE-23 criterion 4)", () => {
  it("the dependency is gone and the home page has no loop", () => {
    for (const file of ["package.json", "bun.lock"]) {
      expect(read(file)).not.toContain("typewriter-effect");
    }
    expect(read("src/pages/home/index.jsx")).not.toMatch(
      /loop:\s*true|setInterval|setTimeout|requestAnimationFrame/,
    );
  });
});
