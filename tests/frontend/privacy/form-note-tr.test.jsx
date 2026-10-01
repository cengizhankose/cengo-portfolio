// SEC-25 / ANL-04, TR half: /tr/contact with the route table mocked as after
// W11 (TR static pages live). The note is Turkish, names EmailJS and "12 ay"
// and links /tr/privacy.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import contact from "../../../src/pages/contact/contact.module.css";

vi.mock("@emailjs/browser", () => ({ default: { send: vi.fn() } }));
vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});

const { DICTIONARIES } = await import("../../../src/i18n/translate.js");
const { ContactUs } = await import("../../../src/pages/contact");

const T = DICTIONARIES.tr;

describe("/tr/contact form note", () => {
  it("is Turkish, names EmailJS and 12 ay, links /tr/privacy", () => {
    render(
      <MemoryRouter initialEntries={["/tr/contact"]}>
        <ContactUs />
      </MemoryRouter>,
    );
    const note = document.querySelector(`.${contact.privacyNote}`);
    expect(note).not.toBeNull();
    expect(note.textContent).toContain(T["privacy.formNote"]);
    expect(note.textContent).toContain("EmailJS");
    expect(note.textContent).toMatch(/\b12 ay\b/);
    expect(
      screen.getByRole("link", { name: T["privacy.formLink"] }),
    ).toHaveAttribute("href", "/tr/privacy");
    expect(
      document.querySelector("button[type=submit]").nextElementSibling,
    ).toBe(note);
  });
});
