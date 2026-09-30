// Smoke: theme toggle (FE-22). Current behaviour only; W3-DSG-theme-init
// (FE-08/FE-09, K-10 system theme) owns and updates this file.
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
