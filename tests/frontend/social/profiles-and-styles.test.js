// @vitest-environment node
//
// Static guards of the social package:
// - SOCIAL_PROFILES is the one list: ids = analytics NETWORKS without
//   "other" (ANL-19 criterion 4 / step 5c), every id has an icon, the rail
//   list is derived from it (DSG-30), the X URL is x.com (MKT-23 c5);
// - the social.* texts exist in EN and TR (T-12);
// - no dropped network is left in src (MKT-23 c1, DSG-30 c3);
// - the target sizes of DSG-12 are in the CSS (jsdom has no layout; the
//   rendered sizes were measured in headless Chrome, see the report).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SOCIAL_CHANNELS,
  SOCIAL_ICONS,
} from "../../../src/components/socialicons/icons.js";
import { DICTIONARIES, translate } from "../../../src/i18n/translate.js";
import { NETWORKS } from "../../../src/lib/analytics/events.js";
import * as pages from "../../../src/seo/pages.js";
import { SOCIAL_PROFILES } from "../../../src/seo/site.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (file) => readFileSync(join(ROOT, file), "utf8");

function sourceFiles(dir = join(ROOT, "src")) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : [relative(ROOT, path)];
  });
}

describe("one list: SOCIAL_PROFILES (K-11)", () => {
  it("ids are the analytics NETWORKS without other, in order (ANL-19 c4)", () => {
    expect(SOCIAL_PROFILES.map((p) => p.id)).toEqual(
      NETWORKS.filter((n) => n !== "other"),
    );
  });

  it("the rendered channels are SOCIAL_PROFILES, each with an icon", () => {
    expect(
      SOCIAL_CHANNELS.map(({ id, label, url }) => ({ id, label, url })),
    ).toEqual(
      SOCIAL_PROFILES.map(({ id, label, url }) => ({ id, label, url })),
    );
    for (const { id, Icon } of SOCIAL_CHANNELS) {
      expect(Icon, id).toBeTypeOf("function");
      expect(SOCIAL_ICONS[id]).toBe(Icon);
    }
  });

  it("pages.js re-exports the same list; X is x.com (MKT-23 criterion 5)", () => {
    const s = pages.SOCIAL_PROFILES;
    expect(
      s.map((p) => p.id).join() ===
        "linkedin,github,x,youtube,twitch,instagram" &&
        s.find((p) => p.id === "x").url.startsWith("https://x.com/"),
    ).toBe(true);
  });

  it("every profile URL is https and none is Facebook", () => {
    for (const { url } of SOCIAL_PROFILES) {
      expect(new URL(url).protocol).toBe("https:");
      expect(url).not.toMatch(/facebook/i);
    }
  });
});

describe("social.* texts (T-12)", () => {
  it.each(["en", "tr"])("%s has profile ({name}) and newTab", (locale) => {
    const dict = DICTIONARIES[locale];
    expect(dict["social.profile"]).toMatch(/^\{name\} \S/);
    expect(dict["social.newTab"]).toMatch(/^\(.+\)$/);
    expect(dict["social.profile"].endsWith(dict["social.newTab"])).toBe(true);
  });

  it("formats the profile names", () => {
    expect(translate("en", "social.profile", { name: "GitHub" })).toBe(
      "GitHub profile (opens in a new tab)",
    );
    expect(translate("tr", "social.profile", { name: "GitHub" })).toBe(
      "GitHub profili (yeni sekmede açılır)",
    );
    expect(translate("en", "social.newTab")).toBe("(opens in a new tab)");
    expect(translate("tr", "social.newTab")).toBe("(yeni sekmede açılır)");
  });
});

describe("no dropped network in src", () => {
  it("no file under src mentions Facebook (MKT-23 criterion 1)", () => {
    const hits = sourceFiles().filter((file) => /facebook/i.test(read(file)));
    expect(hits).toEqual([]);
  });

  it("socialprofils / twitter.com only in the analytics host map (DSG-30 criterion 3)", () => {
    // events.js maps twitter.com to the x network for outbound clicks and
    // referrers (ANL-03/ANL-09); it is a host alias, not a link.
    const hits = sourceFiles().filter((file) =>
      /facebook|socialprofils|twitter\.com/i.test(read(file)),
    );
    expect(hits).toEqual(["src/lib/analytics/events.js"]);
  });
});

// Rules of `selector` at the top level (media = null) or inside the
// @media block whose condition contains `media`.
function rules(css, selector, media = null) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  let depth = 0;
  let start = 0;
  let header = "";
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "{") {
      if (depth === 0) {
        header = text.slice(start, i).trim();
        start = i + 1;
      }
      depth += 1;
    } else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        blocks.push({ header, body: text.slice(start, i) });
        start = i + 1;
      }
    }
  }
  const pick = (list) =>
    list
      .filter(({ header: h }) =>
        h
          .split(",")
          .map((part) => part.trim())
          .includes(selector),
      )
      .map(({ body }) =>
        Object.fromEntries(
          body
            .split(";")
            .map((decl) => decl.trim())
            .filter(Boolean)
            .map((decl) => {
              const colon = decl.indexOf(":");
              return [
                decl.slice(0, colon).trim(),
                decl.slice(colon + 1).trim(),
              ];
            }),
        ),
      );
  if (media === null)
    return pick(blocks.filter((b) => !b.header.startsWith("@")));
  const inner = blocks
    .filter((b) => b.header.startsWith("@media") && b.header.includes(media))
    .flatMap((b) =>
      [...b.body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
        header: m[1].trim(),
        body: m[2],
      })),
    );
  return pick(inner);
}
const rule = (...args) => Object.assign({}, ...rules(...args));

describe("rail and menu footer CSS (DSG-12)", () => {
  const rail = read("src/components/socialicons/socialicons.module.css");
  const header = read("src/header/header.module.css");
  const MOBILE = "max-width: 1279.98px";

  // FE-01: the sizes are spacing tokens: --space-4 24px, --space-5 32px,
  // --space-2 8px (src/styles/tokens.css).
  it("rail: 32px wide at left 24px, icons 32x32, 8px apart", () => {
    const tokens = read("src/styles/tokens.css");
    expect(tokens).toMatch(/--space-2: 0\.5rem;/);
    expect(tokens).toMatch(/--space-4: 1\.5rem;/);
    expect(tokens).toMatch(/--space-5: 2rem;/);
    expect(rule(rail, ".rail")).toMatchObject({
      position: "fixed",
      left: "var(--space-4)",
      width: "var(--space-5)",
    });
    expect(rule(rail, ".rail a")).toMatchObject({
      display: "inline-flex",
      "align-items": "center",
      "justify-content": "center",
      width: "var(--space-5)",
      height: "var(--space-5)",
    });
    expect(rule(rail, ".rail ul")).toMatchObject({
      display: "flex",
      "flex-direction": "column",
      gap: "var(--space-2)",
    });
  });

  it("rail caption: vertical text in the flow, no rotated fixed-size box", () => {
    expect(rule(rail, ".rail p")).toMatchObject({
      "writing-mode": "vertical-rl",
    });
    expect(rail).not.toMatch(/rotate\(-90deg\)/);
    expect(rule(rail, ".rail")).not.toHaveProperty("height");
  });

  it("rail below 1280px: in the flow, icons in one wrapping row, targets stay 32px", () => {
    expect(rule(rail, ".rail", MOBILE)).toMatchObject({
      position: "static",
    });
    expect(rule(rail, ".rail ul", MOBILE)).toMatchObject({
      "flex-direction": "row",
      "flex-wrap": "wrap",
    });
    expect(rule(rail, ".rail a", MOBILE)).toEqual({});
    // 6 x 32 + 5 x 8 = 232px <= 375 - 2 x 10px frame.
    expect(6 * 32 + 5 * 8).toBeLessThanOrEqual(355);
  });

  it("rail focus ring", () => {
    expect(rule(rail, ".rail a:focus-visible")).toMatchObject({
      outline: "2px solid var(--text-color)",
      "outline-offset": "2px",
    });
  });

  // FE-01: --tap-min is 24px; the gaps are --space-1 / --space-3 (4px/16px).
  it("menu footer: every link at least 24x24, 4px/16px gaps", () => {
    expect(read("src/styles/tokens.css")).toMatch(/--tap-min: 24px;/);
    expect(rule(header, ".footerSocial")).toMatchObject({
      display: "flex",
      "flex-wrap": "wrap",
      gap: "var(--space-1) var(--space-3)",
      "list-style": "none",
    });
    expect(rule(header, ".footerSocial a")).toMatchObject({
      display: "inline-flex",
      "min-width": "var(--tap-min)",
      "min-height": "var(--tap-min)",
    });
    expect(rule(header, ".menuFooter a")).not.toHaveProperty("margin-right");
  });
});
