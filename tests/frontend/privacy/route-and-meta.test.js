// SEC-25 / ANL-04 routing and head: /privacy is a known static route
// (server 200, client page), /tr/privacy opens with the other TR pages, the
// meta comes from src/seo/pages/privacy.js and the hreflang pair appears once
// TR is live.
import { describe, expect, it } from "vitest";
import { PAGE_ROUTES } from "../../../src/app/pageRoutes.jsx";
import {
  alternatesFor,
  canonicalUrl,
  getPageMeta,
  pages,
  TITLE_MAX_LENGTH,
} from "../../../src/seo/pages.js";
import {
  ALL_LIVE,
  LIVE,
  matchRoute,
  STATIC_PATHS,
} from "../../../src/seo/routes.js";

describe("the /privacy route", () => {
  it("is a static path with a page registry entry and a client route", () => {
    expect(STATIC_PATHS).toContain("/privacy");
    expect(pages["/privacy"]).toBeDefined();
    expect(PAGE_ROUTES.map((route) => route.path)).toContain("/privacy");
  });

  it("/privacy is a live static route; /tr/privacy waits for the TR flip", () => {
    expect(matchRoute("/privacy")).toMatchObject({
      type: "static",
      locale: "en",
      path: "/privacy",
    });
    expect(matchRoute("/privacy/")).toMatchObject({ type: "static" });
    expect(LIVE.static).not.toContain("tr");
    expect(matchRoute("/tr/privacy").type).toBe("notfound");
    expect(matchRoute("/tr/privacy", ALL_LIVE)).toMatchObject({
      type: "static",
      locale: "tr",
      path: "/privacy",
    });
    expect(matchRoute("/Privacy").type).toBe("notfound");
  });
});

describe("the /privacy meta", () => {
  it("has a T-07 title and a description in both languages", () => {
    const en = getPageMeta("/privacy", "en");
    const tr = getPageMeta("/tr/privacy", "tr", {}, ALL_LIVE);
    expect(en.title).toBe("Privacy | Cengizhan Köse");
    expect(tr.title).toBe("Gizlilik | Cengizhan Köse");
    for (const meta of [en, tr]) {
      expect(meta.title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
      // SEO-09: 140-160 characters, with the name in it.
      expect(meta.description.length).toBeGreaterThanOrEqual(140);
      expect(meta.description.length).toBeLessThanOrEqual(160);
      expect(meta.description).toContain("Cengizhan Köse");
      expect(meta.robots).toBeNull();
    }
    expect(en.lang).toBe("en");
    expect(tr.lang).toBe("tr");
  });

  it("is canonical under its own address, without hreflang until TR opens", () => {
    expect(canonicalUrl("/privacy", "en")).toBe(
      "https://www.cengizhankose.com/privacy",
    );
    expect(getPageMeta("/privacy", "en").canonical).toBe(
      "https://www.cengizhankose.com/privacy",
    );
    expect(alternatesFor("/privacy")).toEqual([]);
  });

  it("pairs /privacy with /tr/privacy (en, tr, x-default) once TR is live", () => {
    const expected = [
      { hreflang: "en", href: "https://www.cengizhankose.com/privacy" },
      { hreflang: "tr", href: "https://www.cengizhankose.com/tr/privacy" },
      { hreflang: "x-default", href: "https://www.cengizhankose.com/privacy" },
    ];
    expect(alternatesFor("/privacy", {}, ALL_LIVE)).toEqual(expected);
    expect(alternatesFor("/tr/privacy", {}, ALL_LIVE)).toEqual(expected);
    const meta = getPageMeta("/tr/privacy", "tr", {}, ALL_LIVE);
    expect(meta.canonical).toBe("https://www.cengizhankose.com/tr/privacy");
    expect(meta.og.locale).toBe("tr_TR");
    expect(meta.og.localeAlternate).toEqual(["en_US"]);
  });
});
