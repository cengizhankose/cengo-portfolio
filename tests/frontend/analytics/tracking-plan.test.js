// @vitest-environment node
//
// ANL-19: claudedocs/analytics/tracking-plan.md and src/lib/analytics/events.js
// describe the same catalogue, and the code only sends catalogued events.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTENT, getContent } from "../../../src/content/index.js";
import {
  CONTENT_LANGUAGES,
  EVENT_NAMES,
  EVENTS,
  GLOBAL_PROPS,
  NETWORKS,
  PAGE_TYPES,
  PROJECT_IDS,
  PROPS,
  UI_LOCALES,
} from "../../../src/lib/analytics/events.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PLAN = readFileSync(
  join(ROOT, "claudedocs/analytics/tracking-plan.md"),
  "utf8",
);

function section(title) {
  const lines = PLAN.split("\n");
  const start = lines.findIndex(
    (line) => line.startsWith("## ") && line.includes(title),
  );
  if (start === -1) throw new Error(`section "${title}" not found`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

function tableRows(text) {
  return text
    .split("\n")
    .filter((line) => /^\|\s*`[^`]+`\s*\|/.test(line))
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split(/\s\|\s/)
        .map((cell) => cell.trim()),
    );
}

const ticked = (cell) =>
  [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]);

const eventRows = tableRows(section("Olaylar"));
const rowByEvent = Object.fromEntries(
  eventRows.map((cells) => [ticked(cells[0])[0], cells]),
);
const PRIORITY = { required: "Şart", nice_to_have: "İyi olur" };

describe("event table matches events.js (ANL-19 step 5a)", () => {
  it("lists exactly the events of EVENTS, at least 16", () => {
    const names = eventRows.map((cells) => ticked(cells[0])[0]);
    expect(names.length).toBeGreaterThanOrEqual(16);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual([...EVENT_NAMES].sort());
  });

  it.each(EVENT_NAMES)(
    "%s: trigger, properties, decision, priority and status are filled",
    (name) => {
      const [, trigger, props, decision, priority, status] = rowByEvent[name];
      for (const cell of [trigger, props, decision, priority, status]) {
        expect(cell?.length ?? 0).toBeGreaterThan(0);
      }
      expect(priority).toBe(PRIORITY[EVENTS[name].priority]);
    },
  );

  it.each(EVENT_NAMES)(
    "%s: documented properties equal the allowlist",
    (name) => {
      const documented = ticked(rowByEvent[name][2]).filter(
        (token) => Object.hasOwn(PROPS, token) && !GLOBAL_PROPS.includes(token),
      );
      expect(new Set(documented)).toEqual(new Set(EVENTS[name].props));
      if (EVENTS[name].props.length === 0) {
        expect(rowByEvent[name][2]).toMatch(/^—/);
      }
    },
  );

  it.each(EVENT_NAMES)("%s: every enum value is documented", (name) => {
    const tokens = new Set(ticked(rowByEvent[name][2]));
    for (const key of EVENTS[name].props) {
      const rule = PROPS[key];
      // project ids live in the enum table of section 8
      if (rule.kind !== "enum" || key === "project_id") continue;
      for (const value of rule.values) {
        expect(tokens.has(String(value)), `${name}.${key}=${value}`).toBe(true);
      }
    }
  });
});

describe("global properties and enums are documented", () => {
  it("section 7 lists the three global properties with their values", () => {
    const rows = tableRows(section("Global özellikler"));
    expect(rows.map((cells) => ticked(cells[0])[0])).toEqual(GLOBAL_PROPS);
    const values = Object.fromEntries(
      rows.map((cells) => [ticked(cells[0])[0], ticked(cells[1])]),
    );
    expect(values.page_type).toEqual(PAGE_TYPES);
    expect(values.ui_locale).toEqual(UI_LOCALES);
    expect(values.content_language).toEqual(CONTENT_LANGUAGES);
  });

  it("section 8 lists NETWORKS in K-11 order and every project id", () => {
    const rows = tableRows(section("Enum"));
    const networks = rows.find((cells) => ticked(cells[0])[0] === "NETWORKS");
    expect(ticked(networks[1])).toEqual(NETWORKS);
    const enumText = section("Enum");
    for (const id of PROJECT_IDS) expect(enumText).toContain(`\`${id}\``);
  });
});

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(js|jsx)$/.test(name) ? [path] : [];
  });
}
const SOURCES = sourceFiles(join(ROOT, "src")).map((path) => ({
  path: relative(ROOT, path),
  text: readFileSync(path, "utf8"),
}));

describe("code only sends catalogued events (ANL-19 step 5b)", () => {
  it("every track('<name>') call in src uses a known event", () => {
    const used = SOURCES.flatMap(({ path, text }) =>
      [...text.matchAll(/\btrack\(\s*["'`]([a-z_]+)["'`]/g)].map((match) => ({
        path,
        name: match[1],
      })),
    );
    expect(used.length).toBeGreaterThan(0);
    const unknown = used.filter(({ name }) => !EVENT_NAMES.includes(name));
    expect(unknown).toEqual([]);
  });

  it("the app entry starts analytics exactly once", () => {
    const callers = SOURCES.filter(
      ({ path, text }) =>
        !path.startsWith("src/lib/analytics/") &&
        /^\s*initAnalytics\(\s*\);?\s*$/m.test(text),
    ).map(({ path }) => path);
    expect(callers).toHaveLength(1);
    const entry = SOURCES.find(({ path }) => path === callers[0]);
    expect(entry.text).toMatch(
      /import \{ initAnalytics \} from "\.\/lib\/analytics(\/index\.js)?";/,
    );
  });

  it("only src/lib/analytics talks to window.umami", () => {
    const offenders = SOURCES.filter(
      ({ path, text }) =>
        !path.startsWith("src/lib/analytics/") && /\bumami\./.test(text),
    ).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});

describe("operations and UTM sections (ANL-01, ANL-03, ANL-16)", () => {
  it("'Umami işletimi' records version, last backup and owner", () => {
    const ops = section("Umami işletimi");
    expect(ops).toMatch(
      /\| Sürüm[^|]*\| `ghcr\.io\/umami-software\/umami:3\.4\.0`/,
    );
    expect(ops).toMatch(/\| Son yedek \|/);
    expect(ops).toMatch(/\| Son güncelleme \|/);
    expect(ops).toMatch(/\| Sorumlu \| Sahip/);
    expect(ops).not.toMatch(/postgres(ql)?:\/\//i);
  });

  it("UTM registry: >= 8 tagged www links covering the six K-11 channels", () => {
    const regex =
      /https:\/\/www\.cengizhankose\.com\/[^ )]*\?utm_source=[a-z_]+&utm_medium=[a-z_]+&utm_campaign=[a-z0-9_]+/;
    const lines = PLAN.split("\n").filter((line) => regex.test(line));
    expect(lines.length).toBeGreaterThanOrEqual(8);

    const sources = new Set(
      [...PLAN.matchAll(/https:\/\/www\.cengizhankose\.com\/[^ `)]*/g)].map(
        (match) => new URL(match[0]).searchParams.get("utm_source"),
      ),
    );
    for (const channel of NETWORKS.slice(0, -1)) {
      expect(sources.has(channel), channel).toBe(true);
    }
    expect(sources.has("facebook")).toBe(false);
  });

  it("every registered link is https://www with lower-case UTM values", () => {
    const urls = [
      ...section("UTM").matchAll(/https:\/\/[^ `)]+\?utm_[^ `)]+/g),
    ].map((match) => new URL(match[0]));
    expect(urls.length).toBeGreaterThanOrEqual(8);
    for (const url of urls) {
      expect(url.host).toBe("www.cengizhankose.com");
      for (const [key, value] of url.searchParams) {
        expect(key).toMatch(/^utm_[a-z]+$/);
        expect(value).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });

  it("'İç trafik' documents the opt-out link", () => {
    expect(section("İç trafik")).toContain(
      "https://www.cengizhankose.com/?analytics=off",
    );
  });
});

describe("content ids match in both languages (ANL-19 step 5d)", () => {
  // The merged content (missing TR items fall back to EN, FE-14) must carry
  // the same ids; a TR list that already exists must agree on its own.
  const ids = (locale, name) => getContent(locale)[name].map((item) => item.id);
  const rawIds = (name) => CONTENT.tr[name].map((item) => item.id);
  const rawAgrees = (name) => {
    const raw = rawIds(name);
    return raw.length === 0 ? true : raw.join() === ids("en", name).join();
  };

  it("services have unique ids, identical in en and tr", () => {
    const en = ids("en", "services");
    expect(en.length).toBeGreaterThan(0);
    expect(new Set(en).size).toBe(en.length);
    for (const id of en) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(ids("tr", "services")).toEqual(en);
    expect(rawAgrees("services")).toBe(true);
  });

  it("portfolio projects have unique ids from PROJECT_IDS, identical in en and tr", () => {
    const en = ids("en", "projects");
    expect(new Set(en).size).toBe(en.length);
    for (const id of en) expect(PROJECT_IDS).toContain(id);
    expect(ids("tr", "projects")).toEqual(en);
    expect(rawAgrees("projects")).toBe(true);
  });
});

describe("documented status follows the code (ANL-18, W7 handoffs)", () => {
  const eventsFile = "src/lib/analytics/events.js";

  it("every event the plan marks Uygulandı has a sender in src", () => {
    const implemented = EVENT_NAMES.filter((name) => {
      const status = rowByEvent[name][5];
      return /Uygulandı/.test(status) && !/Kısmen/.test(status);
    });
    expect(implemented).toContain("locale_switched");
    const missing = implemented.filter(
      (name) =>
        !SOURCES.some(
          ({ path, text }) =>
            path !== eventsFile &&
            (text.includes(`"${name}"`) || text.includes(`'${name}'`)),
        ),
    );
    expect(missing).toEqual([]);
  });

  it("locale_switched is documented with its three properties and targets", () => {
    const [, trigger, props, , , status] = rowByEvent.locale_switched;
    expect(trigger).toContain("src/components/langswitch/index.jsx");
    expect(status).toMatch(/^\*\*Uygulandı\*\*/);
    for (const token of [
      "from_locale",
      "to_locale",
      "target",
      "translation",
      "blog_index",
    ]) {
      expect(ticked(props)).toContain(token);
    }
  });

  it("the language switcher is the only sender of locale_switched", () => {
    const senders = SOURCES.filter(
      ({ path, text }) =>
        path !== eventsFile && /["']locale_switched["']/.test(text),
    ).map(({ path }) => path);
    expect(senders).toEqual(["src/components/langswitch/index.jsx"]);
  });
});

describe("language segmentation and data sources (ANL-18 step 5, ANL-14)", () => {
  it("lists the allowed values of the two language properties and the targets", () => {
    const text = section("Panolar");
    for (const value of [
      "`en`, `tr`",
      "`en`, `tr`, `unknown`",
      "`translation`, `blog_index`",
    ]) {
      expect(text).toContain(value);
    }
  });

  it("the weekly summary has an en and a tr column for each ANL-18 metric", () => {
    const text = section("Panolar");
    const header = text.split("\n").find((line) => /^\| Metrik \|/.test(line));
    expect(header).toMatch(/`en`/);
    expect(header).toMatch(/`tr`/);
    for (const metric of [
      "Oturum",
      "giriş sayfası",
      "Nitelikli temas",
      "Form hata oranı",
      "okuma derinliği",
    ]) {
      expect(text).toContain(metric);
    }
  });

  it("points at the weekly SQL file, which exists and is read-only", () => {
    expect(section("Panolar")).toContain("weekly-by-locale.sql");
    const sql = readFileSync(
      join(ROOT, "claudedocs/analytics/weekly-by-locale.sql"),
      "utf8",
    );
    expect(sql).toMatch(/data_key = 'ui_locale'/);
    expect(sql).toMatch(/url_path LIKE '\/tr\/%'/);
  });

  it("documents the Search Console / Bing data source and its weekly use", () => {
    const text = section("Veri kaynakları");
    expect(text).toContain("Search Console ve Bing");
    expect(text).toContain("https://www.cengizhankose.com/sitemap.xml");
    expect(text).toContain("google-site-verification");
    expect(text).toMatch(/\/tr\//);
    expect(text).toMatch(/Bing Webmaster Tools/);
  });
});
