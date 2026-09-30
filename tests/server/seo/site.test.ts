/**
 * src/seo/site.js contract (T-03, K-03, K-11, T-12) and the shared content
 * data (src/content, FE-14) that sits next to it.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as shared from "../../../src/content/shared.js";
import en from "../../../src/content/en.js";
import {
  AUTHOR,
  DEFAULT_LOCALE,
  DEFAULT_OG_IMAGE,
  DEFAULT_OG_IMAGE_SIZE,
  LOCALES,
  SITE_NAME,
  SITE_URL,
  SOCIAL_PROFILES,
} from "../../../src/seo/site.js";
import * as viaPages from "../../../src/seo/pages.js";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SEO = join(ROOT, "src", "seo");

// K-11 order; ids = analytics NETWORKS without "other" (ANL-19).
const K11 = ["linkedin", "github", "x", "youtube", "twitch", "instagram"];

function jpegSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 2;
  while (p < bytes.length) {
    const marker = bytes[p + 1];
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return { height: view.getUint16(p + 5), width: view.getUint16(p + 7) };
    }
    p += 2 + view.getUint16(p + 2);
  }
  throw new Error("no SOF marker");
}

describe("site constants", () => {
  test("canonical host, name and locales", () => {
    expect(SITE_URL).toBe("https://www.cengizhankose.com");
    expect(SITE_NAME).toBe("Cengizhan Köse");
    expect(LOCALES).toEqual(["en", "tr"]);
    expect(DEFAULT_LOCALE).toBe("en");
    expect(AUTHOR).toMatchObject({
      name: "Cengizhan Köse",
      jobTitle: "Senior Fullstack Engineer",
      url: SITE_URL,
    });
  });

  test("pages.js re-exports the same values (single definition)", () => {
    expect(viaPages.SITE_URL).toBe(SITE_URL);
    expect(viaPages.LOCALES).toBe(LOCALES);
    expect(viaPages.SOCIAL_PROFILES).toBe(SOCIAL_PROFILES);
  });

  test("the default share image exists with the declared size", () => {
    expect(DEFAULT_OG_IMAGE).toBe("/og/default.jpg");
    const bytes = new Uint8Array(
      readFileSync(join(ROOT, "public", DEFAULT_OG_IMAGE)),
    );
    const { width, height } = jpegSize(bytes);
    expect({ width, height }).toEqual({
      width: DEFAULT_OG_IMAGE_SIZE.width,
      height: DEFAULT_OG_IMAGE_SIZE.height,
    });
    expect(DEFAULT_OG_IMAGE_SIZE.type).toBe("image/jpeg");
  });
});

describe("SOCIAL_PROFILES (K-11)", () => {
  test("six channels in K-11 order, no Facebook", () => {
    expect(SOCIAL_PROFILES.map((p) => p.id)).toEqual(K11);
    expect(SOCIAL_PROFILES.map((p) => p.label)).toEqual([
      "LinkedIn",
      "GitHub",
      "X",
      "YouTube",
      "Twitch",
      "Instagram",
    ]);
    expect(JSON.stringify(SOCIAL_PROFILES)).not.toMatch(/facebook/i);
  });

  test("URLs from 00-icerik-girdileri §8", () => {
    expect(
      Object.fromEntries(SOCIAL_PROFILES.map((p) => [p.id, p.url])),
    ).toEqual({
      linkedin: "https://www.linkedin.com/in/cengizhankose",
      github: "https://github.com/cengizhankose",
      x: "https://x.com/cengzhnkse",
      youtube: "https://www.youtube.com/@cengizhankse",
      twitch: "https://www.twitch.tv/cengizhankose",
      instagram: "https://www.instagram.com/cengizhankse/",
    });
  });

  test("the list is frozen", () => {
    expect(Object.isFrozen(SOCIAL_PROFILES)).toBe(true);
    expect(SOCIAL_PROFILES.every((p) => Object.isFrozen(p))).toBe(true);
  });
});

describe("shared content (FE-14; MKT-21 step 6, DSG-33 step 1)", () => {
  test("no page meta in the content modules and the name is spelled Köse", () => {
    expect(shared).not.toHaveProperty("meta");
    expect(en).not.toHaveProperty("meta");
    expect((en as any).hero.name).toBe("Cengizhan Köse");
    expect(shared.logotext).toBe("CENGO");
  });

  test("no second social profile list next to SOCIAL_PROFILES", () => {
    expect(shared).not.toHaveProperty("socialprofils");
    expect(en).not.toHaveProperty("social");
  });
});

describe("pure ESM head modules (T-03)", () => {
  const files = [
    "site.js",
    "routes.js",
    "pages.js",
    ...readdirSync(join(SEO, "pages")).map((f) => `pages/${f}`),
  ];

  test.each(files)(
    "%s imports no React and touches no browser globals",
    (file) => {
      const source = readFileSync(join(SEO, file), "utf8").replace(
        /^\s*\/\/.*$/gm,
        "",
      );
      expect(source).not.toMatch(/from\s+["']react/);
      expect(source).not.toMatch(
        /\b(window|document|navigator|localStorage)\b/,
      );
      expect(source).not.toMatch(/import\.meta\.env/);
    },
  );
});
