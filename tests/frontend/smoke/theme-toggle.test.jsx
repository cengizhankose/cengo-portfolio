// Smoke: theme toggle (FE-22), updated for K-10 (FE-08/FE-09, DSG-15): a
// stored choice wins, otherwise the system preference; nothing is stored
// until the visitor clicks. Details: tests/frontend/theme/**.
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import Themetoggle from "../../../src/components/themetoggle";

describe("Themetoggle (smoke)", () => {
  it("applies the stored theme to <html> on mount", () => {
    window.localStorage.setItem("theme", "light");

    render(<Themetoggle />);

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("without a stored choice uses the system theme and stores nothing", () => {
    // tests/frontend/setup.js: matchMedia matches nothing, so the OS is not
    // asking for light and the system theme is dark.
    render(<Themetoggle />);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("switches dark -> light -> dark on click and persists the choice", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("theme", "dark");
    const { container } = render(<Themetoggle />);
    const toggle = container.firstElementChild;

    await user.click(toggle);
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem("theme")).toBe("light");

    await user.click(toggle);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });
});
