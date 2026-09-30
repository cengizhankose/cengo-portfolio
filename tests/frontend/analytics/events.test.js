// @vitest-environment node
//
// ANL-19 / ANL-01: the event catalogue and its property allowlist.
import { describe, expect, it } from "vitest";
import {
  CONTENT_LANGUAGES,
  CTA,
  CTA_IDS,
  CV_LANGUAGES,
  EVENT_NAMES,
  EVENTS,
  FEATURED_PROJECT_IDS,
  GLOBAL_PROPS,
  isKnownEvent,
  LINK_TYPES,
  MAX_STRING_LENGTH,
  NETWORK_HOSTS,
  NETWORKS,
  PAGE_TYPES,
  PII_KEYS,
  PROJECT_IDS,
  PROPS,
  sanitizeProps,
  UI_LOCALES,
} from "../../../src/lib/analytics/events.js";

describe("event catalogue (ANL-19)", () => {
  it("has the 16 planned events (B3's 15 + locale_switched)", () => {
    expect(EVENT_NAMES).toHaveLength(16);
    expect(EVENT_NAMES).toEqual(
      expect.arrayContaining([
        "page_view",
        "cta_clicked",
        "outbound_link_clicked",
        "email_link_clicked",
        "contact_form_started",
        "contact_form_submitted",
        "cv_downloaded",
        "project_clicked",
        "blog_read_progress",
        "blog_post_engaged",
        "not_found_viewed",
        "error_occurred",
        "web_vital_reported",
        "locale_switched",
        "nav_menu_opened",
        "theme_toggled",
      ]),
    );
  });

  it("names every event object_action in lower snake case", () => {
    for (const name of EVENT_NAMES) {
      expect(name).toMatch(/^[a-z]+(_[a-z]+)+$/);
      expect(name.length).toBeLessThanOrEqual(50); // Umami truncates at 50
    }
  });

  it("defines a value rule for every property an event allows", () => {
    for (const [name, def] of Object.entries(EVENTS)) {
      for (const key of [...GLOBAL_PROPS, ...def.props]) {
        expect(PROPS, `${name}.${key}`).toHaveProperty(key);
      }
      expect(["required", "nice_to_have"]).toContain(def.priority);
      expect(def.task).toMatch(/^ANL-\d{2}$/);
    }
  });

  it("never allows a PII key on any event", () => {
    const allowed = new Set([
      ...GLOBAL_PROPS,
      ...Object.values(EVENTS).flatMap((def) => def.props),
    ]);
    for (const key of PII_KEYS) expect(allowed.has(key)).toBe(false);
    for (const key of ["name", "email", "message", "phone", "ip"]) {
      expect(PII_KEYS).toContain(key);
    }
  });
});

describe("enums (ANL-19, K-11, K-12, T-12)", () => {
  it("NETWORKS is the K-11 order plus other, without facebook", () => {
    expect(NETWORKS).toEqual([
      "linkedin",
      "github",
      "x",
      "youtube",
      "twitch",
      "instagram",
      "other",
    ]);
    expect(Object.keys(NETWORK_HOSTS)).toEqual(NETWORKS.slice(0, -1));
    expect(Object.values(NETWORK_HOSTS).flat()).not.toContain("facebook.com");
  });

  it("locale enums follow T-12", () => {
    expect(UI_LOCALES).toEqual(["en", "tr"]);
    expect(CONTENT_LANGUAGES).toEqual(["en", "tr", "unknown"]);
    expect(CV_LANGUAGES).toEqual(["en", "tr"]);
  });

  it("page types cover every route type, prefix independent", () => {
    expect(PAGE_TYPES).toEqual([
      "home",
      "about",
      "portfolio",
      "contact",
      "privacy",
      "blog_index",
      "blog_post",
      "not_found",
    ]);
  });

  it("project ids: featured three first, all stable snake-case ids", () => {
    expect(FEATURED_PROJECT_IDS).toEqual(["salesgym", "farmin", "effort_lab"]);
    expect(PROJECT_IDS.slice(0, 3)).toEqual(FEATURED_PROJECT_IDS);
    expect(new Set(PROJECT_IDS).size).toBe(PROJECT_IDS.length);
    for (const id of PROJECT_IDS) expect(id).toMatch(/^[a-z0-9_]+$/);
  });

  it("link types and CTA ids", () => {
    expect(LINK_TYPES).toEqual(["demo", "repo", "case_study", "post"]);
    expect(CTA.HERO_ABOUT).toBe("hero_about");
    expect(CTA.HERO_CONTACT).toBe("hero_contact");
    expect(new Set(CTA_IDS).size).toBe(CTA_IDS.length);
    for (const id of CTA_IDS) expect(id).toMatch(/^[a-z]+(_[a-z]+)+$/);
  });

  it("enums are frozen so no package can mutate them at runtime", () => {
    expect(Object.isFrozen(NETWORKS)).toBe(true);
    expect(Object.isFrozen(EVENTS)).toBe(true);
    expect(Object.isFrozen(EVENTS.page_view.props)).toBe(true);
  });
});

describe("sanitizeProps (ANL-01 step 5)", () => {
  it("drops PII and keeps allowed keys (plan example)", () => {
    expect(
      sanitizeProps("contact_form_submitted", {
        email: "a@b.c",
        result: "success",
      }),
    ).toEqual({ result: "success" });
  });

  it("refuses name/email/message/phone/ip on every event", () => {
    const pii = {
      name: "Jane",
      email: "a@b.c",
      message: "hello",
      phone: "+90 555",
      ip: "1.2.3.4",
    };
    for (const name of EVENT_NAMES) {
      const clean = sanitizeProps(name, pii);
      expect(Object.keys(clean), name).toEqual([]);
    }
  });

  it("drops keys the event does not allow", () => {
    expect(
      sanitizeProps("cta_clicked", {
        cta_id: "hero_contact",
        network: "github",
        page_path: "/about",
      }),
    ).toEqual({ cta_id: "hero_contact" });
  });

  it("allows the global context on every event and enforces its enums", () => {
    expect(
      sanitizeProps("cta_clicked", {
        cta_id: "hero_contact",
        page_type: "about",
        ui_locale: "tr",
        content_language: "tr",
      }),
    ).toEqual({
      cta_id: "hero_contact",
      page_type: "about",
      ui_locale: "tr",
      content_language: "tr",
    });
    expect(
      sanitizeProps("cta_clicked", { cta_id: "hero_contact", ui_locale: "de" }),
    ).toEqual({ cta_id: "hero_contact" });
  });

  it("drops out-of-enum values", () => {
    expect(
      sanitizeProps("outbound_link_clicked", {
        network: "facebook",
        location: "social_rail",
      }),
    ).toEqual({ location: "social_rail" });
    expect(
      sanitizeProps("project_clicked", {
        project_id: "effort-lab",
        link_type: "repo",
        position: 2,
      }),
    ).toEqual({ link_type: "repo", position: 2 });
  });

  it("cuts strings at 100 characters before checking them", () => {
    const slug = "a".repeat(140);
    const clean = sanitizeProps("blog_read_progress", {
      post_slug: slug,
      percent: 25,
    });
    expect(clean.post_slug).toHaveLength(MAX_STRING_LENGTH);
    expect(clean.percent).toBe(25);
  });

  it("rejects values that are not tokens (no URLs or free text)", () => {
    expect(
      sanitizeProps("outbound_link_clicked", {
        network: "other",
        link_host: "https://example.org/private?q=1",
        location: "Social Rail",
      }),
    ).toEqual({ network: "other" });
    expect(
      sanitizeProps("outbound_link_clicked", {
        network: "other",
        link_host: "example.org",
      }),
    ).toEqual({ network: "other", link_host: "example.org" });
  });

  it("checks numbers: finite value, integer position in range", () => {
    expect(
      sanitizeProps("web_vital_reported", {
        metric: "LCP",
        value: Number.NaN,
        rating: "good",
      }),
    ).toEqual({ metric: "LCP", rating: "good" });
    expect(
      sanitizeProps("project_clicked", { project_id: "farmin", position: 0 }),
    ).toEqual({ project_id: "farmin" });
    expect(
      sanitizeProps("error_occurred", {
        scope: "blog_api",
        endpoint: "list",
        status: 500,
      }),
    ).toEqual({ scope: "blog_api", endpoint: "list", status: "500" });
  });

  it("returns nothing for unknown events and non-object props", () => {
    expect(sanitizeProps("contact_form_failed", { result: "error" })).toEqual(
      {},
    );
    expect(sanitizeProps("page_view", null)).toEqual({});
    expect(isKnownEvent("page_view")).toBe(true);
    expect(isKnownEvent("toString")).toBe(false);
  });
});
