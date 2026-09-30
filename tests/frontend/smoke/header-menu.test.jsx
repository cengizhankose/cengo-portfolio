// Smoke: header navigation menu (FE-22), updated by W2-FE-nav-a11y for the
// named, boolean-state menu button (FE-02/FE-11). The detailed keyboard,
// focus and landmark checks live in tests/frontend/nav/.
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
  render(
    <MemoryRouter>
      <Headermain />
    </MemoryRouter>,
  );
  const menuButton = screen.getByRole("button", { name: "Menu" });
  return {
    menuButton,
    menu: document.getElementById(menuButton.getAttribute("aria-controls")),
  };
}

describe("Headermain menu (smoke)", () => {
  it("links every site section to its route inside the main menu", () => {
    renderHeader();
    const nav = screen.getByRole("navigation", { name: "Main menu" });

    for (const [name, href] of SECTIONS) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(nav).toContainElement(link);
    }
  });

  it("opens and closes the menu with the menu button", async () => {
    const user = userEvent.setup();
    const { menu, menuButton } = renderHeader();
    expect(menu).not.toHaveClass("menu__opend");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await user.click(menuButton);
    expect(menu).toHaveClass("menu__opend");
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(document.body).toHaveClass("ovhidden");

    await user.click(menuButton);
    expect(menu).not.toHaveClass("menu__opend");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(document.body).not.toHaveClass("ovhidden");
  });

  it("closes the open menu when a section link is chosen", async () => {
    const user = userEvent.setup();
    const { menu, menuButton } = renderHeader();

    await user.click(menuButton);
    await user.click(screen.getByRole("link", { name: "About" }));

    expect(menu).not.toHaveClass("menu__opend");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(document.body).not.toHaveClass("ovhidden");
  });
});
