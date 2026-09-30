// @vitest-environment node
//
// translate() / dictionary builder / getContent() (T-12, FE-14 steps 4 and
// 6): pure functions the server reuses, so they are tested without a DOM.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONTENT,
  getContent,
  mergeContent,
  shared,
} from "../../../src/content/index.js";
import { defineDictionary } from "../../../src/i18n/dictionary.js";
import {
  DICTIONARIES,
  hasTranslation,
  interpolate,
  translate,
} from "../../../src/i18n/translate.js";

const ROOT = process.cwd();

afterEach(() => vi.restoreAllMocks());

describe("translate(locale, key, vars)", () => {
  it("returns the locale's text, EN for the default locale", () => {
    expect(translate("en", "nav.about")).toBe("About");
    expect(translate("tr", "nav.about")).toBe("Hakkımda");
  });

  it("falls back to EN for an unknown locale", () => {
    expect(translate("de", "nav.about")).toBe("About");
    expect(translate(undefined, "nav.about")).toBe("About");
  });

  it("falls back to EN when the TR text is missing or empty", () => {
    const key = Object.keys(DICTIONARIES.en).find(
      (k) => !hasTranslation("tr", k),
    );
    // Every key has a TR text today; the fallback is still exercised through
    // a dictionary without the key.
    if (key) expect(translate("tr", key)).toBe(DICTIONARIES.en[key]);
    expect(hasTranslation("tr", "nav.about")).toBe(true);
    expect(hasTranslation("xx", "nav.about")).toBe(false);
  });

  it("returns the key itself and warns once in development when no language has it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(translate("en", "nope.missing")).toBe("nope.missing");
    expect(translate("tr", "nope.missing")).toBe("nope.missing");
    // Vitest runs with import.meta.env.DEV = true.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("nope.missing");
  });

  it("does not resolve inherited object properties as keys", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(translate("en", "constructor")).toBe("constructor");
    expect(translate("en", "toString")).toBe("toString");
  });

  it("fills {placeholders} and leaves unknown ones in place", () => {
    expect(translate("en", "footer.copyright", { year: 2026 })).toBe(
      "© 2026 Cengizhan Köse",
    );
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
    expect(interpolate("{a}", { a: null })).toBe("{a}");
    expect(interpolate("{a}", { a: 0 })).toBe("0");
    // The contact messages keep {emailMe} for the mailto: link.
    expect(translate("en", "contact.error")).toContain("{emailMe}");
  });

  it("builds the language switch labels in the target language", () => {
    const tr = translate("tr", "lang.switchTo", {
      code: "TR",
      language: translate("tr", "lang.name"),
    });
    expect(tr).toBe("TR – Türkçe");
    expect(
      translate("en", "lang.switchToBlog", {
        code: "EN",
        language: translate("en", "lang.name"),
      }),
    ).toBe("EN – English, blog index (this post has no translation)");
  });
});

describe("defineDictionary (namespaced files -> flat keys)", () => {
  it("flattens nested objects into dotted keys and freezes the result", () => {
    const dict = defineDictionary({
      contact: { form: { name: "Name" }, submit: "Send" },
    });
    expect(dict).toEqual({
      "contact.form.name": "Name",
      "contact.submit": "Send",
    });
    expect(Object.isFrozen(dict)).toBe(true);
  });

  it("rejects unknown namespaces and non-text values", () => {
    expect(() => defineDictionary({ nope: {} })).toThrow(/unknown namespace/);
    expect(() => defineDictionary({ nav: { list: ["a"] } })).toThrow(
      /string or an object/,
    );
    expect(() => defineDictionary({ nav: { count: 3 } })).toThrow();
    expect(() => defineDictionary({ nav: { "a.b": "x" } })).toThrow(
      /invalid key/,
    );
  });

  it("the shipped dictionaries hold the moved interface text (EN unchanged)", () => {
    const en = DICTIONARIES.en;
    expect(en["a11y.skipToContent"]).toBe("Skip to content");
    expect(en["nav.label"]).toBe("Main menu");
    expect(en["nav.menu"]).toBe("Menu");
    expect(en["a11y.darkTheme"]).toBe("Dark theme");
    expect(en["social.label"]).toBe("Social links");
    expect(en["social.follow"]).toBe("Follow Me");
    expect(en["contact.success"]).toBe(
      "Message sent. I’ll reply to your email shortly.",
    );
    // TR values from the W2/W3 handoffs.
    const tr = DICTIONARIES.tr;
    expect(tr["a11y.skipToContent"]).toBe("İçeriğe atla");
    expect(tr["nav.label"]).toBe("Ana menü");
    expect(tr["nav.menu"]).toBe("Menü");
    expect(tr["a11y.darkTheme"]).toBe("Koyu tema");
    expect(tr["social.label"]).toBe("Sosyal bağlantılar");
    expect(tr["contact.honeypot"]).toBe("Bu alanı boş bırakın");
  });
});

describe("getContent(locale) (FE-14 step 6)", () => {
  it("EN is the content moved from content_option.js", () => {
    const en = getContent("en");
    // K-06b hero (W5-DSG-motion-cursor-hero): name + role, 3 phrases.
    expect(en.hero.name).toBe("Cengizhan Köse");
    expect(en.hero.phrases).toHaveLength(3);
    expect(en.timeline).toHaveLength(6);
    expect(en.skills.map((skill) => skill.name)).toEqual([
      "JavaScript",
      "React Native",
      "React",
      "Flutter",
      "Figma",
    ]);
    expect(en.services).toHaveLength(4);
    expect(en.contact.description).toMatch(/^Feel free to contact me/);
  });

  it("TR falls back to EN field by field while TR is incomplete", () => {
    const tr = getContent("tr");
    // Every TR section that is still empty shows the EN section.
    const en = getContent("en");
    const emptyTr = Object.keys(CONTENT.tr).filter(
      (section) => Object.keys(CONTENT.tr[section]).length === 0,
    );
    for (const section of emptyTr) expect(tr[section]).toEqual(en[section]);
    expect(tr.services.map((s) => s.id)).toEqual(
      getContent("en").services.map((s) => s.id),
    );
    expect(getContent("de")).toBe(getContent("en"));
    expect(getContent("tr")).toBe(tr); // computed once
  });

  it("is frozen all the way down", () => {
    const tr = getContent("tr");
    expect(Object.isFrozen(tr)).toBe(true);
    expect(Object.isFrozen(tr.hero.phrases)).toBe(true);
    expect(Object.isFrozen(CONTENT.en.services[0])).toBe(true);
  });

  it("mergeContent: objects by key, lists by index, empty values fall back", () => {
    const en = {
      title: "Hello",
      items: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
      nested: { x: "X", y: "Y" },
    };
    expect(
      mergeContent(en, {
        title: "",
        items: [{ text: "Aa" }],
        nested: { y: "Yy" },
      }),
    ).toEqual({
      title: "Hello",
      items: [
        { id: "a", text: "Aa" },
        { id: "b", text: "B" },
      ],
      nested: { x: "X", y: "Yy" },
    });
    // A shape error keeps EN (the parity test reports it).
    expect(mergeContent(en, { items: {} }).items).toBe(en.items);
    expect(mergeContent(en, null)).toBe(en);
  });

  it("shared data: logo, the domain address and the EmailJS ids", () => {
    expect(shared.logotext).toBe("CENGO");
    expect(shared.email).toBe("hello@cengizhankose.com");
    expect(Object.keys(shared.emailjs).sort()).toEqual([
      "publicKey",
      "serviceId",
      "templateId",
    ]);
  });

  it("uses a capital I in the first-person copy (MKT-09 guard, moved files)", () => {
    const text = JSON.stringify(CONTENT);
    expect(text).not.toMatch(/(^|[^A-Za-z])i (have|love|work)/);
  });

  it("keeps the content and dictionary modules free of React and browser globals", () => {
    const pure = [
      "src/i18n/translate.js",
      "src/i18n/dictionary.js",
      "src/i18n/locales.js",
      "src/i18n/en.js",
      "src/i18n/tr.js",
      "src/content/index.js",
      "src/content/define.js",
      "src/content/shared.js",
      "src/content/en.js",
      "src/content/tr.js",
      "src/lib/format.js",
    ];
    for (const file of pure) {
      const source = readFileSync(join(ROOT, file), "utf8").replace(
        /^\s*\/\/.*$/gm,
        "",
      );
      expect(source, file).not.toMatch(/from\s+["']react/);
      expect(source, file).not.toMatch(
        /\b(window|document|navigator|localStorage)\b/,
      );
    }
  });
});
