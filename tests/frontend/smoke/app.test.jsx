// Smoke: the whole app mounts at "/" (FE-22). Current behaviour only; the
// packages that change the shell/hero (W2-SEO-head-module,
// W5-DSG-motion-cursor-hero) update this file.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../../../src/app/App";

describe("App (smoke)", () => {
  it("renders the home page at / with a level-1 heading", () => {
    render(<App />);

    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("renders the site header with a home link and the menu button", () => {
    const { container } = render(<App />);

    const header = screen.getByRole("banner");
    const homeLinks = within(header)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/");
    expect(homeLinks.length).toBeGreaterThan(0);
    expect(container.querySelector("button.menu__button")).toBeInTheDocument();
  });
});
