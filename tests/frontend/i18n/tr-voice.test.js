// @vitest-environment node
//
// MKT-14 / MKT-08: the voice of the two languages, checked on the values that
// reach the page (dictionaries, page content, page meta) so a later edit
// cannot bring back the form of address, the banned adjectives or a template
// string. The brief (.agents/product-marketing.md) is the source of the rules:
//   - Turkish addresses the visitor as "sen", never "siz";
//   - no exclamation marks, none of the banned adjectives in either language;
//   - Turkish values that equal their English value are names (allowlist);
//   - the brief's "Dil ve hitap", "Terim sözlüğü" and "Çeviri akışı" sections
//     are filled and the first blog translation follows them.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT } from "../../../src/content/index.js";
import { DICTIONARIES } from "../../../src/i18n/translate.js";
import { contentNodes } from "./parity.js";

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), "utf8");

// Sections another package of the wave writes (see i18n-parity.test.js).
const PENDING = ["services"].filter(
  (name) => Object.keys(CONTENT.tr[name] ?? {}).length === 0,
);

const pageModules = import.meta.glob("../../../src/seo/pages/*.js", {
  eager: true,
});
const PAGE_META = Object.entries(pageModules)
  .map(([file, module]) => ({
    page: file.split("/").pop().replace(/\.js$/, ""),
    meta: module.default,
  }))
  .filter(({ meta }) => meta && typeof meta === "object" && meta.en && meta.tr);

// [label, text] pairs of one language: dictionary values, every text of the
// page content (urls and ids are not copy) and the page meta.
function texts(lang) {
  const out = Object.entries(DICTIONARIES[lang]).map(([key, value]) => [
    `dictionary ${key}`,
    value,
  ]);
  for (const [path, node] of contentNodes(CONTENT[lang])) {
    const section = path.split(/[.[]/)[0];
    if (node.kind !== "string" || PENDING.includes(section)) continue;
    if (/\.(id|url)$/.test(path)) continue;
    out.push([`content ${path}`, node.value]);
  }
  for (const { page, meta } of PAGE_META) {
    for (const field of ["title", "description"]) {
      if (typeof meta[lang][field] === "string") {
        out.push([`seo ${page}.${field}`, meta[lang][field]]);
      }
    }
  }
  return out;
}

const hits = (list, pattern) =>
  list.filter(([, text]) => pattern.test(text)).map(([label]) => label);

describe("Turkish speaks to the visitor as 'sen' (brief: Dil ve hitap)", () => {
  // Imperatives and possessives of the formal "siz": iletişime geçin,
  // gönderin, inceleyin, ... haklarınız, Aradığınız; and the pronoun itself.
  const SIZ_VERBS =
    /(?:^|[^\p{L}])(?:geçin|gönderin|inceleyin|izleyin|okuyun|bakın|bırakın|anlatın|edin|yapın|verin|söyleyin|dönün|açın|girin|seçin|bekleyin|deneyin|yazın|kapatın|ulaşın|gidin|bulun|paylaşın|başlayın|atlayın)(?=[^\p{L}]|$)/iu;
  const SIZ_STRICT = new RegExp(
    `${SIZ_VERBS.source}|(?:^|[^\\p{L}])\\p{L}*(?:ınız|iniz|unuz|ünüz)(?=[^\\p{L}]|$)|(?:^|[^\\p{L}])(?:siz|sizin|size|sizi|sizinle|sizden)(?=[^\\p{L}]|$)`,
    "iu",
  );

  it("the pattern catches what it should (and spares the 'sen' forms)", () => {
    for (const bad of [
      "iletişime geçin",
      "Formdan gönderin",
      "Aradığınız sayfa",
      "haklarınız",
      "Ana sayfaya dönün",
      "Size yazın",
    ]) {
      expect(SIZ_STRICT.test(bad), bad).toBe(true);
    }
    for (const good of [
      "Ne geliştirdiğini anlat",
      "Bu alanı boş bırak",
      "haklarının özeti",
      "Ana sayfaya dön",
      "Seçili işleri gör",
      "İnce ayar",
    ]) {
      expect(SIZ_STRICT.test(good), good).toBe(false);
    }
  });

  it("no siz form in a TR dictionary value, content text or page meta", () => {
    expect(hits(texts("tr"), SIZ_STRICT)).toEqual([]);
  });

  it("the Turkish page descriptions are sentences about or to 'sen', never 'siz' (SEO-09 in the sen form)", () => {
    for (const { page, meta } of PAGE_META) {
      if (typeof meta.tr.description !== "string") continue;
      expect(meta.tr.description, page).not.toMatch(SIZ_STRICT);
    }
  });
});

describe("plain copy in both languages (brief: Voice)", () => {
  const BANNED =
    /\b(?:cool|modern|beautiful|high.quality|passionate|innovative|cutting.edge)\b|havalı|güzel|yüksek kaliteli|tutkulu|yenilikçi|son teknoloji/i;

  it.each(["en", "tr"])("%s: no banned adjective", (lang) => {
    expect(hits(texts(lang), BANNED)).toEqual([]);
  });

  it.each(["en", "tr"])("%s: no exclamation mark", (lang) => {
    expect(hits(texts(lang), /!/)).toEqual([]);
  });

  it("the role stays 'Senior Fullstack Engineer' in both languages", () => {
    for (const lang of ["en", "tr"]) {
      expect(CONTENT[lang].hero.role).toBe("Senior Fullstack Engineer");
      expect(CONTENT[lang].hero.headline).toBe(
        "Cengizhan Köse — Senior Fullstack Engineer",
      );
    }
  });
});

describe("no template string comes back (MKT-08)", () => {
  // The visible strings of the portfolio template the site started from
  // (react-portfolio, MIT) that the audit found word for word, plus the
  // strings the page copy replaced. Generic words (Home, Blog, About) are not
  // fingerprints and are not listed.
  const TEMPLATE_STRINGS = [
    "Follow Me",
    "Get in touch",
    "abit about",
    "my self",
    "Work Timline",
    "Timline",
    "copyright __",
    "Contact Me",
    "Faild",
    "messege",
    "Thankyou",
    "SUCCESS!",
    "Now you can",
    "Part time Entrepreneur",
    "won two hackathons",
    "Under Construction",
  ];

  it.each(["en", "tr"])("%s: none of the template strings", (lang) => {
    const patterns = TEMPLATE_STRINGS.map(
      (fragment) =>
        new RegExp(
          `(?<!\\p{L})${fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\p{L})`,
          "iu",
        ),
    );
    const found = texts(lang).filter(([, text]) =>
      patterns.some((pattern) => pattern.test(text)),
    );
    expect(found.map(([label]) => label)).toEqual([]);
  });

  it("the replaced captions are the new ones, in both languages", () => {
    expect(DICTIONARIES.en["social.follow"]).toBe("Find me elsewhere");
    expect(DICTIONARIES.tr["social.follow"]).toBe("Beni başka yerlerde bul");
    expect(DICTIONARIES.en["contact.reachMe"]).toBe("Reach me directly");
    expect(DICTIONARIES.tr["contact.reachMe"]).toBe("Doğrudan ulaş");
    expect(DICTIONARIES.en["contact.title"]).toBe("Let’s work together");
    expect(DICTIONARIES.tr["contact.title"]).toBe("Birlikte çalışalım");
    expect(DICTIONARIES.en["about.intro"]).toBe("My story");
    expect(DICTIONARIES.tr["about.intro"]).toBe("Hikâyem");
  });

  it("the MIT licence notice stays (the notice must be kept)", () => {
    const licence = read("LICENSE");
    expect(
      licence.split("\n").filter((l) => l.includes("Ubai Mutl")),
    ).toHaveLength(1);
  });
});

describe("nothing in TR is an untranslated English value (MKT-14)", () => {
  // Names, technologies, role titles used in English on the market, dates and
  // event names written as the organiser spells them (brief: Terim sözlüğü).
  const DICTIONARY_ALLOWED = new Set([
    "nav.blog",
    "footer.copyright",
    "home.photoAlt",
    "blog.title",
    "notFound.blog",
    "lang.switchTo",
    "portfolio.problem",
  ]);
  const CONTENT_ALLOWED_PATH =
    /\.(?:id|url|name|project|where|date|roleLang|status|event)$|^hero\.(?:name|role|headline)$|\.jobtitle$|^about\.ventures\[\d+\]\.role$|^skills\[\d+\]\.items\[\d+\]$/;
  const TECH_NAMES = new Set([
    "TypeScript",
    "JavaScript",
    "React",
    "Next.js",
    "CSS/Sass",
    "Redux Toolkit",
    "Zustand",
    "React Query",
    "React Native",
    "Expo",
    "Expo Router",
    "EAS",
    "Node.js",
    "Express.js",
    "NestJS",
    ".NET",
    "PostgreSQL",
    "MongoDB",
    "Redis",
    "Firebase",
    "Supabase",
    "WebSockets",
    "SignalR",
    "Kafka",
    "MCP",
    "LangChain",
    "Pinecone",
    "Docker",
    "GoCD",
    "GitHub Actions",
    "Vercel",
    "OpenTelemetry",
    "Grafana",
  ]);
  const JOB_TITLES = new Set([
    "Fullstack Engineer",
    "Senior React Native Developer",
    "Frontend Developer",
    "React Native Developer",
    "CTO",
  ]);

  it("equal values are only on the allowlist", () => {
    const equal = [];
    const en = DICTIONARIES.en;
    for (const [key, value] of Object.entries(DICTIONARIES.tr)) {
      if (value === en[key] && !DICTIONARY_ALLOWED.has(key)) equal.push(key);
    }
    const enNodes = contentNodes(CONTENT.en);
    for (const [path, node] of contentNodes(CONTENT.tr)) {
      const base = enNodes.get(path);
      if (node.kind !== "string" || base?.value !== node.value) continue;
      const section = path.split(/[.[]/)[0];
      if (PENDING.includes(section)) continue;
      if (!CONTENT_ALLOWED_PATH.test(path)) {
        equal.push(`content ${path}`);
      } else if (/\.jobtitle$|ventures\[\d+\]\.role$/.test(path)) {
        if (!JOB_TITLES.has(node.value)) equal.push(`content ${path}`);
      } else if (/^skills\[\d+\]\.items/.test(path)) {
        if (!TECH_NAMES.has(node.value)) equal.push(`content ${path}`);
      } else if (/\.name$/.test(path) && /^skills/.test(path)) {
        if (node.value !== "Frontend") equal.push(`content ${path}`);
      }
    }
    expect(equal).toEqual([]);
  });

  it("the allowlisted dictionary keys really are identical names or labels", () => {
    for (const key of DICTIONARY_ALLOWED) {
      expect(DICTIONARIES.tr[key], key).toBe(DICTIONARIES.en[key]);
    }
  });
});

describe("the brief carries the Turkish contract (MKT-14 steps 1, 2, 6)", () => {
  const brief = read(".agents/product-marketing.md");
  const section = (title) => {
    const start = brief.indexOf(`\n## ${title}\n`);
    expect(start, `## ${title}`).toBeGreaterThan(-1);
    const rest = brief.slice(start + 1);
    const end = rest.indexOf("\n## ", 4);
    return (end === -1 ? rest : rest.slice(0, end)).split("\n").slice(1);
  };

  it.each(["Dil ve hitap", "Terim sözlüğü", "Çeviri akışı"])(
    "'## %s' is filled",
    (title) => {
      const body = section(title).filter((line) => line.trim() !== "");
      expect(body.length).toBeGreaterThanOrEqual(5);
    },
  );

  it("says 'sen', lists the role and the standard translation note", () => {
    expect(brief).toMatch(/addresses the visitor as "sen"/);
    expect(brief).toContain("Senior Fullstack Engineer");
    expect(brief).toContain(
      "Translated from Turkish with AI assistance and reviewed by",
    );
    expect(brief).toContain("İngilizceden yapay zekâ desteğiyle çevrildi");
  });
});

describe("the first blog translation (MKT-14 step 6)", () => {
  const dir = join(ROOT, "content/posts");
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const frontmatter = (name) => {
    const text = readFileSync(join(dir, name), "utf8").replace(/\r\n?/g, "\n");
    const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
    const fields = {};
    for (const line of (match?.[1] ?? "").split("\n")) {
      const field = /^([A-Za-z]+):\s*"?(.*?)"?\s*$/.exec(line);
      if (field) fields[field[1]] = field[2];
    }
    return { fields, body: text.slice(match?.[0].length ?? 0).trim() };
  };
  const posts = files
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({ name, ...frontmatter(name) }));
  const tr = posts.find((post) => post.fields.lang === "tr");
  const en = posts.find((post) => post.fields.lang === "en");

  it("an EN and a TR file share one translationKey", () => {
    expect(tr?.fields.translationKey).toBeTruthy();
    expect(en?.fields.translationKey).toBe(tr?.fields.translationKey);
  });

  it("the EN file is named after its own slug and never carries publish state", () => {
    expect(en.name).toBe(`${en.fields.slug}.en.md`);
    expect(en.fields.slug).not.toBe(tr.fields.slug);
    expect(en.fields).not.toHaveProperty("published");
  });

  it("the body keeps the structure: headings, diagrams and numbers", () => {
    const headings = (post) => post.body.match(/^#{2,3} /gm)?.length ?? 0;
    const fences = (post) => post.body.match(/^```/gm)?.length ?? 0;
    expect(headings(en)).toBe(headings(tr));
    expect(fences(en)).toBe(fences(tr));
    expect(en.body.match(/```mermaid/g)).toHaveLength(
      tr.body.match(/```mermaid/g).length,
    );
    for (const figure of ["40", "150", "135", "400+", "1,000+", "27B"]) {
      expect(en.body, figure).toContain(figure);
    }
    expect(en.body).toContain("`STEWARD_SHADOW=1`");
  });

  it("ends with the standard note and the byline in English", () => {
    expect(en.body).toMatch(
      /\*Translated from Turkish with AI assistance and reviewed by Cengizhan\.\*\s*$/,
    );
    expect(en.body).toContain("System design and editing: Cengizhan Köse");
    expect(en.body).not.toMatch(/\s(?:ve|için|ama|çünkü|gibi)\s/);
  });
});
