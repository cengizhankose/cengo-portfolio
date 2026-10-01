// FE-14 criterion 1, TR half: with the real route table (LIVE.static =
// ['en', 'tr'] since W11, SEO-11 Adım B), /tr/about is the About page in
// Turkish: useLocale() is 'tr', the menu shows tr.js's nav.* texts,
// internal links carry the /tr prefix and the page headings come from TR.
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { default: AppRoutes } = await import("../../../src/app/routes");
const { default: Headermain } = await import("../../../src/header");
const { useLocale, useUiLocale } = await import("../../../src/i18n");
const { DICTIONARIES } = await import("../../../src/i18n/translate.js");

function Probe() {
  return (
    <output
      data-testid="probe"
      data-locale={useLocale()}
      data-ui-locale={useUiLocale()}
    />
  );
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Headermain />
      <AppRoutes />
      <Probe />
    </MemoryRouter>,
  );
}

const NAV_KEYS = ["home", "portfolio", "about", "blog", "contact"];
const TR = DICTIONARIES.tr;

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  document.documentElement.lang = "en";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { status: 200 })),
  );
});

describe("with the TR pages live", () => {
  it("/tr/about: 'tr', TR menu texts and /tr links", async () => {
    renderAt("/tr/about");
    await screen.findByRole("heading", { level: 1, name: TR["about.title"] });

    expect(screen.getByTestId("probe").dataset).toMatchObject({
      locale: "tr",
      uiLocale: "tr",
    });
    const menu = screen.getByRole("navigation", { name: TR["nav.label"] });
    const links = within(menu).getAllByRole("link", { hidden: true });
    expect(links.map((link) => link.textContent)).toEqual(
      NAV_KEYS.map((key) => TR[`nav.${key}`]),
    );
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/tr",
      "/tr/portfolio",
      "/tr/about",
      "/tr/blog",
      "/tr/contact",
    ]);
    expect(screen.getByRole("banner")).toHaveAttribute("lang", "tr");
    expect(
      screen.getByRole("button", { name: TR["a11y.darkTheme"] }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: TR["a11y.skipToContent"] }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      TR["about.intro"],
      TR["about.proof"],
      TR["about.timeline"],
      TR["about.skills"],
      TR["about.services"],
      TR["about.awards"],
      TR["about.talks"],
      TR["about.cta.title"],
    ]);
  });

  it("/about stays English", async () => {
    renderAt("/about");
    await screen.findByRole("heading", {
      level: 1,
      name: DICTIONARIES.en["about.title"],
    });
    expect(screen.getByTestId("probe").dataset.locale).toBe("en");
    expect(
      screen.getByRole("navigation", { name: "Main menu" }),
    ).toBeInTheDocument();
  });

  it("/tr: the home page with TR call-to-action links", async () => {
    renderAt("/tr");
    const main = within(screen.getByRole("main"));
    // W7-MKT-hero-contact-conversion (MKT-19): one button to the contact
    // page and an evidence link to the portfolio.
    // The closing call to action (MKT-03) repeats the label: the hero's
    // button comes first.
    expect(
      (await main.findAllByRole("link", { name: TR["cta.primary"] }))[0],
    ).toHaveAttribute("href", "/tr/contact");
    expect(
      main.getByRole("link", { name: TR["cta.secondary"] }),
    ).toHaveAttribute("href", "/tr/portfolio");
  });
});
