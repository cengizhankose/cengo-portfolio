// SEC-25 / ANL-04 content rules: EN and TR carry the same privacyProcessors
// (same ids, same order), the same keys and list lengths, name the same
// recipients, list no font provider, keep Cloudflare Web Analytics only until
// T-09 ends, and use the same retention numbers as the form note.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT } from "../../../src/content/index.js";
import { privacyProcessors as enProcessors } from "../../../src/content/en/privacy.js";
import { privacyProcessors as trProcessors } from "../../../src/content/tr/privacy.js";
import { DICTIONARIES } from "../../../src/i18n/translate.js";
import { contentGaps, dictionaryGaps } from "../i18n/parity.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const read = (file) => readFileSync(resolve(ROOT, file), "utf8");

const strip = (source) => source.replace(/\/\/.*$/gm, "");

describe("privacyProcessors", () => {
  it("has the same ids in the same order in EN and TR", () => {
    expect(enProcessors.map(({ id }) => id)).toEqual(
      trProcessors.map(({ id }) => id),
    );
    expect(enProcessors.map(({ id }) => id)).toEqual([
      "emailjs",
      "umami",
      "cloudflare_web_analytics",
      "cloudflare",
      "out_plane",
    ]);
  });

  it("every entry has a name, purpose, data and location in both languages", () => {
    for (const list of [enProcessors, trProcessors]) {
      for (const entry of list) {
        for (const field of ["name", "purpose", "data", "location"]) {
          expect(entry[field]?.trim(), `${entry.id}.${field}`).toBeTruthy();
        }
      }
    }
  });

  it("the page section carries the same list as the named export", () => {
    expect(CONTENT.en.privacy.privacyProcessors).toBe(enProcessors);
    expect(CONTENT.tr.privacy.privacyProcessors).toBe(trProcessors);
  });
});

describe("privacy content files", () => {
  it("name EmailJS, Cloudflare, Out Plane and Umami (>= 4 matching lines each)", () => {
    for (const lang of ["en", "tr"]) {
      const lines = read(`src/content/${lang}/privacy.js`)
        .split("\n")
        .filter((line) => /EmailJS|Cloudflare|Out Plane|Umami/.test(line));
      expect(lines.length, lang).toBeGreaterThanOrEqual(4);
    }
  });

  it("list no font provider: fonts are self-hosted (W8)", () => {
    for (const file of [
      "src/content/en/privacy.js",
      "src/content/tr/privacy.js",
      "src/i18n/en/privacy.js",
      "src/i18n/tr/privacy.js",
    ]) {
      expect(read(file), file).not.toMatch(/Google Fonts|googleapis|gstatic/i);
    }
  });

  it("keep Cloudflare Web Analytics in both files until T-09 ends (delete the entry in both)", () => {
    for (const file of [
      "src/content/en/privacy.js",
      "src/content/tr/privacy.js",
    ]) {
      expect(strip(read(file))).toContain('id: "cloudflare_web_analytics"');
    }
  });

  it("have the same paths, list lengths and kinds (strict parity)", () => {
    expect(
      contentGaps(CONTENT.en.privacy, CONTENT.tr.privacy, { strict: true }),
    ).toEqual([]);
  });

  it("state no phone number and no other personal address", () => {
    for (const lang of ["en", "tr"]) {
      const source = strip(read(`src/content/${lang}/privacy.js`));
      expect(source).not.toMatch(/\+?\d[\d\s().-]{8,}\d/);
      expect(source).not.toMatch(/gmail\.com/i);
    }
  });
});

describe("privacy dictionary namespace and nav.privacy", () => {
  const pick = (dict) =>
    Object.fromEntries(
      Object.entries(dict).filter(
        ([key]) => key.startsWith("privacy.") || key === "nav.privacy",
      ),
    );

  it("has the same keys in EN and TR, none empty", () => {
    expect(
      dictionaryGaps(pick(DICTIONARIES.en), pick(DICTIONARIES.tr), {
        strict: true,
      }),
    ).toEqual([]);
  });

  it("has the keys the page, the form note and the acceptance criteria use", () => {
    for (const key of [
      "nav.privacy",
      "privacy.title",
      "privacy.updated",
      "privacy.formNote",
      "privacy.formLink",
      "privacy.umami.noCookies",
      "privacy.umami.noIpStorage",
      "privacy.umami.dnt",
    ]) {
      expect(DICTIONARIES.en[key], key).toBeTruthy();
      expect(DICTIONARIES.tr[key], key).toBeTruthy();
    }
  });

  it("the form notes name EmailJS and the same retention as the page (12 months / 12 ay)", () => {
    expect(DICTIONARIES.en["privacy.formNote"]).toMatch(/EmailJS.*12 months/);
    expect(DICTIONARIES.tr["privacy.formNote"]).toMatch(/EmailJS.*12 ay/);
    expect(CONTENT.en.privacy.retention[0].text).toMatch(/12 months/);
    expect(CONTENT.tr.privacy.retention[0].text).toMatch(/12 ay/);
  });
});
