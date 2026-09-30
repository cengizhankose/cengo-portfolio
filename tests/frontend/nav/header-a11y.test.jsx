// FE-02 / DSG-02: header controls are native, named buttons; the theme toggle
// reports its state with aria-pressed and works from the keyboard.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Headermain from "../../../src/header";

function renderHeader() {
  return render(
    <MemoryRouter>
      <Headermain />
    </MemoryRouter>,
  );
}

const theme = () => document.documentElement.dataset.theme;

describe("theme toggle (DSG-02, FE-02)", () => {
  it("is a type=button <button> with a fixed name and aria-pressed", () => {
    renderHeader();

    const toggle = screen.getByRole("button", { name: "Dark theme" });
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.type).toBe("button");
    expect(toggle).toHaveClass("theme-toggle", "nav_ac");
    expect(toggle).toHaveAttribute("aria-pressed", String(theme() === "dark"));
    expect(toggle.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it.each([
    [null, "dark"],
    ["null", "dark"],
    ["dark", "dark"],
    ["light", "light"],
  ])(
    "stored theme %j renders %s and aria-pressed matches it",
    (stored, expected) => {
      if (stored !== null) window.localStorage.setItem("theme", stored);
      renderHeader();

      expect(theme()).toBe(expected);
      expect(
        screen.getByRole("button", { name: "Dark theme" }),
      ).toHaveAttribute("aria-pressed", String(expected === "dark"));
    },
  );

  it.each(["{Enter}", " "])(
    "switches the theme with %j and keeps aria-pressed in sync",
    async (key) => {
      const user = userEvent.setup();
      renderHeader();
      const toggle = screen.getByRole("button", { name: "Dark theme" });
      toggle.focus();

      for (const expected of ["light", "dark", "light"]) {
        await user.keyboard(key);
        expect(theme()).toBe(expected);
        expect(toggle).toHaveAttribute(
          "aria-pressed",
          String(theme() === "dark"),
        );
      }
    },
  );
});

describe("keyboard order", () => {
  it("goes skip link -> logo -> theme toggle -> menu button", async () => {
    const user = userEvent.setup();
    renderHeader();

    const stops = [];
    for (let step = 0; step < 4; step += 1) {
      await user.tab();
      stops.push(
        document.activeElement.getAttribute("aria-label") ??
          document.activeElement.textContent.trim(),
      );
    }

    expect(stops).toEqual(["Skip to content", "CENGO", "Dark theme", "Menu"]);
  });
});

describe("icon-only controls have names (FE-02)", () => {
  it("finds the theme, menu and GitHub controls by role and name", () => {
    renderHeader();

    expect(
      screen.getByRole("button", { name: "Dark theme" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menu" })).toBeInTheDocument();
    // W7-DSG-social-links: social links are named "<channel> profile (opens
    // in a new tab)" (SEO-24/DSG-12/MKT-23).
    expect(
      screen.getByRole("link", { name: "GitHub profile (opens in a new tab)" }),
    ).toBeInTheDocument();
  });

  it("leaves no unnamed button or link in the header", () => {
    renderHeader();
    const header = screen.getByRole("banner");

    for (const control of [
      ...within(header).getAllByRole("button"),
      ...within(header).getAllByRole("link"),
    ]) {
      const name =
        control.getAttribute("aria-label") ?? control.textContent.trim();
      expect(name).not.toBe("");
    }
  });
});
