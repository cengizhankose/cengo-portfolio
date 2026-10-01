// DSG-18 / DSG-22 / FE-01: the rewritten header, in the DOM.
//   - One navigation for every width: the five sections (Portfolio while it
//     has cases, T-10) are rendered once, as NavLinks, in the page's
//     language; exactly one carries aria-current="page", Home only on its
//     own path.
//   - DOM order = Tab order = visual order: brand, sections, language,
//     theme, menu button, then the colophon.
//   - The strip gets its background class once the page has scrolled.
// jsdom loads no CSS: the width-dependent rules are checked on the source in
// ./header-css.test.js, and were measured in Chrome for the package report.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Headermain from "../../../src/header";
import styles from "../../../src/header/header.module.css";
import { DICTIONARIES } from "../../../src/i18n/translate.js";

const EN = DICTIONARIES.en;
const TR = DICTIONARIES.tr;

function renderHeader(path = "/") {
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <Headermain />
    </MemoryRouter>,
  );
  const header = screen.getByRole("banner");
  return {
    ...utils,
    header,
    nav: () =>
      within(header).getByRole("navigation", {
        name: path.startsWith("/tr") ? TR["nav.label"] : EN["nav.label"],
      }),
  };
}

const current = (nav) => [...nav.querySelectorAll('[aria-current="page"]')];

describe("current page (DSG-18 criterion 3)", () => {
  it.each([
    ["/", EN["nav.home"]],
    ["/about", EN["nav.about"]],
    ["/contact", EN["nav.contact"]],
    ["/blog", EN["nav.blog"]],
    ["/blog/hello-world", EN["nav.blog"]],
    ["/tr", TR["nav.home"]],
    ["/tr/about", TR["nav.about"]],
    ["/tr/blog/merhaba-dunya", TR["nav.blog"]],
  ])("%s marks exactly one link: %s", (path, label) => {
    const { nav } = renderHeader(path);
    const marked = current(nav());
    expect(marked.map((a) => a.textContent)).toEqual([label]);
    expect(marked[0].className).toBe(styles.navLink);
  });

  it("links every section in the page's language, Home with `end` semantics", () => {
    const { nav } = renderHeader("/tr/about");
    const hrefs = [...nav().querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "/tr",
      "/tr/portfolio",
      "/tr/about",
      "/tr/blog",
      "/tr/contact",
    ]);
  });

  it("renders the sections once: no second, desktop-only copy of the menu", () => {
    const { header } = renderHeader("/about");
    for (const name of ["Home", "About", "Blog", "Contact"]) {
      expect(within(header).getAllByRole("link", { name })).toHaveLength(1);
    }
    expect(
      header.querySelectorAll(`#site-navigation .${styles.navLink}`),
    ).toHaveLength(5);
  });
});

describe("order (DSG-18 criterion 5, DSG-19 step 5)", () => {
  it("is brand, sections, language, theme, menu button, colophon", () => {
    const { header } = renderHeader("/");
    const stops = [...header.querySelectorAll("a[href], button")].map(
      (el) =>
        el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 12),
    );
    expect(stops.slice(0, 9)).toEqual([
      "CENGO",
      "Home",
      "Portfolio",
      "About",
      "Blog",
      "Contact",
      "TR – Türkçe",
      EN["a11y.darkTheme"],
      EN["nav.menu"],
    ]);
    // The colophon closes the header: profiles, then privacy.
    expect(stops.at(-1)).toBe(EN["nav.privacy"]);
  });

  it("keeps the colophon out of the section navigation and out of the panel", () => {
    renderHeader("/");
    const privacy = document.querySelector(".menu_footer__privacy");
    expect(privacy.closest("nav")).toBeNull();
    expect(privacy.closest("#site-navigation")).toBeNull();
    expect(privacy.closest(`.${styles.menuFooter}`)).not.toBeNull();
  });
});

describe("strip background on scroll (DSG-22 steps 1-2)", () => {
  afterEach(() => {
    window.scrollY = 0;
  });

  it("is clear at the top and gets .isScrolled after the first pixels", () => {
    window.scrollY = 0;
    const { header } = renderHeader("/about");
    expect(header).toHaveClass(styles.siteHeader);
    expect(header).not.toHaveClass(styles.isScrolled);

    act(() => {
      window.scrollY = 600;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(header).toHaveClass(styles.isScrolled);

    act(() => {
      window.scrollY = 0;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(header).not.toHaveClass(styles.isScrolled);
  });

  it("listens passively and lets go on unmount", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHeader("/");
    const call = add.mock.calls.find(([type]) => type === "scroll");
    expect(call[2]).toMatchObject({ passive: true });
    unmount();
    expect(remove.mock.calls.some(([type]) => type === "scroll")).toBe(true);
  });
});

describe("menu", () => {
  it("puts the open state on the header too, for the colophon", () => {
    const { header } = renderHeader("/");
    fireEvent.click(screen.getByRole("button", { name: EN["nav.menu"] }));
    expect(header).toHaveClass(styles.isOpen);
  });
});

describe("page frame (FE-01 signature element)", () => {
  it("is one decorative box", () => {
    renderHeader("/");
    const frames = document.querySelectorAll(`.${styles.frame}`);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveAttribute("aria-hidden", "true");
    expect(frames[0].children).toHaveLength(0);
  });
});
