// @vitest-environment node
//
// MKT-02, MKT-16, MKT-19 (copy and data half): the hero content of both
// languages against the decided copy (00-icerik-girdileri §2.4, the brief in
// .agents/product-marketing.md) and the plan's grep criteria. The rendered
// half is in hero-render.test.jsx.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT, getContent } from "../../../src/content/index.js";
import { DICTIONARIES } from "../../../src/i18n/translate.js";
import { AVAILABILITY_STATUSES } from "../../../src/pages/home/heroStatus.js";

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), "utf8");

function files(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      return entry.isDirectory() ? files(path) : [path];
    },
  );
}

const EN = CONTENT.en.hero;
const TR = CONTENT.tr.hero;
const sentences = (text) => text.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [text];

describe("hero copy (MKT-02 step 2)", () => {
  it("EN is the decided copy", () => {
    expect(EN).toMatchObject({
      name: "Cengizhan Köse",
      role: "Senior Fullstack Engineer",
      roleLang: "en",
      headline: "Cengizhan Köse — Senior Fullstack Engineer",
      lead: "I build web and mobile products end to end with TypeScript, React, Node.js and React Native.",
      phrases: [
        "Shipping for fleet technology",
        "Shipping for e-commerce",
        "Fleet tech, e-commerce and AI.",
      ],
      phrasesText: "I build products for fleet technology, e-commerce and AI.",
      proofLine: "4× hackathon winner · 6+ years",
    });
  });

  it("TR is the decided copy, written in TR (no EN fallback)", () => {
    expect(TR).toMatchObject({
      name: "Cengizhan Köse",
      role: "Senior Fullstack Engineer",
      roleLang: "en",
      headline: "Cengizhan Köse — Senior Fullstack Engineer",
      lead: "TypeScript, React, Node.js ve React Native ile web ve mobil ürünleri uçtan uca geliştiriyorum.",
      phrases: [
        "Filo teknolojisi için ürün geliştiriyorum",
        "E-ticaret için ürün geliştiriyorum",
        "Filo teknolojisi, e-ticaret ve yapay zekâ.",
      ],
      phrasesText:
        "Filo teknolojisi, e-ticaret ve yapay zekâ için ürün geliştiriyorum.",
      proofLine: "4 hackathon birinciliği · 6+ yıl",
    });
    for (const field of ["lead", "location", "phrasesText", "proofLine"]) {
      expect(TR[field], field).not.toBe(EN[field]);
    }
  });

  it("the headline is the name and the role on one line, in both languages", () => {
    for (const hero of [EN, TR]) {
      expect(hero.headline).toBe(`${hero.name} — ${hero.role}`);
    }
  });

  it("the last phrase is the settled state and phrasesText says the same in a sentence", () => {
    expect(EN.phrases.at(-1)).toBe("Fleet tech, e-commerce and AI.");
    expect(EN.phrasesText).toMatch(/fleet technology, e-commerce and AI\.$/);
    expect(TR.phrases.at(-1)).toBe(
      "Filo teknolojisi, e-ticaret ve yapay zekâ.",
    );
    expect(TR.phrasesText).toMatch(/Filo teknolojisi, e-ticaret ve yapay zekâ/);
    expect(TR.phrases).toHaveLength(EN.phrases.length);
  });

  it("the proof line carries only numbers the brief lists (6+ years, 4 firsts)", () => {
    const brief = read(".agents/product-marketing.md");
    expect(brief).toContain("6+ years");
    expect(brief).toMatch(/four of them first place|4 first places/);
    expect(EN.proofLine.match(/\d+\+?/g)).toEqual(["4", "6+"]);
    expect(TR.proofLine.match(/\d+\+?/g)).toEqual(["4", "6+"]);
  });
});

describe("availability and location (MKT-16)", () => {
  it("has the same status in both languages, one of open / limited / closed", () => {
    expect(TR.availability.status).toBe(EN.availability.status);
    expect(AVAILABILITY_STATUSES).toContain(EN.availability.status);
  });

  it("is closed until the owner confirms a sentence: nothing is invented", () => {
    expect(EN.availability.status).toBe("closed");
    expect(EN.location).toBe("Based in Istanbul, Türkiye.");
    expect(TR.location).toBe("İstanbul’dan çalışıyorum.");
  });

  it("keeps the owner's draft sentences with their brackets", () => {
    expect(EN.availability.text).toMatch(/\[.+\]/);
    expect(TR.availability.text).toMatch(/\[.+\]/);
  });

  it("the subheadline (lead + second sentence) is at most two sentences", () => {
    for (const hero of [EN, TR]) {
      expect(sentences(hero.lead)).toHaveLength(1);
      expect(sentences(hero.location)).toHaveLength(1);
      expect(
        sentences(`${hero.lead} ${hero.location}`).length,
      ).toBeLessThanOrEqual(2);
    }
  });
});

describe("hero buttons (MKT-19 step 1)", () => {
  it("EN label, link label and reply note", () => {
    expect(DICTIONARIES.en["cta.primary"]).toBe("Tell me what you’re building");
    expect(DICTIONARIES.en["cta.secondary"]).toBe("See selected work");
    expect(DICTIONARIES.en["cta.note"]).toBe("I reply within {time}.");
  });

  it("TR label, link label and reply note", () => {
    expect(DICTIONARIES.tr["cta.primary"]).toBe("Ne geliştirdiğini anlat");
    expect(DICTIONARIES.tr["cta.secondary"]).toBe("Seçili işleri gör");
    expect(DICTIONARIES.tr["cta.note"]).toBe("{time} içinde dönüyorum.");
  });

  it("the old About / Contact labels are gone from the dictionaries", () => {
    for (const lang of ["en", "tr"]) {
      expect(DICTIONARIES[lang]).not.toHaveProperty("cta.aboutMe");
      expect(DICTIONARIES[lang]).not.toHaveProperty("cta.contactMe");
    }
  });
});

describe("plan grep criteria", () => {
  const home = [...files("src/pages/home"), ...files("src/content")];

  it("MKT-02 criterion 3: no template hero copy left in src/", () => {
    const hits = files("src").filter((file) =>
      /I love coding|I have some startup|high quality products|I’m Cengizhan KÖSE/.test(
        read(file),
      ),
    );
    expect(hits).toEqual([]);
  });

  it("MKT-02 criterion 1: the typewriter dependency is gone", () => {
    expect(read("package.json")).not.toContain("typewriter-effect");
  });

  it("MKT-16: no 'part time' and no 'currently working in Turkey' in src/", () => {
    const all = files("src").map((file) => [file, read(file)]);
    expect(
      all.filter(([, text]) => /part.time/i.test(text)).map(([f]) => f),
    ).toEqual([]);
    expect(
      all
        .filter(([, text]) => text.includes("currently working in Turkey"))
        .map(([f]) => f),
    ).toEqual([]);
  });

  it("MKT-19: no weak button labels in the home page or the content", () => {
    const weak =
      /"(About Me|Contact Me|Submit|Learn More|Get Started|Send|Get in touch)"/;
    expect(home.filter((file) => weak.test(read(file)))).toEqual([]);
  });

  it("the cta dictionaries hold no weak label either", () => {
    for (const lang of ["en", "tr"]) {
      for (const key of ["cta.primary", "cta.secondary"]) {
        expect(DICTIONARIES[lang][key]).not.toMatch(
          /^(About Me|Contact Me|Submit|Learn More|Get Started|Send|Get in touch)$/i,
        );
      }
    }
  });
});

describe("voice of the new hero and form copy (brief: Voice, Dil ve hitap)", () => {
  const BANNED =
    /\b(cool|modern|beautiful|high.quality|passionate|innovative|cutting.edge)\b|havalı|güzel|yüksek kaliteli|tutkulu|yenilikçi|son teknoloji/i;
  const SIZ =
    /iletişime geçin|gönderin|inceleyin|izleyin|okuyun|bakın|bırakın|anlatın/i;

  const values = (object) =>
    Object.values(object).flatMap((value) =>
      typeof value === "string"
        ? [value]
        : Array.isArray(value)
          ? value.flatMap((item) =>
              typeof item === "string" ? [item] : values(item),
            )
          : value && typeof value === "object"
            ? values(value)
            : [],
    );

  const copy = {
    en: [
      ...values(CONTENT.en.hero),
      ...values(CONTENT.en.contact),
      ...Object.entries(DICTIONARIES.en)
        .filter(([key]) => /^(cta|contact)\./.test(key))
        .map(([, value]) => value),
    ],
    tr: [
      ...values(CONTENT.tr.hero),
      ...values(CONTENT.tr.contact),
      ...Object.entries(DICTIONARIES.tr)
        .filter(([key]) => /^(cta|contact)\./.test(key))
        .map(([, value]) => value),
    ],
  };

  it.each(["en", "tr"])(
    "%s: no banned adjectives, no exclamation marks",
    (lang) => {
      expect(copy[lang].filter((text) => BANNED.test(text))).toEqual([]);
      expect(copy[lang].filter((text) => text.includes("!"))).toEqual([]);
    },
  );

  it("tr: addresses the visitor as sen, never siz", () => {
    expect(copy.tr.filter((text) => SIZ.test(text))).toEqual([]);
  });

  it("uses the typographic apostrophe in English", () => {
    expect(copy.en.filter((text) => text.includes("'"))).toEqual([]);
  });

  it("the merged TR content is the TR text, not a fallback", () => {
    expect(getContent("tr").hero.lead).toBe(TR.lead);
    expect(getContent("tr").contact.description).toBe(
      CONTENT.tr.contact.description,
    );
  });
});
