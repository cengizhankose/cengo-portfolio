// SEO-24 / DSG-12 / DSG-30 / MKT-23 (K-11): one social list, two placements.
//
// The side rail (Socialicons, icon variant) and the menu footer (Headermain,
// text variant) render SOCIAL_PROFILES in K-11 order; every link opens in a
// new tab with rel="me noopener noreferrer" and is named in the interface
// language. Layout (32x32 / 24x24 targets) is checked from the CSS in
// styles.test.js and in a real browser (report: headless Chrome run).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import SocialLinks from "../../../src/components/SocialLinks.jsx";
import {
  SOCIAL_PROFILE_URLS,
  Socialicons,
} from "../../../src/components/socialicons";
import Headermain from "../../../src/header";
import { SOCIAL_PROFILES } from "../../../src/seo/site.js";
import headerStyles from "../../../src/header/header.module.css";
import railStyles from "../../../src/components/socialicons/socialicons.module.css";

const ROOT = resolve(import.meta.dirname, "../../..");

const K11_LABELS = [
  "LinkedIn",
  "GitHub",
  "X",
  "YouTube",
  "Twitch",
  "Instagram",
];
const K11_HOSTS = [
  "www.linkedin.com",
  "github.com",
  "x.com",
  "www.youtube.com",
  "www.twitch.tv",
  "www.instagram.com",
];
const EN_LABELS = K11_LABELS.map(
  (name) => `${name} profile (opens in a new tab)`,
);
const TR_LABELS = K11_LABELS.map(
  (name) => `${name} profili (yeni sekmede açılır)`,
);

const railLinks = () => [...document.querySelectorAll(`.${railStyles.rail} a`)];
const footerLinks = () => [
  ...document.querySelectorAll(`.${headerStyles.footerSocial} a`),
];
const labels = (links) => links.map((a) => a.getAttribute("aria-label"));
const hrefs = (links) => links.map((a) => a.href);

function renderShell(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Headermain />
      <aside>
        <Socialicons />
      </aside>
    </MemoryRouter>,
  );
}

describe("SocialLinks (one component, two variants)", () => {
  it("icons: six icon-only links in K-11 order, named per channel (EN)", () => {
    render(<SocialLinks variant="icons" />);
    const links = screen.getAllByRole("link");

    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      SOCIAL_PROFILES.map((p) => p.url),
    );
    expect(labels(links)).toEqual(EN_LABELS);
    links.forEach((link, index) => {
      expect(link).toHaveAccessibleName(EN_LABELS[index]);
      expect(link.textContent).toBe("");
      const svg = link.querySelector("svg");
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("focusable", "false");
    });
  });

  it("text: the brand name is the visible text and starts the name (WCAG 2.5.3)", () => {
    render(<SocialLinks variant="text" />);
    const links = screen.getAllByRole("link");

    expect(links.map((a) => a.textContent)).toEqual(K11_LABELS);
    links.forEach((link, index) => {
      expect(link.getAttribute("aria-label")).toBe(EN_LABELS[index]);
      expect(link.getAttribute("aria-label").startsWith(link.textContent)).toBe(
        true,
      );
    });
  });

  it("opens every profile in a new tab with rel me noopener noreferrer", () => {
    render(<SocialLinks variant="text" />);
    for (const link of screen.getAllByRole("link")) {
      expect(link.target).toBe("_blank");
      for (const token of ["me", "noopener", "noreferrer"]) {
        expect(link.relList.contains(token), token).toBe(true);
      }
    }
  });

  it("speaks TR when the locale is tr ('profili', new-tab note)", () => {
    render(<SocialLinks variant="icons" locale="tr" />);
    const names = labels(screen.getAllByRole("link"));

    expect(names).toEqual(TR_LABELS);
    for (const name of names) {
      expect(name).toContain("profili");
      expect(name.endsWith("(yeni sekmede açılır)")).toBe(true);
    }
  });

  it("puts `location` on the list as data-analytics-location (ANL-09)", () => {
    render(<SocialLinks location="social_rail" className="x-list" />);
    const list = screen.getByRole("list");
    expect(list).toHaveAttribute("data-analytics-location", "social_rail");
    expect(list).toHaveClass("x-list");
  });

  it("inside a router it follows the interface language (EN until TR is live)", () => {
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <SocialLinks />
      </MemoryRouter>,
    );
    expect(labels(screen.getAllByRole("link"))).toEqual(EN_LABELS);
  });
});

describe("rail and menu footer on the page (DSG-30, SEO-24, MKT-23)", () => {
  it("both lists carry the same six hrefs in the same order (DSG-30 criterion 1)", () => {
    renderShell("/");
    expect(railLinks()).toHaveLength(6);
    expect(JSON.stringify(hrefs(railLinks()))).toBe(
      JSON.stringify(hrefs(footerLinks())),
    );
  });

  it("the rail hosts are the K-11 hosts in order (DSG-30 criterion 2)", () => {
    renderShell("/");
    expect(railLinks().map((a) => new URL(a.href).hostname)).toEqual(K11_HOSTS);
  });

  it("href sets are equal, exactly six, no Facebook (SEO-24 criterion 3)", () => {
    renderShell("/");
    const rail = [...new Set(hrefs(railLinks()))].sort();
    const footer = [...new Set(hrefs(footerLinks()))].sort();
    expect(rail).toEqual(footer);
    expect(rail).toHaveLength(6);
    expect(document.body.innerHTML).not.toMatch(/facebook\.com/i);
  });

  it("hrefs are exactly SOCIAL_PROFILES, in order (MKT-23 criterion 2)", () => {
    renderShell("/");
    const expected = SOCIAL_PROFILES.map((p) => p.url);
    expect(railLinks().map((a) => a.getAttribute("href"))).toEqual(expected);
    expect(footerLinks().map((a) => a.getAttribute("href"))).toEqual(expected);
    expect(Object.values(SOCIAL_PROFILE_URLS)).toEqual(expected);
  });

  it("all 12 links: new tab, rel me/noopener/noreferrer, a name (DSG-30 c4, MKT-23 c4, SEO-24 c1)", () => {
    renderShell("/");
    const links = [...railLinks(), ...footerLinks()];
    expect(links).toHaveLength(12);
    for (const link of links) {
      expect(link.target).toBe("_blank");
      expect([...link.relList]).toEqual(
        expect.arrayContaining(["me", "noopener", "noreferrer"]),
      );
      expect(link.getAttribute("aria-label")?.trim()).toBeTruthy();
    }
  });

  it("rail names start with the channel and end with the EN new-tab note (DSG-12 criterion 1)", () => {
    renderShell("/");
    const names = labels(railLinks());
    expect(names).toHaveLength(6);
    names.forEach((name, index) => {
      expect(name.startsWith(K11_LABELS[index])).toBe(true);
      expect(name.endsWith("(opens in a new tab)")).toBe(true);
    });
  });

  it("every rail icon is aria-hidden (DSG-12 criterion 3)", () => {
    renderShell("/");
    expect(
      document.querySelectorAll(
        `.${railStyles.rail} svg:not([aria-hidden="true"])`,
      ).length,
    ).toBe(0);
  });

  it("marks the placements for outbound_link_clicked (ANL-09 step 3)", () => {
    renderShell("/");
    for (const link of railLinks()) {
      expect(
        link.closest("[data-analytics-location]").dataset.analyticsLocation,
      ).toBe("social_rail");
    }
    for (const link of footerLinks()) {
      expect(
        link.closest("[data-analytics-location]").dataset.analyticsLocation,
      ).toBe("menu_footer");
    }
  });

  it("the footer shows the brand names and keeps the copyright line", () => {
    renderShell("/");
    const footer = document.querySelector(`.${headerStyles.menuFooter}`);
    const social = footer.querySelector(`.${headerStyles.footerSocial}`);
    expect(
      within(social)
        .getAllByRole("link", { hidden: true })
        .map((a) => a.textContent),
    ).toEqual(K11_LABELS);
    expect(footer.querySelector(".copyright")).not.toBeNull();
  });

  it("the rail keeps its caption (EN 'Follow Me' by default, prop wins)", () => {
    const { unmount } = render(<Socialicons />);
    expect(document.querySelector(`.${railStyles.rail} p`).textContent).toBe(
      "Follow Me",
    );
    unmount();
    render(<Socialicons followLabel="Custom" />);
    expect(document.querySelector(`.${railStyles.rail} p`).textContent).toBe(
      "Custom",
    );
  });
});

describe("source (MKT-23 criterion 1, DSG-30 criterion 3)", () => {
  it.each([
    "src/components/SocialLinks.jsx",
    "src/components/ExternalLink.jsx",
    "src/components/socialicons/index.jsx",
    "src/components/socialicons/icons.js",
    "src/header/index.jsx",
    "src/lib/analytics/outbound.js",
    "src/i18n/en/social.js",
    "src/i18n/tr/social.js",
  ])("%s names no dropped network or old list", (file) => {
    expect(readFileSync(resolve(ROOT, file), "utf8")).not.toMatch(
      /facebook|socialprofils|twitter\.com/i,
    );
  });
});
