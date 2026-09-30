// FE-10 / DSG-14: one <main> per page, named <nav> and <aside>, the skip
// link, and focus moving to <main> after a route change.
import { screen } from "@testing-library/react";
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

const ROUTES = [
  ["/", "Home page"],
  ["/about", "About page"],
  ["/portfolio", "Portfolio page"],
  ["/contact", "Contact page"],
  ["/blog", "Blog page"],
  ["/blog/some-post", "Post page"],
];

describe("landmarks", () => {
  it.each(ROUTES)(
    "%s has exactly one focusable <main id=main>",
    async (path, h1) => {
      renderSite(path);

      // The blog pages are lazy chunks (PERF-04): wait for the page.
      expect(
        await screen.findByRole("heading", { level: 1, name: h1 }),
      ).toBeInTheDocument();
      const mains = document.querySelectorAll("main");
      expect(mains).toHaveLength(1);
      expect(mains[0]).toHaveAttribute("id", "main");
      expect(mains[0]).toHaveAttribute("tabindex", "-1");
      expect(mains[0]).toContainElement(
        screen.getByRole("heading", { level: 1 }),
      );
    },
  );

  it("names every <nav> uniquely and wraps the site menu in one", () => {
    renderSite();

    const navs = [...document.querySelectorAll("nav")];
    const labels = navs.map((nav) => nav.getAttribute("aria-label"));
    expect(navs.length).toBeGreaterThan(0);
    expect(labels.every((label) => label && label.trim())).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);

    const mainMenu = screen.getByRole("navigation", { name: "Main menu" });
    expect(mainMenu.querySelector("ul.the_menu")).not.toBeNull();
  });

  it("puts the social strip in a named <aside> outside <main>", () => {
    renderSite();

    const aside = screen.getByRole("complementary", { name: "Social links" });
    expect(aside.querySelector(".stick_follow_icon")).not.toBeNull();
    expect(document.querySelector("main").contains(aside)).toBe(false);
  });
});

describe("skip link", () => {
  it("is the first Tab stop and moves focus to <main> without a navigation", async () => {
    const user = userEvent.setup();
    const { pageStage } = renderSite("/about");
    const page = pageStage();

    await user.tab();
    expect(document.activeElement.textContent.trim()).toBe("Skip to content");
    expect(document.activeElement).toHaveAttribute("href", "#main");

    await user.keyboard("{Enter}");

    expect(document.activeElement.id).toBe("main");
    expect(routerState()).toEqual({ pathname: "/about", hash: "" });
    expect(pageStage()).toBe(page);
    expect(pageStage()).not.toHaveClass("page-enter");
  });
});

describe("page transition and focus (FE-10)", () => {
  it("does not move focus on the first load", () => {
    renderSite("/");

    expect(document.activeElement).toBe(document.body);
  });

  it("focuses <main> once the new page is shown after choosing About in the menu", async () => {
    const user = userEvent.setup();
    const { menuButton, pageStage } = renderSite("/");

    menuButton().focus();
    await user.keyboard("{Enter}");
    screen.getByRole("link", { name: "About" }).focus();
    await user.keyboard("{Enter}");

    // The new page is rendered in the same commit as the navigation
    // (PERF-13, FE-17): nothing to wait for.
    expect(routerState().pathname).toBe("/about");
    expect(pageStage()).toHaveClass("page-enter");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "About page",
    );
    expect(document.activeElement.id).toBe("main");
  });

  it("focuses <main> without scrolling (preventScroll)", async () => {
    const user = userEvent.setup();
    renderSite("/");
    const main = document.getElementById("main");
    const focus = vi.spyOn(main, "focus");

    await user.click(
      screen.getByRole("button", {
        name: "probe: go to contact",
        hidden: true,
      }),
    );

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(main);
  });

  it("renders a hash change in place: same page node, no entry fade, no focus move", async () => {
    const user = userEvent.setup();
    const { pageStage } = renderSite("/blog");
    const page = pageStage();
    const probe = screen.getByRole("button", {
      name: "probe: change hash",
      hidden: true,
    });

    await user.click(probe);

    expect(routerState()).toEqual({ pathname: "/blog", hash: "#details" });
    expect(pageStage()).toBe(page);
    expect(pageStage()).not.toHaveClass("page-enter");
    expect(document.activeElement).not.toBe(document.getElementById("main"));
  });
});
