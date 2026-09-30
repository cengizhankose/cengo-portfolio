// Smoke: header navigation menu (FE-22). Current behaviour only;
// W2-FE-nav-a11y (FE-02/FE-10/FE-11) owns and updates this file.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Headermain from "../../../src/header";

const SECTIONS = [
  ["Home", "/"],
  ["Portfolio", "/portfolio"],
  ["About", "/about"],
  ["Blog", "/blog"],
  ["Contact", "/contact"],
];

function renderHeader() {
  const utils = render(
    <MemoryRouter>
      <Headermain />
    </MemoryRouter>,
  );
  return {
    ...utils,
    menu: utils.container.querySelector(".site__navigation"),
    menuButton: utils.container.querySelector("button.menu__button"),
  };
}

describe("Headermain menu (smoke)", () => {
  it("links every site section to its route", () => {
    renderHeader();

    for (const [name, href] of SECTIONS) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("opens and closes the menu with the menu button", async () => {
    const user = userEvent.setup();
    const { menu, menuButton } = renderHeader();
    expect(menu).not.toHaveClass("menu__opend");

    await user.click(menuButton);
    expect(menu).toHaveClass("menu__opend");
    expect(document.body).toHaveClass("ovhidden");

    await user.click(menuButton);
    expect(menu).not.toHaveClass("menu__opend");
    expect(document.body).not.toHaveClass("ovhidden");
  });

  it("closes the open menu when a section link is chosen", async () => {
    const user = userEvent.setup();
    const { menu, menuButton } = renderHeader();

    await user.click(menuButton);
    await user.click(screen.getByRole("link", { name: "About" }));

    expect(menu).not.toHaveClass("menu__opend");
    expect(document.body).not.toHaveClass("ovhidden");
  });
});
