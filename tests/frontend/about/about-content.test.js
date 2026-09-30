// @vitest-environment node
//
// Content of the About page and the ProofStrip (W6-MKT-about-positioning):
// MKT-05 (brief, timeline, skills), MKT-15 (story, outcomes), MKT-04 (proof,
// awards archive), SEO-18 (current facts, no typos). The plans' grep and bun
// criteria run here over the real content files, in both languages. Facts come
// from 00-icerik-girdileri.md; nothing here needs the network.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT } from "../../../src/content/index.js";
import { DICTIONARIES } from "../../../src/i18n/translate.js";
import { contentGaps, dictionaryGaps } from "../i18n/parity.js";

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), "utf8");
const LANGS = ["en", "tr"];
const MINE = ["about", "timeline", "skills", "proof", "awards"];

// `grep -rn` as "file:line: text" over a directory.
function grepDir(dir, pattern) {
  const hits = [];
  const walk = (current) => {
    for (const entry of readdirSync(join(ROOT, current), {
      withFileTypes: true,
    })) {
      const path = `${current}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(jsx?|tsx?|css)$/.test(entry.name)) {
        read(path)
          .split("\n")
          .forEach((text, index) => {
            if (pattern.test(text)) hits.push(`${path}:${index + 1}`);
          });
      }
    }
  };
  walk(dir);
  return hits;
}

const words = (text) => text.trim().split(/\s+/).length;
const pick = (content) =>
  Object.fromEntries(MINE.map((name) => [name, content[name]]));
const myFiles = (lang) => MINE.map((name) => `src/content/${lang}/${name}.js`);

describe("positioning brief (MKT-05 step 1, MKT-14 contract)", () => {
  const brief = read(".agents/product-marketing.md");
  const section = (title) => {
    const match = brief.match(
      new RegExp(`^## ${title}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"),
    );
    return match ? match[1].trim() : "";
  };

  it.each([
    "Audience",
    "Offer",
    "Differentiation",
    "Proof",
    "Voice",
    "Language",
    "Dil ve hitap",
    "Terim sözlüğü",
    "Çeviri akışı",
  ])("has a filled '%s' section", (title) => {
    expect(section(title).length, title).toBeGreaterThan(80);
  });

  it("carries no Drivee metric, internal system name or phone number", () => {
    expect(brief).not.toMatch(/1,000|1\.000|FleetTalking/);
    expect(brief).not.toMatch(/\+?\d[\d\s()-]{9,}\d/);
  });

  it("states the decided positioning, action and title", () => {
    expect(brief).toMatch(/Senior Fullstack Engineer/);
    expect(brief).toMatch(/Tell me what you're building/);
    expect(brief).toMatch(/Ne geliştirdiğini anlat/);
  });
});

describe.each(LANGS)(
  "work timeline, %s (MKT-05 step 2, MKT-15, SEO-18)",
  (lang) => {
    const timeline = CONTENT[lang].timeline;

    it("has the eight rows, the current role first", () => {
      expect(timeline).toHaveLength(8);
      expect(timeline[0].where).toMatch(/Drivee/);
      expect(timeline.map((row) => row.id)).toEqual(
        CONTENT.en.timeline.map((row) => row.id),
      );
    });

    it("drops the rows the recommended defaults remove", () => {
      const text = timeline
        .map((row) => `${row.jobtitle} ${row.where}`)
        .join("\n");
      expect(text).not.toMatch(/Gamer Pair|Bootcamp|Product Manager/);
    });

    it("gives every row an outcome", () => {
      for (const row of timeline) {
        expect(row.outcome.trim(), row.id).not.toBe("");
      }
    });

    it("shows years only, and finished roles are no longer 'current'", () => {
      for (const row of timeline) {
        expect(row.date, row.id).toMatch(/^\d{4} – (\d{4}|present|günümüz)$/);
      }
      const byId = Object.fromEntries(timeline.map((row) => [row.id, row]));
      expect(byId["monster-notebook"].date).toBe("2021 – 2024");
      expect(byId.profo.date).toBe("2022 – 2023");
      expect(byId.fitmondo.date).toBe("2020 – 2021");
    });

    it("keeps machine-readable years that agree with the label", () => {
      for (const row of timeline) {
        const [from, to] = row.date.split(" – ");
        expect(row.start, row.id).toBe(Number(from));
        if (/^\d{4}$/.test(to)) expect(row.end, row.id).toBe(Number(to));
        else expect(Object.hasOwn(row, "end"), row.id).toBe(false);
      }
    });

    it("leaves `end` out only for the roles the inputs file lists as ongoing", () => {
      // 00-icerik-girdileri.md §3.1: the only role with "bugün" is Drivee,
      // Fullstack Engineer (Jan 2026).
      expect(
        timeline
          .filter((row) => !Object.hasOwn(row, "end"))
          .map((row) => row.id),
      ).toEqual(["drivee-fullstack"]);
    });

    it("no content file under src says '<year>-current' any more", () => {
      expect(grepDir("src", /[0-9]{4}-current/i)).toEqual([]);
    });
  },
);

describe.each(LANGS)("skills, %s (MKT-05 step 3)", (lang) => {
  const skills = CONTENT[lang].skills;

  it("has the CV's five groups and no percentage anywhere", () => {
    expect(skills).toHaveLength(5);
    expect(skills.map((group) => group.id)).toEqual([
      "frontend",
      "mobile",
      "backend_data",
      "realtime_ai",
      "delivery_quality",
    ]);
    expect(JSON.stringify(skills)).not.toMatch(/"value"/);
    for (const group of skills) {
      expect(group.items.length, group.id).toBeGreaterThan(3);
      for (const item of group.items) expect(typeof item).toBe("string");
    }
  });
});

describe("skills and stale claims (MKT-05 acceptance greps)", () => {
  it("names the core technologies in EN", () => {
    const text = read("src/content/en/skills.js");
    expect(
      text.match(/TypeScript|PostgreSQL|React Native/g).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("has no Flutter or Figma in this package's sections", () => {
    // services.js still says "React Native and Flutter": W11-FE-home-sections
    // (MKT-13) owns it; handed off in the W6-MKT-about-positioning report.
    for (const lang of LANGS) {
      for (const file of myFiles(lang)) {
        expect(read(file), file).not.toMatch(/Flutter|Figma/);
      }
    }
  });

  it("never says the 2022 positioning again", () => {
    expect(
      grepDir(
        "src",
        /won two hackathons|Part time Entrepreneur|CTO of another one/i,
      ),
    ).toEqual([]);
  });

  it("uses no Drivee metric or internal system name", () => {
    expect(
      grepDir("src/content", /1,000 daily|1\.000 günlük|FleetTalking/),
    ).toEqual([]);
  });

  it("has none of the typos and grammar slips SEO-18 lists", () => {
    // The plan's literal pattern 'abit' also matches "Habitat" (the UN-Habitat
    // hackathon); the typo it hunts is the word "abit", so it is bounded here.
    const pattern = /\babit\b|my self|\bi have\b|\bi won\b|Timline/i;
    const hits = [
      ...grepDir("src/content", pattern),
      ...grepDir("src/pages/about", pattern),
    ];
    expect(hits).toEqual([]);
  });
});

describe.each(LANGS)("story, %s (MKT-15 steps 1-2)", (lang) => {
  const { title, story } = CONTENT[lang].about;

  it("is two or three paragraphs of at most 60 words", () => {
    expect(story.length).toBeGreaterThanOrEqual(2);
    expect(story.length).toBeLessThanOrEqual(3);
    for (const paragraph of story)
      expect(words(paragraph)).toBeLessThanOrEqual(60);
  });

  it("leads with the 6+ years and ten podiums the archive backs up", () => {
    expect(title).toMatch(/6\+/);
    expect(title).toMatch(/\b10\b/);
    expect(CONTENT[lang].awards).toHaveLength(10);
  });

  it("names SafeCall only as a fact: no usage number", () => {
    expect(story.join(" ")).toMatch(/SafeCall/);
    expect(story.join(" ")).not.toMatch(
      /\d[\d.,]*\s*(daily|günlük|users|kullanıcı)/i,
    );
  });
});

describe.each(LANGS)("additional ventures and talks, %s", (lang) => {
  const { ventures, talks } = CONTENT[lang].about;

  it("lists HyperCut, Courline and 777senselabs without dates", () => {
    expect(ventures.map((venture) => venture.name)).toEqual([
      "HyperCut",
      "Courline",
      "777senselabs",
    ]);
    expect(JSON.stringify(ventures)).not.toMatch(/\b(19|20)\d{2}\b/);
  });

  it("links every talk to its post", () => {
    expect(talks).toHaveLength(6);
    for (const talk of talks) {
      expect(talk.url, talk.id).toMatch(
        /^https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:(activity|share):\d+\/$/,
      );
      expect(talk.year, talk.id).toBeGreaterThanOrEqual(2023);
    }
    const years = talks.map((talk) => talk.year);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });
});

describe.each(LANGS)("proof and awards archive, %s (MKT-04)", (lang) => {
  const { proof, awards } = CONTENT[lang];

  it("shows the four first places with event, year, place and a link", () => {
    expect(proof.awards.map((award) => award.id)).toEqual([
      "convoai-2026",
      "algohack-2025",
      "teknasyon-2022",
      "social-cohesion-2021",
    ]);
    for (const award of proof.awards) {
      expect(
        award.event && award.year && award.place && award.url,
        award.id,
      ).toBeTruthy();
      expect(award.url).toMatch(/^https:\/\//);
    }
  });

  it("keeps the archive at ten records, newest first, with stable ids", () => {
    expect(awards).toHaveLength(10);
    expect(awards.map((award) => award.id)).toEqual(
      CONTENT.en.awards.map((award) => award.id),
    );
    const years = awards.map((award) => award.year);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });

  it("counts four first places, four second places and two third places", () => {
    const rank = (award) => award.place;
    const count = (pattern) =>
      awards.filter((award) => pattern.test(rank(award))).length;
    const first = lang === "en" ? /^1st/ : /Birincilik|birinciliği/;
    const second = lang === "en" ? /^2nd/ : /^İkincilik/;
    const third = lang === "en" ? /^3rd/ : /^Üçüncülük/;
    expect([count(first), count(second), count(third)]).toEqual([4, 4, 2]);
  });

  it("hides only IstanHack, and links nothing that has no public record", () => {
    expect(
      awards.filter((award) => award.hidden).map((award) => award.id),
    ).toEqual(["istanhack-2024"]);
    const visible = awards.filter((award) => !award.hidden);
    expect(visible).toHaveLength(9);
    // MultiversX: the inputs file has only a feed id with an unverified URN
    // type (§5 #4), so it stays text until the owner supplies a URL.
    expect(
      visible.filter((award) => !award.url).map((award) => award.id),
    ).toEqual(["multiversx-2025"]);
    for (const award of awards) {
      expect(award.event && award.year && award.place, award.id).toBeTruthy();
    }
  });

  it("word Farmin as the organizer does, not as 'among 25 teams'", () => {
    const farmin = awards.find((award) => award.project === "Farmin");
    expect(farmin.place).toMatch(/Open Innovation Track/);
    expect(JSON.stringify(CONTENT[lang])).not.toMatch(/25 teams|25 takım/);
  });

  it("names the employers as text and invents no reference", () => {
    expect(proof.companies.map((company) => company.name)).toEqual([
      "Monster Notebook",
      "Drivee Teknoloji",
      "MakasApp",
      "Fitmondo",
    ]);
    for (const item of proof.testimonials) {
      expect(item.quote && item.name && item.role && item.company).toBeTruthy();
    }
  });
});

describe("EN / TR parity of this package's files (strict, for the W11 flip)", () => {
  const only = (dictionary) =>
    Object.fromEntries(
      Object.entries(dictionary).filter(([key]) =>
        /^(about|proof)\./.test(key),
      ),
    );

  it("content sections have equal paths, list lengths and no empty text", () => {
    expect(
      contentGaps(pick(CONTENT.en), pick(CONTENT.tr), { strict: true }),
    ).toEqual([]);
  });

  it("dictionary namespaces about and proof have equal keys and no empty text", () => {
    expect(
      dictionaryGaps(only(DICTIONARIES.en), only(DICTIONARIES.tr), {
        strict: true,
      }),
    ).toEqual([]);
  });

  it("the Turkish prose is written, not copied from the English", () => {
    const same = [];
    const pairs = [
      ["about.title", CONTENT.en.about.title, CONTENT.tr.about.title],
      ...CONTENT.en.about.story.map((text, i) => [
        `about.story[${i}]`,
        text,
        CONTENT.tr.about.story[i],
      ]),
      ...CONTENT.en.about.ventures.flatMap((venture, i) =>
        venture.description
          ? [
              [
                `about.ventures[${i}].description`,
                venture.description,
                CONTENT.tr.about.ventures[i].description,
              ],
            ]
          : [],
      ),
      ...CONTENT.en.timeline.map((row, i) => [
        `timeline[${i}].outcome`,
        row.outcome,
        CONTENT.tr.timeline[i].outcome,
      ]),
      ...Object.keys(only(DICTIONARIES.en)).map((key) => [
        key,
        DICTIONARIES.en[key],
        DICTIONARIES.tr[key],
      ]),
    ];
    for (const [path, en, tr] of pairs) if (en === tr) same.push(path);
    expect(same).toEqual([]);
  });
});

describe("voice rules of the brief hold in this package's copy (MKT-14 step 1)", () => {
  const copy = (lang) =>
    [
      ...myFiles(lang),
      `src/i18n/${lang}/about.js`,
      `src/i18n/${lang}/proof.js`,
    ].map((file) => [file, read(file)]);

  it("has none of the banned adjectives", () => {
    const en =
      /\b(cool|modern|beautiful|high[- ]quality|passionate|innovative)\b/i;
    const tr = /\b(havalı|modern|güzel|yüksek kaliteli|tutkulu|yenilikçi)\b/i;
    for (const [file, text] of copy("en")) expect(text, file).not.toMatch(en);
    for (const [file, text] of copy("tr")) expect(text, file).not.toMatch(tr);
  });

  it("addresses the Turkish visitor as 'sen', never with 'siz' forms", () => {
    const siz =
      /(geçin|gönderin|inceleyin|izleyin|okuyun|bakın)([^a-zçğıöşü]|$)/;
    for (const [file, text] of copy("tr")) expect(text, file).not.toMatch(siz);
  });

  it("has no exclamation marks in page copy", () => {
    const strings = (value) =>
      typeof value === "string"
        ? [value]
        : value && typeof value === "object"
          ? Object.values(value).flatMap(strings)
          : [];
    for (const lang of LANGS) {
      const text = [
        ...strings(pick(CONTENT[lang])),
        ...Object.entries(DICTIONARIES[lang])
          .filter(([key]) => /^(about|proof)\./.test(key))
          .map(([, value]) => value),
      ];
      expect(text.filter((value) => value.includes("!"))).toEqual([]);
    }
  });
});
