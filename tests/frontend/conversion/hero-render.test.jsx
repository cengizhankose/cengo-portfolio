// MKT-02, MKT-16, MKT-19, DSG-28, ANL-02 (hero half), rendered: the home hero
// in both languages. The TR pages are not live yet (LIVE.static = ['en']), so
// the route table is mocked as after SEO-11 Adım B to render /tr. Analytics is
// mocked: the test reads what the buttons would send.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import home from "../../../src/pages/home/home.module.css";
import buttonStyles from "../../../src/components/actionbutton/button.module.css";

vi.mock("../../../src/seo/routes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LIVE: actual.ALL_LIVE,
    matchRoute: (pathname, live = actual.ALL_LIVE) =>
      actual.matchRoute(pathname, live),
  };
});
vi.mock("../../../src/lib/analytics/index.js", () => ({ track: vi.fn() }));

const { Home } = await import("../../../src/pages/home/index.jsx");
const { getContent } = await import("../../../src/content/index.js");
const { translate } = await import("../../../src/i18n/translate.js");
const { track } = await import("../../../src/lib/analytics/index.js");
const { sanitizeProps } = await import("../../../src/lib/analytics/events.js");

const normalise = (text) => text.replace(/\s+/g, " ").trim();

function renderHome(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Home />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  track.mockReset();
  document.head.innerHTML = "<title>x</title>";
});

describe.each([
  ["/", "en", "/contact", "/portfolio"],
  ["/tr", "tr", "/tr/contact", "/tr/portfolio"],
])("%s", (path, locale, contactHref, portfolioHref) => {
  const { hero, contact } = getContent(locale);
  const t = (key, vars) => translate(locale, key, vars);

  it("has one static h1, name and role, and nothing that types or loops", () => {
    renderHome(path);

    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(
      normalise(screen.getByRole("heading", { level: 1 }).textContent),
    ).toBe(`${hero.name} ${hero.role}`);
    expect(
      document.querySelector(`h1 .Typewriter, h1 .${home.rotator}`),
    ).toBeNull();
  });

  it("MKT-19: one button, to the contact page, with the decided label", () => {
    renderHome(path);

    const buttons = document.querySelectorAll(`#home .${buttonStyles.button}`);
    expect(buttons).toHaveLength(1);
    const button = buttons[0];
    expect(button.tagName).toBe("A");
    expect(button.id).toBe("button_h");
    expect(button.getAttribute("href")).toBe(contactHref);
    expect(button.getAttribute("href")).toMatch(/\/contact$/);
    expect(normalise(button.textContent)).toBe(t("cta.primary"));
  });

  it("DSG-28: no block inside the button link, the rings are decorative spans", () => {
    renderHome(path);

    expect(document.querySelectorAll(`.${home.actions} a div`)).toHaveLength(0);
    const button = document.getElementById("button_h");
    const rings = [...button.querySelectorAll(`.${buttonStyles.ring}`)];
    expect(rings.map((ring) => [ring.tagName, ring.className])).toEqual([
      ["SPAN", `${buttonStyles.ring} ${buttonStyles.ringOne}`],
      ["SPAN", `${buttonStyles.ring} ${buttonStyles.ringTwo}`],
      ["SPAN", `${buttonStyles.ring} ${buttonStyles.ringThree}`],
    ]);
    for (const ring of rings) {
      expect(ring).toHaveAttribute("aria-hidden", "true");
      expect(ring.textContent).toBe("");
    }
    // The accessible name is the label only.
    expect(screen.getByRole("link", { name: t("cta.primary") })).toBe(button);
  });

  it("MKT-19: the second path is an evidence link to the portfolio, not a second button", () => {
    renderHome(path);

    const link = document.querySelector(
      `#home a[href$="/portfolio"]:not(.${buttonStyles.button})`,
    );
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe(portfolioHref);
    expect(link.className).toBe(home.textLink);
    expect(normalise(link.textContent)).toBe(`${t("cta.secondary")} →`);
    // The arrow is decoration: the accessible name is the label.
    expect(link.querySelector("[aria-hidden='true']").textContent).toBe("→");
    expect(screen.getByRole("link", { name: t("cta.secondary") })).toBe(link);
  });

  it("MKT-19: the button comes before the link, then the reply note", () => {
    renderHome(path);

    const button = document.getElementById("button_h");
    const link = document.querySelector(`.${home.textLink}`);
    const note = document.querySelector(`.${home.note}`);
    expect(button.compareDocumentPosition(link)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(link.compareDocumentPosition(note)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("MKT-19 / MKT-10: the note carries the one reply promise of the contact content", () => {
    renderHome(path);

    const note = document.querySelector(`.${home.note}`).textContent;
    expect(note).toBe(t("cta.note", { time: contact.responseTime }));
    expect(note).toContain(contact.responseTime);
    expect(note).not.toMatch(/[[\]{}]/);
  });

  it("MKT-19: the first Tab stop in the hero is the button", async () => {
    const user = userEvent.setup();
    renderHome(path);

    const stops = [
      ...document.querySelectorAll(
        "#home a[href], #home button, #home input, #home select, #home textarea",
      ),
    ];
    expect(stops[0]).toBe(document.getElementById("button_h"));
    expect(stops[1]).toBe(document.querySelector(`.${home.textLink}`));

    await user.tab();
    expect(document.activeElement).toBe(document.getElementById("button_h"));
    await user.tab();
    expect(document.activeElement).toBe(
      document.querySelector(`.${home.textLink}`),
    );
  });

  it("MKT-02 / MKT-16: lead, then the status line, then the turning line, then the proof line", () => {
    renderHome(path);

    const order = [
      document.querySelector("h1"),
      document.querySelector(`.${home.introLead}`),
      document.querySelector(`.${home.introStatus}`),
      document.querySelector(`.${home.introTagline}`),
      document.querySelector(`.${home.introProof}`),
      document.querySelector(`.${home.actions}`),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i])).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
    expect(document.querySelector(`.${home.introLead}`).textContent).toBe(
      hero.lead,
    );
    expect(document.querySelector(`.${home.introProof}`).textContent).toBe(
      hero.proofLine,
    );
  });

  it("MKT-16: the availability is closed, so the status line is the location", () => {
    renderHome(path);

    const status = document.querySelector(`.${home.introStatus}`);
    expect(status.textContent).toBe(hero.location);
    expect(status).toHaveAttribute("data-status", "closed");
    expect(document.querySelector("#home").textContent).not.toMatch(/[[\]]/);
  });

  it("MKT-16: the subheadline is at most two sentences", () => {
    renderHome(path);

    const text = `${document.querySelector(`.${home.introLead}`).textContent} ${
      document.querySelector(`.${home.introStatus}`).textContent
    }`;
    expect(text.match(/[.!?](?:\s|$)/g)?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it("MKT-02: screen readers get the sentence once, the moving line stays hidden", () => {
    renderHome(path);

    const rotator = document.querySelector(`.${home.rotator}`);
    expect(rotator).toHaveAttribute("aria-hidden", "true");
    expect(rotator.closest("h1")).toBeNull();
    expect(
      document.querySelector(`.${home.introTagline} .visually-hidden`)
        .textContent,
    ).toBe(hero.phrasesText);
    expect([...rotator.children].map((span) => span.textContent)).toEqual(
      hero.phrases,
    );
  });

  it("ANL-02: the button reports hero_contact, the link hero_portfolio (catalogue values)", async () => {
    const user = userEvent.setup();
    renderHome(path);

    await user.click(document.getElementById("button_h"));
    expect(track).toHaveBeenLastCalledWith("cta_clicked", {
      cta_id: "hero_contact",
    });

    await user.click(document.querySelector(`.${home.textLink}`));
    expect(track).toHaveBeenLastCalledWith("cta_clicked", {
      cta_id: "hero_portfolio",
    });
    expect(track).toHaveBeenCalledTimes(2);

    // sanitizeProps keeps both ids: they are not dropped as unknown values.
    for (const [name, props] of track.mock.calls) {
      expect(sanitizeProps(name, props)).toEqual(props);
    }
  });
});
