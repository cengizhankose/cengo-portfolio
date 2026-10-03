// @vitest-environment node
//
// The hackathon podiums of the portfolio (W13-DSG-portfolio-redesign): the
// language-independent record (src/content/awards.js), the text added to the
// archive in both languages (summary, alt text, evidence links) and the committed
// square photo sets. Everything runs on the real files; the page itself is
// rendered in portfolio-page.test.jsx.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AWARD_RECORDS, awardRecord } from "../../../src/content/awards.js";
import { CONTENT } from "../../../src/content/index.js";
import {
  AWARD_IMAGE,
  awardSrc,
  awardWidths,
} from "../../../src/pages/portfolio/awardImage.js";
import { ROOT, bytes, imageInfo } from "../hero/support.js";

const LANGS = ["en", "tr"];
const filled = (value) => typeof value === "string" && value.trim() !== "";
const withImage = AWARD_RECORDS.filter((record) => record.image);

describe("award record (src/content/awards.js)", () => {
  it("has the archive's ids in the archive's order, in both languages", () => {
    for (const lang of LANGS) {
      expect(
        AWARD_RECORDS.map((record) => record.id),
        lang,
      ).toEqual(CONTENT[lang].awards.map((award) => award.id));
    }
    expect(Object.isFrozen(AWARD_RECORDS)).toBe(true);
    expect(awardRecord("teknasyon-2022").rank).toBe(1);
    expect(awardRecord("nope")).toBeUndefined();
  });

  it("ranks match the places: four first, four second, two third", () => {
    const count = (rank) =>
      AWARD_RECORDS.filter((record) => record.rank === rank).length;
    expect([count(1), count(2), count(3)]).toEqual([4, 4, 2]);
    for (const award of CONTENT.en.awards) {
      const { rank } = awardRecord(award.id);
      expect(award.place, award.id).toMatch(
        { 1: /^1st/, 2: /^2nd/, 3: /^3rd/ }[rank],
      );
    }
  });

  it("copies no organizer's or newspaper's picture: those podiums are numerals", () => {
    // 00-icerik-girdileri.md section 9: Rise In's and Hürriyet's images stay
    // theirs and are linked. IstanHack has no public record at all.
    expect(
      AWARD_RECORDS.filter((record) => !record.image).map(
        (record) => record.id,
      ),
    ).toEqual([
      "algohack-2025",
      "multiversx-2025",
      "istanhack-2024",
      "social-cohesion-2021",
    ]);
  });

  it("leaves the language of the evidence to each link", () => {
    for (const record of AWARD_RECORDS) {
      expect(Object.hasOwn(record, "hreflang"), record.id).toBe(false);
    }
  });
});

describe("evidence links (src/content/{en,tr}/awards.js links)", () => {
  const byId = (lang) =>
    Object.fromEntries(CONTENT[lang].awards.map((award) => [award.id, award]));

  it("names the language of a one-language evidence page, per link", () => {
    for (const lang of LANGS) {
      for (const award of CONTENT[lang].awards) {
        for (const link of award.links ?? []) {
          // Left out for a bilingual page, never null (the parity walker of
          // tests/frontend/i18n takes no null).
          expect(
            Object.hasOwn(link, "hreflang") ? link.hreflang : "none",
            `${lang} ${award.id} ${link.url}`,
          ).toMatch(/^(en|tr|none)$/);
        }
      }
    }
    // The ConvoAI post is written in both languages.
    expect(byId("en")["convoai-2026"].links[0].hreflang).toBeUndefined();
    for (const link of byId("en")["social-cohesion-2021"].links) {
      expect(link.hreflang, link.url).toBe("tr");
    }
  });

  it("has the same urls and languages in the same order in both languages", () => {
    const facts = (lang) =>
      CONTENT[lang].awards.map((award) => [
        award.id,
        (award.links ?? []).map(({ url, hreflang }) => [url, hreflang]),
      ]);
    expect(facts("tr")).toEqual(facts("en"));
  });

  it("links every verified piece of evidence: 22 links over nine podiums", () => {
    for (const lang of LANGS) {
      expect(
        Object.fromEntries(
          CONTENT[lang].awards
            .filter((award) => !award.hidden)
            .map((award) => [award.id, award.links.length]),
        ),
        lang,
      ).toEqual({
        "convoai-2026": 2,
        "hackstellar-2025": 3,
        "algohack-2025": 2,
        "multiversx-2025": 2,
        "solana-mini-2024": 2,
        "solana-demo-day-2023": 1,
        "solana-mini-2023": 2,
        "teknasyon-2022": 3,
        "social-cohesion-2021": 5,
      });
    }
  });

  it("links the original posts, never a screenshot site, under the right event", () => {
    const urls = (id) => byId("en")[id].links.map((link) => link.url);
    const all = CONTENT.en.awards.flatMap((award) =>
      (award.links ?? []).map((link) => link.url),
    );
    expect(all.filter((url) => /sotwe\.com/i.test(url))).toEqual([]);
    // Rise In's X thread of the HackStellar winners names "2nd Place: Reset";
    // it belongs to HackStellar, not to AlgoHack.
    const thread = "https://x.com/riseinweb3/status/1995473145453572163";
    expect(urls("hackstellar-2025")).toContain(thread);
    expect(urls("algohack-2025")).not.toContain(thread);
  });

  it("keeps each record's former single evidence link first", () => {
    // The url every podium linked before the list (W13); the About archive
    // and the ProofStrip still link the record to it.
    const first = {
      "convoai-2026":
        "https://www.linkedin.com/feed/update/urn:li:activity:7420909334194434049/",
      "hackstellar-2025":
        "https://www.linkedin.com/feed/update/urn:li:activity:7406226922319376385/",
      "algohack-2025":
        "https://www.risein.com/blog/algohack-istanbul-the-weekend-builders-took-over-the-city",
      "multiversx-2025":
        "https://www.linkedin.com/feed/update/urn:li:activity:7310203306436395008/",
      "solana-mini-2024":
        "https://www.linkedin.com/feed/update/urn:li:activity:7172850511556153344/",
      "solana-demo-day-2023":
        "https://www.linkedin.com/feed/update/urn:li:activity:7122167244377239553/",
      "solana-mini-2023":
        "https://www.linkedin.com/feed/update/urn:li:activity:7106681953436786688/",
      "teknasyon-2022":
        "https://www.linkedin.com/feed/update/urn:li:activity:6977326538954321920/",
      "social-cohesion-2021":
        "https://www.hurriyet.com.tr/egitim/universite-ogrencilerine-bm-odulu-41910191",
    };
    for (const lang of LANGS) {
      const shown = CONTENT[lang].awards.filter((award) => !award.hidden);
      expect(
        Object.fromEntries(
          shown.map((award) => [award.id, award.links[0].url]),
        ),
        lang,
      ).toEqual(first);
    }
  });
});

describe.each(LANGS)("podium text, %s", (lang) => {
  const awards = CONTENT[lang].awards;
  const visible = awards.filter((award) => !award.hidden);

  it("every shown podium has a summary and evidence links with short labels", () => {
    for (const award of visible) {
      expect(filled(award.summary), `${award.id} summary`).toBe(true);
      expect(award.summary.length, award.id).toBeLessThanOrEqual(200);
      expect(award.links.length, award.id).toBeGreaterThan(0);
      for (const link of award.links) {
        expect(filled(link.label), `${award.id} label`).toBe(true);
        expect(link.label.length, link.label).toBeLessThanOrEqual(36);
        expect(link.url, award.id).toMatch(/^https:\/\//);
      }
      const urls = award.links.map((link) => link.url);
      expect(new Set(urls).size, award.id).toBe(urls.length);
    }
    // The hidden record stays a bare line.
    const hidden = awards.find((award) => award.hidden);
    expect(hidden.summary).toBeUndefined();
    expect(hidden.links).toBeUndefined();
  });

  it("alt text exactly where there is a photo", () => {
    for (const award of awards) {
      const { image } = awardRecord(award.id);
      expect(filled(award.imageAlt), `${award.id} imageAlt`).toBe(
        Boolean(image),
      );
    }
  });

  it("names teammates only as credited in the posts", () => {
    const byId = Object.fromEntries(awards.map((award) => [award.id, award]));
    expect(byId["hackstellar-2025"].summary).toContain("Efe Akkurt");
    expect(byId["algohack-2025"].summary).toContain("Efe Akkurt");
    expect(byId["solana-demo-day-2023"].summary).toContain("Kaan Mert Koç");
    expect(byId["solana-mini-2023"].summary).toContain("Kaan Mert Koç");
  });

  it("keeps the organizer's wording for Farmin", () => {
    const text = JSON.stringify(awards);
    expect(text).not.toMatch(/25 (teams|takım)/i);
    expect(text).not.toContain("!");
  });
});

it("the English label says (TR) exactly when the evidence page is Turkish only", () => {
  for (const award of CONTENT.en.awards.filter((a) => !a.hidden)) {
    for (const link of award.links) {
      expect(link.label.endsWith("(TR)"), link.url).toBe(
        link.hreflang === "tr",
      );
    }
  }
  for (const award of CONTENT.tr.awards.filter((a) => !a.hidden)) {
    for (const link of award.links) {
      expect(link.label, link.url).not.toMatch(/\((TR|EN)\)/);
    }
  }
});

describe("podium photos (public/img/awards)", () => {
  const dir = join(ROOT, "public/img/awards");
  const files = existsSync(dir) ? readdirSync(dir) : [];

  it("each record with a photo has its square set, each file within budget", () => {
    for (const { image } of withImage) {
      for (const width of awardWidths(image)) {
        for (const ext of ["avif", "webp"]) {
          const file = `public${awardSrc(image.name, width, ext)}`;
          expect(existsSync(join(ROOT, file)), file).toBe(true);
          expect(statSync(join(ROOT, file)).size, file).toBeLessThanOrEqual(
            AWARD_IMAGE.maxBytes,
          );
          const info = imageInfo(bytes(file));
          expect([info.width, info.height], file).toEqual([width, width]);
        }
      }
    }
  });

  it("holds only files of records that say they have a photo", () => {
    const names = withImage.map((record) => record.image.name);
    expect(files.length).toBe(
      withImage.reduce(
        (sum, record) => sum + awardWidths(record.image).length * 2,
        0,
      ),
    );
    for (const file of files) {
      expect(
        names.find((name) =>
          file.startsWith(`${name}-${AWARD_IMAGE.version}-`),
        ),
        file,
      ).toBeDefined();
    }
  });

  it("keeps each square master at the largest output size, without metadata", () => {
    for (const { image } of withImage) {
      const master = `scripts/images/sources/awards/${image.name}.jpg`;
      expect(existsSync(join(ROOT, master)), master).toBe(true);
      const info = imageInfo(bytes(master));
      const largest = awardWidths(image).at(-1);
      expect([info.width, info.height], master).toEqual([largest, largest]);
      expect(info.exif, master).toBeFalsy();
    }
  });
});
