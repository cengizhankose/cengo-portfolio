// Site data blocked (Chrome/Firefox "don't allow sites to save data"): the
// `localStorage` getter throws SecurityError. @emailjs/browser v4 reads it
// while its module loads (store.js → createWebStorage), so the real SDK is
// used here, not a mock. The page must render and a send must end in the
// error message with the mailto: link, the typed text kept (SEC-24, FE-24,
// MKT-11, FE-15). Nothing leaves the test: the SDK never loads.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Blocked before the imports below run: a static SDK import in the page (or
// anything it imports) would throw while this file loads, as it did in the
// browser where the whole app went blank.
const storage = vi.hoisted(() => {
  const denied = () => {
    throw new DOMException(
      "Failed to read the 'localStorage' property from 'Window': Access is denied for this document.",
      "SecurityError",
    );
  };
  // The SDK reads the bare global; components read window.localStorage.
  const targets = [...new Set([globalThis.window, globalThis])];
  const saved = targets.map((target) => [
    target,
    Object.getOwnPropertyDescriptor(target, "localStorage"),
  ]);
  const block = () => {
    for (const target of targets) {
      Object.defineProperty(target, "localStorage", {
        configurable: true,
        get: denied,
      });
    }
  };
  const restore = () => {
    for (const [target, descriptor] of saved) {
      if (descriptor) Object.defineProperty(target, "localStorage", descriptor);
      else delete target.localStorage;
    }
  };
  block();
  return { block, restore };
});

import { contactConfig } from "../../../src/content_option";
import { ContactUs } from "../../../src/pages/contact";

const TYPED = { name: "Jane Doe", email: "jane@example.com", message: "Hi" };
const FIELD_IDS = ["name", "email", "message"];

let consoleError;

beforeEach(() => {
  storage.block();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

// Runs before the setup file's afterEach, which clears localStorage.
afterEach(() => storage.restore());

function renderContact() {
  return render(
    <MemoryRouter initialEntries={["/contact"]}>
      <ContactUs />
    </MemoryRouter>,
  );
}

const values = () => FIELD_IDS.map((id) => document.getElementById(id).value);
const submitButton = () => document.querySelector("button[type=submit]");

async function fillForm(user) {
  await user.type(screen.getByLabelText("Name"), TYPED.name);
  await user.type(screen.getByLabelText("Email"), TYPED.email);
  await user.type(screen.getByLabelText("Message"), TYPED.message);
}

describe("site data blocked (real @emailjs/browser)", () => {
  it("reproduces the failure: the SDK throws SecurityError while it loads", async () => {
    expect(() => window.localStorage).toThrow(DOMException);

    await expect(import("@emailjs/browser")).rejects.toMatchObject({
      name: "SecurityError",
    });
  });

  it("renders the contact page", () => {
    renderContact();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Contact me",
    );
    for (const label of ["Name", "Email", "Message"]) {
      expect(screen.getByLabelText(label)).toBeInstanceOf(HTMLElement);
    }
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("keeps the typed text and shows the error with the mailto: link", async () => {
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);

    await user.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("alert-danger");
    expect(alert).toHaveTextContent(
      "Your message couldn’t be sent. Please try again or email me directly.",
    );
    expect(alert.textContent).not.toMatch(/SecurityError|localStorage/);
    expect(
      within(alert).getByRole("link", { name: /email me/i }),
    ).toHaveAttribute("href", `mailto:${contactConfig.YOUR_EMAIL}`);
    expect(values()).toEqual([TYPED.name, TYPED.email, TYPED.message]);
    expect(document.activeElement).toBe(alert);
    // The load error is logged, not shown.
    expect(consoleError).toHaveBeenCalledWith(
      "Contact form: message not sent",
      expect.objectContaining({ name: "SecurityError" }),
    );
  });

  it("lets the visitor try again after the failure", async () => {
    const user = userEvent.setup();
    renderContact();
    await fillForm(user);
    await user.click(submitButton());
    await screen.findByRole("alert");

    expect(submitButton()).toBeEnabled();
    expect(submitButton()).toHaveTextContent("Send message");
    await user.click(submitButton());

    await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveClass("alert-danger");
    expect(values()).toEqual([TYPED.name, TYPED.email, TYPED.message]);
  });
});
