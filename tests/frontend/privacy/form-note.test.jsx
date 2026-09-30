// SEC-25 / ANL-04: the notice under the contact form. On /contact the note
// sits right under the submit button, names EmailJS and the retention period
// as a number, and links /privacy. The honeypot and the alert focus from the
// form tests stay as they are (contact-form.test.jsx runs with this note too).
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@emailjs/browser", () => ({ default: { send: vi.fn() } }));

import { DICTIONARIES } from "../../../src/i18n/translate.js";
import { ContactUs } from "../../../src/pages/contact";

const T = DICTIONARIES.en;

const renderContact = (path = "/contact") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ContactUs />
    </MemoryRouter>,
  );

describe("/contact form note", () => {
  it("is right after the submit button, inside the form", () => {
    renderContact();
    const form = document.querySelector("form");
    const button = form.querySelector("button[type=submit]");
    const note = form.querySelector(".privacy-note");
    expect(note).not.toBeNull();
    expect(button.nextElementSibling).toBe(note);
    expect(form.lastElementChild).toBe(note);
  });

  it("names EmailJS and a retention period written as a number", () => {
    renderContact();
    const note = document.querySelector(".privacy-note");
    expect(note.textContent).toContain("EmailJS");
    expect(note.textContent).toMatch(/\b12 months\b/);
    expect(note.textContent).toContain(T["privacy.formNote"]);
  });

  it("links to /privacy and describes the submit button", () => {
    renderContact();
    const link = screen.getByRole("link", { name: T["privacy.formLink"] });
    expect(link).toHaveAttribute("href", "/privacy");
    expect(link.closest(".privacy-note")).not.toBeNull();
    const note = document.querySelector(".privacy-note");
    expect(document.querySelector("button[type=submit]")).toHaveAttribute(
      "aria-describedby",
      note.id,
    );
  });

  it("keeps the honeypot and the project type field", () => {
    renderContact();
    expect(document.querySelector("div.contact__hp")).not.toBeNull();
    expect(document.getElementById("project_type")).not.toBeNull();
  });

  it("the note text and the retention in the privacy page agree on 12 months", () => {
    expect(T["privacy.formNote"]).toContain("12 months");
  });
});
