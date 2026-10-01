// ANL-04 step 6: the menu footer links the privacy page in the page's
// language, and following it closes the menu like any other menu link.
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Headermain from "../../../src/header";
import { DICTIONARIES } from "../../../src/i18n/translate.js";
import headerStyles from "../../../src/header/header.module.css";

const T = DICTIONARIES.en;

const renderHeader = (path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Headermain />
    </MemoryRouter>,
  );

describe("menu footer privacy link", () => {
  it(`is in .${headerStyles.menuFooter} with the nav.privacy text and /privacy`, () => {
    renderHeader();
    const link = document.querySelector(
      `.${headerStyles.menuFooter} a.menu_footer__privacy`,
    );
    expect(link).not.toBeNull();
    expect(link.textContent).toBe(T["nav.privacy"]);
    expect(link.getAttribute("href")).toBe("/privacy");
    // Not one of the social links: those keep their own list and order.
    expect(link.closest(`.${headerStyles.footerSocial}`)).toBeNull();
  });

  it("sits next to the copyright line and is not a main menu item", () => {
    renderHeader();
    const link = document.querySelector(".menu_footer__privacy");
    expect(link.parentElement.querySelector(".copyright")).not.toBeNull();
    expect(
      [...document.querySelectorAll(`nav .${headerStyles.menuItem} a`)].map(
        (a) => a.getAttribute("href"),
      ),
    ).not.toContain("/privacy");
  });

  it("opens the menu, then closes it when the link is followed", () => {
    renderHeader("/contact");
    fireEvent.click(screen.getByRole("button", { name: T["nav.menu"] }));
    expect(
      document.querySelector(`.${headerStyles.siteNavigation}`),
    ).toHaveClass(headerStyles.menuOpen);
    fireEvent.click(document.querySelector(".menu_footer__privacy"));
    expect(
      document.querySelector(`.${headerStyles.siteNavigation}`),
    ).not.toHaveClass(headerStyles.menuOpen);
  });
});
