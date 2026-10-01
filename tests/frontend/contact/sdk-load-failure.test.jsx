// The SDK chunk cannot be loaded (network drop, stale deploy, blocked
// script): import("@emailjs/browser") rejects. The form must treat it like
// any failed send (SEC-24, FE-24, MKT-11, FE-15). The mock factory throws, so
// every import of the SDK in this file rejects.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@emailjs/browser", () => {
  throw new TypeError(
    "Failed to fetch dynamically imported module: /assets/index-0000.js",
  );
});

import { email } from "../../../src/content/shared.js";
import { ContactUs } from "../../../src/pages/contact";

const TYPED = { name: "Jane Doe", email: "jane@example.com", message: "Hi" };
const FIELD_IDS = ["name", "email", "message"];

let consoleError;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

const values = () => FIELD_IDS.map((id) => document.getElementById(id).value);

describe("SDK chunk not loaded", () => {
  it("renders the page, then shows the error with the mailto: link and keeps the text", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/contact"]}>
        <ContactUs />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Let’s work together",
    );
    await user.type(screen.getByLabelText("Name"), TYPED.name);
    await user.type(screen.getByLabelText("Email"), TYPED.email);
    await user.selectOptions(screen.getByLabelText("Project type"), "web");
    await user.type(screen.getByLabelText("Message"), TYPED.message);

    await user.click(screen.getByRole("button", { name: "Send details" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("alert-danger");
    expect(alert.textContent).not.toMatch(/Failed to fetch|TypeError/);
    expect(
      within(alert).getByRole("link", { name: /email me/i }),
    ).toHaveAttribute("href", `mailto:${email}`);
    expect(values()).toEqual([TYPED.name, TYPED.email, TYPED.message]);
    expect(document.activeElement).toBe(alert);
    expect(
      screen.getByRole("button", { name: "Send details" }),
    ).not.toBeDisabled();
    expect(consoleError).toHaveBeenCalledWith(
      "Contact form: message not sent",
      expect.anything(),
    );
  });
});
