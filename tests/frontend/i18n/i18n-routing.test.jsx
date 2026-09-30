// FE-14 criterion 1 (today's LIVE table): /about is EN and its menu text is
// en.js's nav.*; /tr/about is NotFound until the TR pages open. The TR half
// (LIVE mocked open) is in i18n-routing-tr-live.test.jsx.
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppRoutes from "../../../src/app/routes";
import Headermain from "../../../src/header";
import {
  translate,
  useLocale,
  useLocalePath,
  useRoute,
  useT,
  useUiLocale,
} from "../../../src/i18n";
import { DICTIONARIES } from "../../../src/i18n/translate.js";

function Probe() {
  const route = useRoute();
  const t = useT();
  const lp = useLocalePath();
  return (
    <output
      data-testid="probe"
      data-locale={useLocale()}
      data-ui-locale={useUiLocale()}
      data-route={route.type}
      data-about-link={lp("/about")}
      data-t={t("nav.about")}
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

const probe = () => screen.getByTestId("probe").dataset;
const NAV_KEYS = ["home", "portfolio", "about", "blog", "contact"];

beforeEach(() => {
  document.head.innerHTML = "<title>x</title>";
  document.documentElement.lang = "en";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { status: 200 })),
  );
});

describe("language from the URL prefix (T-12)", () => {
  it("/about: useLocale() is 'en' and the menu shows en.js nav.* texts", async () => {
    renderAt("/about");
    await screen.findByRole("heading", { level: 1, name: "About me" });

    expect(probe()).toMatchObject({
      locale: "en",
      uiLocale: "en",
      route: "static",
      aboutLink: "/about",
      t: DICTIONARIES.en["nav.about"],
    });
    const menu = screen.getByRole("navigation", {
      name: DICTIONARIES.en["nav.label"],
    });
    expect(
      within(menu)
        .getAllByRole("link", { hidden: true })
        .map((link) => link.textContent),
    ).toEqual(NAV_KEYS.map((key) => DICTIONARIES.en[`nav.${key}`]));
    expect(screen.getByRole("banner")).toHaveAttribute("lang", "en");
  });

  it("/tr/about renders NotFound while the TR pages are closed", async () => {
    renderAt("/tr/about");
    await screen.findByRole("heading", { level: 1, name: "Page not found" });
    // The URL is Turkish, the interface stays English (nothing TR is live).
    expect(probe()).toMatchObject({
      locale: "tr",
      uiLocale: "en",
      route: "notfound",
      aboutLink: "/about",
    });
    expect(screen.queryByRole("heading", { name: "About me" })).toBeNull();
  });

  it("a TR post: Turkish URL, English interface linking to English pages (DSG-19 uiLang)", () => {
    renderAt("/tr/blog/some-post");
    expect(probe()).toMatchObject({
      locale: "tr",
      uiLocale: "en",
      route: "post",
      aboutLink: "/about",
      t: "About",
    });
    expect(screen.getByRole("banner")).toHaveAttribute("lang", "en");
    expect(
      screen.getByRole("complementary", {
        name: translate("en", "social.label"),
      }),
    ).toHaveAttribute("lang", "en");
  });

  it("every internal menu link points at a live page", () => {
    renderAt("/tr/blog/some-post");
    const menu = screen.getByRole("navigation", { name: "Main menu" });
    for (const link of within(menu).getAllByRole("link", { hidden: true })) {
      expect(link.getAttribute("href")).not.toMatch(/^\/tr/);
    }
  });
});
