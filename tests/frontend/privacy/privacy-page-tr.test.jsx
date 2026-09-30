// The Turkish privacy page (SEC-25, ANL-04, T-12). /tr/privacy is a 404 until
// W11 adds 'tr' to LIVE.static, so the route table is mocked as it will be
// after that edit (the same way about-tr.test.jsx does it). The page must
// already be complete in Turkish, with the same recipients as the English one.
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});

const { CONTENT, getContent } = await import("../../../src/content/index.js");
const { email } = await import("../../../src/content/shared.js");
const { DICTIONARIES } = await import("../../../src/i18n/translate.js");
const { Privacy } = await import("../../../src/pages/privacy");

const tr = getContent("tr").privacy;
const T = DICTIONARIES.tr;

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  document.documentElement.lang = "";
});

const renderPrivacy = () =>
  render(
    <MemoryRouter initialEntries={["/tr/privacy"]}>
      <Privacy />
    </MemoryRouter>,
  );

describe("/tr/privacy", () => {
  it("sets <html lang='tr'>, the Turkish title and description", () => {
    renderPrivacy();
    expect(document.documentElement.lang).toBe("tr");
    expect(document.title).toBe("Gizlilik | Cengizhan Köse");
    expect(
      document.head.querySelector('meta[name="description"]').content,
    ).toMatch(/gizlilik bildirimi/);
  });

  it("has Turkish headings and no English fallback text", () => {
    const { container } = renderPrivacy();
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
    // Nothing fell back to the EN content: TR's own text is on the page.
    expect(container.textContent).toContain(tr.intro);
    expect(container.textContent).not.toContain(CONTENT.en.privacy.intro);
    expect(tr).toEqual(CONTENT.tr.privacy);
  });

  it("lists the same recipients as the English page, in the same order", () => {
    const { container } = renderPrivacy();
    const ids = [...container.querySelectorAll("[data-processor]")].map(
      (item) => item.dataset.processor,
    );
    expect(ids).toEqual(
      CONTENT.en.privacy.privacyProcessors.map((processor) => processor.id),
    );
    const text = container.textContent;
    for (const name of ["EmailJS", "Cloudflare", "Umami", "Out Plane"]) {
      expect(text, name).toContain(name);
    }
    expect(text).not.toMatch(/Google Fonts/i);
  });

  it("states the Umami facts in Turkish", () => {
    const { container } = renderPrivacy();
    expect(container.textContent).toContain(T["privacy.umami.noCookies"]);
    expect(container.textContent).toContain(T["privacy.umami.noIpStorage"]);
    expect(container.textContent).toContain(T["privacy.umami.dnt"]);
  });

  it("links the opt-out under /tr and the address with mailto", () => {
    renderPrivacy();
    expect(
      screen.getByRole("link", { name: T["privacy.umami.optOut"] }),
    ).toHaveAttribute("href", "/tr?analytics=off");
    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href") === `mailto:${email}`),
    ).toHaveLength(2);
  });

  it("has the date in Turkish and the KVKK md. 11 rights", () => {
    const { container } = renderPrivacy();
    expect(container.querySelector("time").textContent).toBe(
      "Son güncelleme: 1 Ekim 2026",
    );
    const rights = screen
      .getByRole("heading", { name: T["privacy.section.rights"] })
      .closest(".row");
    expect(within(rights).getByText(/11\. maddesi/)).toBeTruthy();
    expect(within(rights).getAllByRole("listitem")).toHaveLength(
      tr.rights.items.length,
    );
  });
});
