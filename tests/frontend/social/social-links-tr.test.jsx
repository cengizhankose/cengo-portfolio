// DSG-12 criterion 1 / MKT-23 criterion 4 / SEO-24 criterion 1, TR half:
// with the route table mocked as after SEO-11 Adım B (TR static pages live),
// the rail and the menu footer on /tr are named in Turkish.
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import headerStyles from "../../../src/header/header.module.css";
import railStyles from "../../../src/components/socialicons/socialicons.module.css";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});

const { Socialicons } = await import("../../../src/components/socialicons");
const { default: Headermain } = await import("../../../src/header");

const K11_LABELS = [
  "LinkedIn",
  "GitHub",
  "X",
  "YouTube",
  "Twitch",
  "Instagram",
];

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Headermain />
      <aside>
        <Socialicons />
      </aside>
    </MemoryRouter>,
  );
}

const names = (selector) =>
  [...document.querySelectorAll(selector)].map((a) =>
    a.getAttribute("aria-label"),
  );

describe("TR pages live", () => {
  it("/tr: rail names are TR, start with the channel, end with the TR note", () => {
    renderAt("/tr");
    const rail = names(`.${railStyles.rail} a`);
    expect(rail).toHaveLength(6);
    rail.forEach((name, index) => {
      expect(name.startsWith(K11_LABELS[index])).toBe(true);
      expect(name).toContain("profili");
      expect(name.endsWith("(yeni sekmede açılır)")).toBe(true);
    });
    expect(document.querySelector(`.${railStyles.rail} p`).textContent).toBe(
      "Takip et",
    );
  });

  it("/tr: the menu footer names are TR as well, same hrefs as the rail", () => {
    renderAt("/tr/about");
    expect(names(`.${headerStyles.footerSocial} a`)).toEqual(
      K11_LABELS.map((name) => `${name} profili (yeni sekmede açılır)`),
    );
    const hrefs = (selector) =>
      [...document.querySelectorAll(selector)].map((a) => a.href);
    expect(hrefs(`.${headerStyles.footerSocial} a`)).toEqual(
      hrefs(`.${railStyles.rail} a`),
    );
  });

  it("/ stays EN", () => {
    renderAt("/");
    expect(names(`.${railStyles.rail} a`)).toEqual(
      K11_LABELS.map((name) => `${name} profile (opens in a new tab)`),
    );
  });
});
