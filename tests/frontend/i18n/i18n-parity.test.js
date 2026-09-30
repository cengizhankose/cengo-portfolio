// @vitest-environment node
//
// FE-14 criterion 3 (i18n-parity): the TR dictionary and content files never
// have keys or paths EN lacks; once the TR pages are live (LIVE.static has
// 'tr', W11 / SEO-11 Adım B) the check turns strict by itself: equal key and
// path sets, equal list lengths, no empty text. Also: one file per
// namespace/section in both languages (the parallel-safety contract of W4),
// ANL-19's stable service ids, and the NotFound strings moved from
// src/pages/notfound/copy.js.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT, SECTIONS } from "../../../src/content/index.js";
import { NAMESPACES } from "../../../src/i18n/dictionary.js";
import { DICTIONARIES } from "../../../src/i18n/translate.js";
import { LIVE } from "../../../src/seo/routes.js";
import { contentGaps, dictionaryGaps } from "./parity.js";

const ROOT = process.cwd();
const STRICT = LIVE.static.includes("tr");
const files = (dir) =>
  readdirSync(join(ROOT, dir))
    .filter((name) => name.endsWith(".js"))
    .map((name) => name.replace(/\.js$/, ""))
    .sort();

describe(`EN/TR parity (${STRICT ? "strict: TR is live" : "Adım A: TR may fall back to EN"})`, () => {
  it("dictionaries", () => {
    expect(
      dictionaryGaps(DICTIONARIES.en, DICTIONARIES.tr, { strict: STRICT }),
    ).toEqual([]);
  });

  it("content files", () => {
    expect(contentGaps(CONTENT.en, CONTENT.tr, { strict: STRICT })).toEqual([]);
  });

  it("EN has no empty text and no empty dictionary value", () => {
    for (const [key, value] of Object.entries(DICTIONARIES.en)) {
      expect(value.trim(), key).not.toBe("");
    }
  });
});

describe("one file per namespace and per section in every language", () => {
  it.each(["en", "tr"])("src/i18n/%s/ has exactly the namespaces", (lang) => {
    expect(files(`src/i18n/${lang}`)).toEqual([...NAMESPACES].sort());
  });

  it.each(["en", "tr"])("src/content/%s/ has exactly the sections", (lang) => {
    expect(files(`src/content/${lang}`)).toEqual([...SECTIONS].sort());
  });

  it("the aggregated dictionaries cover every namespace", () => {
    const used = new Set(
      Object.keys(DICTIONARIES.en).map((key) => key.split(".")[0]),
    );
    // Namespaces with keys today; the others are pre-created, still empty.
    for (const ns of ["a11y", "nav", "footer", "contact", "blog", "lang"]) {
      expect(used.has(ns), ns).toBe(true);
    }
    for (const key of Object.keys(DICTIONARIES.en)) {
      expect(NAMESPACES).toContain(key.split(".")[0]);
    }
  });

  it("both languages have every content section", () => {
    expect(Object.keys(CONTENT.en).sort()).toEqual([...SECTIONS].sort());
    expect(Object.keys(CONTENT.tr).sort()).toEqual([...SECTIONS].sort());
  });
});

describe("parity checker (so the strict switch really catches gaps)", () => {
  const en = { "nav.a": "A", "nav.b": "B" };

  it("lenient: missing TR keys are fine, extra ones are not", () => {
    expect(dictionaryGaps(en, { "nav.a": "A" }, { strict: false })).toEqual([]);
    expect(dictionaryGaps(en, { "nav.x": "X" }, { strict: false })).toEqual([
      "tr has a key EN lacks: nav.x",
    ]);
  });

  it("strict: missing keys and empty texts are gaps", () => {
    expect(
      dictionaryGaps(en, { "nav.a": "A", "nav.b": " " }, { strict: true }),
    ).toEqual(["tr has an empty text: nav.b"]);
    expect(dictionaryGaps(en, { "nav.a": "A" }, { strict: true })).toEqual([
      "tr is missing: nav.b",
    ]);
  });

  it("content: kinds, list lengths, ids and missing paths", () => {
    const base = { hero: { phrases: ["a", "b"] }, services: [{ id: "x" }] };
    expect(contentGaps(base, { hero: {} }, { strict: false })).toEqual([]);
    expect(
      contentGaps(base, { hero: { phrases: "a" } }, { strict: false }),
    ).toEqual(["tr changes the kind at hero.phrases: array -> string"]);
    expect(
      contentGaps(base, { services: [{ id: "y" }] }, { strict: false }),
    ).toEqual(["tr id differs at services[0].id: x -> y"]);
    expect(
      contentGaps(
        base,
        { hero: { phrases: ["a", "b", "c"] } },
        {
          strict: false,
        },
      ),
    ).toEqual([
      "tr list is longer than EN at hero.phrases",
      "tr has a path EN lacks: hero.phrases[2]",
    ]);
    expect(
      contentGaps(
        base,
        { hero: { phrases: ["x"] }, services: [{ id: "x" }] },
        { strict: true },
      ),
    ).toEqual([
      "list length differs at hero.phrases",
      "tr is missing: hero.phrases[1]",
    ]);
  });
});

describe("stable service ids (ANL-19 step 3, W2-ANL handoff)", () => {
  const ids = (list) => list.map((service) => service.id);

  it("EN services have the agreed unique ids", () => {
    expect(ids(CONTENT.en.services)).toEqual([
      "mobile_app_dev",
      "management",
      "fullstack_web",
      "ui_ux",
    ]);
  });

  it("TR services carry the same ids at the same positions", () => {
    CONTENT.tr.services.forEach((service, index) => {
      if (service.id !== undefined) {
        expect(service.id).toBe(CONTENT.en.services[index].id);
      }
    });
  });
});

describe("NotFound strings (moved from src/pages/notfound/copy.js)", () => {
  const COPY = join(ROOT, "src/pages/notfound/copy.js");

  // copy.js is deleted at the W4 merge (handoff); until then the two must
  // not drift.
  it.skipIf(!existsSync(COPY))(
    "the notFound namespace equals the old copy module",
    async () => {
      const { NOT_FOUND_COPY } =
        await import("../../../src/pages/notfound/copy.js");
      for (const lang of ["en", "tr"]) {
        const dict = DICTIONARIES[lang];
        const copy = NOT_FOUND_COPY[lang];
        expect(dict["notFound.page.title"]).toBe(copy.page.title);
        expect(dict["notFound.page.text"]).toBe(copy.page.text);
        expect(dict["notFound.post.title"]).toBe(copy.post.title);
        expect(dict["notFound.post.text"]).toBe(copy.post.text);
        expect(dict["notFound.home"]).toBe(copy.home);
        expect(dict["notFound.blog"]).toBe(copy.blog);
        expect(dict["notFound.backToBlog"]).toBe(copy.backToBlog);
      }
    },
  );
});
