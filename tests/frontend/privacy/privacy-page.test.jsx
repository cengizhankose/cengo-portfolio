// The English privacy page (SEC-25, ANL-04): /privacy lists the recipients
// from privacyProcessors, states the Umami facts, names the controller's
// contact address and the KVKK article 11 rights, and sets <html lang>.
// The Turkish page is in privacy-page-tr.test.jsx (it needs the TR route
// table that W11 opens).
import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { email } from "../../../src/content/shared.js";
import { getContent } from "../../../src/content/index.js";
import { DICTIONARIES } from "../../../src/i18n/translate.js";
import { Privacy } from "../../../src/pages/privacy";
import { LAST_UPDATED } from "../../../src/pages/privacy/updated.js";

const en = getContent("en").privacy;
const T = DICTIONARIES.en;

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  document.documentElement.lang = "";
});

const renderPrivacy = () =>
  render(
    <MemoryRouter initialEntries={["/privacy"]}>
      <Privacy />
    </MemoryRouter>,
  );

describe("/privacy", () => {
  it("has one h1 and an h2 for each section", () => {
    renderPrivacy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      T["privacy.title"],
    );
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(
      [
        "controller",
        "data",
        "purposes",
        "recipients",
        "analytics",
        "retention",
        "rights",
        "changes",
      ].map((name) => T[`privacy.section.${name}`]),
    );
  });

  it("names EmailJS, Cloudflare, Umami and Out Plane, and no font provider", () => {
    const { container } = renderPrivacy();
    const text = container.textContent;
    for (const name of ["EmailJS", "Cloudflare", "Umami", "Out Plane"]) {
      expect(text, name).toContain(name);
    }
    expect(text).toContain("Cloudflare Web Analytics");
    expect(text).not.toMatch(/Google Fonts|fonts\.googleapis/i);
  });

  it("renders one entry per privacyProcessors item, in order", () => {
    const { container } = renderPrivacy();
    const items = [...container.querySelectorAll("[data-processor]")];
    expect(items.map((item) => item.dataset.processor)).toEqual(
      en.privacyProcessors.map((processor) => processor.id),
    );
    items.forEach((item, index) => {
      const processor = en.privacyProcessors[index];
      expect(within(item).getByRole("heading", { level: 3 }).textContent).toBe(
        processor.name,
      );
      expect(item.textContent).toContain(processor.purpose);
      expect(item.textContent).toContain(processor.data);
      expect(item.textContent).toContain(processor.location);
    });
  });

  it("states the Umami facts: no cookies, no stored IP, Do Not Track", () => {
    const { container } = renderPrivacy();
    const text = container.textContent;
    expect(text).toContain(T["privacy.umami.noCookies"]);
    expect(text).toContain(T["privacy.umami.noIpStorage"]);
    expect(text).toContain(T["privacy.umami.noThirdParty"]);
    expect(text).toContain(T["privacy.umami.dnt"]);
    expect(text).toContain(T["privacy.umami.salt"]);
    // The salt statement is the month rotation of the visitor identifier.
    expect(T["privacy.umami.salt"]).toMatch(/every month/);
  });

  it("offers the opt-out and opt-in links (full page loads, no prefix in EN)", () => {
    renderPrivacy();
    expect(
      screen.getByRole("link", { name: T["privacy.umami.optOut"] }),
    ).toHaveAttribute("href", "/?analytics=off");
    expect(
      screen.getByRole("link", { name: T["privacy.umami.optIn"] }),
    ).toHaveAttribute("href", "/?analytics=on");
  });

  it("gives the controller's address as a mailto link, twice", () => {
    renderPrivacy();
    const links = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === `mailto:${email}`);
    expect(links).toHaveLength(2);
    expect(links[0].textContent).toBe(email);
  });

  it("shows the last updated date and the KVKK article 11 rights", () => {
    const { container } = renderPrivacy();
    const time = container.querySelector("time");
    expect(time).toHaveAttribute("datetime", LAST_UPDATED);
    expect(time.textContent).toBe("Last updated: October 1, 2026");
    const rights = screen
      .getByRole("heading", { name: T["privacy.section.rights"] })
      .closest(".row");
    expect(within(rights).getByText(/article 11 of the KVKK/)).toBeTruthy();
    expect(within(rights).getAllByRole("listitem")).toHaveLength(
      en.rights.items.length,
    );
    expect(rights.textContent).toContain("articles 15 to 21");
  });

  it("states the retention periods as numbers", () => {
    const { container } = renderPrivacy();
    const section = screen
      .getByRole("heading", { name: T["privacy.section.retention"] })
      .closest(".row");
    expect(section.textContent).toMatch(/12 months/);
    expect(section.textContent).toMatch(/13 months/);
    expect(container.textContent).toContain(T["privacy.disclaimer"]);
  });

  it("sets the title, the description and <html lang='en'>", () => {
    renderPrivacy();
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("Privacy | Cengizhan Köse");
    expect(
      document.head.querySelector('meta[name="description"]').content,
    ).toMatch(/what the contact form/);
  });

  it("has no axe violations", async () => {
    const { container } = renderPrivacy();
    const result = await axe.run(container, {
      rules: {
        "color-contrast": { enabled: false },
        region: { enabled: false },
      },
    });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
