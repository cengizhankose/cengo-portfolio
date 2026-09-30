// FE-11 / DSG-03: full-screen menu state, Escape, focus management, inert
// page content and the body scroll lock, all following one boolean.
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderSite, routerState } from "./support/site";

vi.mock("../../../src/pages/home", async () => ({
  Home: (await import("./support/pages.jsx")).Home,
}));
vi.mock("../../../src/pages/about", async () => ({
  About: (await import("./support/pages.jsx")).About,
}));
vi.mock("../../../src/pages/portfolio", async () => ({
  Portfolio: (await import("./support/pages.jsx")).Portfolio,
}));
vi.mock("../../../src/pages/contact", async () => ({
  ContactUs: (await import("./support/pages.jsx")).ContactUs,
}));
vi.mock("../../../src/pages/blog/BlogHome", async () => ({
  default: (await import("./support/pages.jsx")).BlogHome,
}));
vi.mock("../../../src/pages/blog/BlogPost", async () => ({
  default: (await import("./support/pages.jsx")).BlogPost,
}));

const isLocked = () => document.body.classList.contains("ovhidden");
const menuPanel = () => document.getElementById("site-navigation");

describe("menu button (closed)", () => {
  it("is a named disclosure button that controls the menu panel", () => {
    const { menuButton, content } = renderSite();
    const button = menuButton();

    expect(button).toHaveAttribute("type", "button");
    expect([
      button.getAttribute("aria-label"),
      button.getAttribute("aria-expanded"),
      !!document.getElementById(button.getAttribute("aria-controls")),
    ]).toEqual(["Menu", "false", true]);
    expect(menuPanel()).not.toHaveClass("menu__opend");
    expect(isLocked()).toBe(false);
    expect(content()).not.toHaveAttribute("inert");
    for (const svg of button.querySelectorAll("svg")) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  });
});

describe("opening and closing", () => {
  it("opens with Enter: expanded, body locked, content inert, focus on Home", async () => {
    const user = userEvent.setup();
    const { menuButton, content } = renderSite();

    menuButton().focus();
    await user.keyboard("{Enter}");

    expect(menuButton()).toHaveAttribute("aria-expanded", "true");
    expect(menuPanel()).toHaveClass("menu__opend");
    expect(isLocked()).toBe(true);
    expect(content()).toHaveAttribute("inert");
    expect(document.activeElement.textContent.trim()).toBe("Home");
  });

  it("closes with Escape and returns focus to the menu button", async () => {
    const user = userEvent.setup();
    const { menuButton, content } = renderSite();

    await user.click(menuButton());
    await user.keyboard("{Escape}");

    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(menuPanel()).not.toHaveClass("menu__opend");
    expect(isLocked()).toBe(false);
    expect(content()).not.toHaveAttribute("inert");
    expect(document.activeElement).toBe(menuButton());
  });

  it("ignores Escape while the menu is closed", async () => {
    const user = userEvent.setup();
    const { menuButton } = renderSite();
    const skip = screen.getByRole("link", { name: "Skip to content" });

    skip.focus();
    await user.keyboard("{Escape}");

    expect(document.activeElement).toBe(skip);
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when a menu link is chosen and navigates to it", async () => {
    const user = userEvent.setup();
    const { menuButton, content } = renderSite();

    await user.click(menuButton());
    await user.click(screen.getByRole("link", { name: "Blog" }));

    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(isLocked()).toBe(false);
    expect(content()).not.toHaveAttribute("inert");
    expect(routerState().pathname).toBe("/blog");
  });

  it("closes when the link to the current page is chosen", async () => {
    const user = userEvent.setup();
    const { menuButton } = renderSite("/about");

    await user.click(menuButton());
    await user.click(screen.getByRole("link", { name: "About" }));

    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(isLocked()).toBe(false);
    expect(routerState().pathname).toBe("/about");
  });

  it("closes on a route change that does not come from the menu", async () => {
    const user = userEvent.setup();
    const { menuButton, content } = renderSite();

    await user.click(menuButton());
    await user.click(
      screen.getByRole("button", {
        name: "probe: go to contact",
        hidden: true,
      }),
    );

    expect(routerState().pathname).toBe("/contact");
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(isLocked()).toBe(false);
    expect(content()).not.toHaveAttribute("inert");
  });

  it("keeps the body lock equal to the menu state (three clicks = open)", async () => {
    const user = userEvent.setup();
    const { menuButton } = renderSite();

    for (const expected of [true, false, true]) {
      await user.click(menuButton());
      expect(menuButton()).toHaveAttribute("aria-expanded", String(expected));
      expect(isLocked()).toBe(expected);
    }
    expect(menuPanel()).toHaveClass("menu__opend");
  });

  it("releases the body lock and inert content when unmounted while open", async () => {
    const user = userEvent.setup();
    const { menuButton, content, unmount } = renderSite();
    const pageContent = content();

    await user.click(menuButton());
    expect(isLocked()).toBe(true);

    act(() => unmount());

    expect(isLocked()).toBe(false);
    expect(pageContent).not.toHaveAttribute("inert");
  });
});

describe("focus while the menu is open", () => {
  it("never moves into the page content on 20 Tab presses", async () => {
    const user = userEvent.setup();
    const { menuButton, content } = renderSite();
    const header = screen.getByRole("banner");

    await user.click(menuButton());
    for (let step = 0; step < 20; step += 1) {
      await user.tab();
      expect(content().contains(document.activeElement)).toBe(false);
      expect(header.contains(document.activeElement)).toBe(true);
    }
  });

  it("wraps Tab from the last menu control to the first, and Shift+Tab back", async () => {
    const user = userEvent.setup();
    const { menuButton } = renderSite();
    const header = screen.getByRole("banner");

    await user.click(menuButton());
    const controls = [
      ...within(header).getAllByRole("link"),
      ...within(header).getAllByRole("button"),
    ].sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    const first = controls[0];
    const last = controls[controls.length - 1];

    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(first);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });
});
