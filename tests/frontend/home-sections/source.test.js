// @vitest-environment node
//
// Source checks for the acceptance criteria that are greps and file facts
// (MKT-03, MKT-13, SEO-17, ANL-12), and the CV file gate: a content flag says
// "available" exactly when the PDF is in public/cv/.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (file) => readFileSync(join(ROOT, file), "utf8");
const filesUnder = (dir) =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
const grep = (pattern, files) =>
  files.flatMap((file) =>
    read(file)
      .split("\n")
      .flatMap((line, index) =>
        pattern.test(line) ? [`${file}:${index + 1}`] : [],
      ),
  );

const HOME_FILES = [
  ...filesUnder("src/pages/home"),
  ...filesUnder("src/components/latestposts"),
].filter((file) => /\.(jsx?|css)$/.test(file));
const COPY_FILES = [
  ...filesUnder("src/content"),
  ...filesUnder("src/i18n"),
].filter((file) => file.endsWith(".js"));

describe("the home page reads its data through swr only (MKT-03 criterion 4)", () => {
  it("has no react-markdown, mermaid or fetch( in the home page and the latest-posts block", () => {
    expect(
      grep(/react-markdown|mermaid|(^|[^A-Za-z])fetch\(/, HOME_FILES),
    ).toEqual([]);
  });

  it("does not write its own request hook: no useEffect-fetching, no useApi", () => {
    expect(grep(/useApi|XMLHttpRequest|axios/, HOME_FILES)).toEqual([]);
  });
});

describe("services copy (MKT-13 criterion 1)", () => {
  it("has none of the old claims or banned adjectives in content and dictionaries", () => {
    expect(
      grep(
        /Cool and modern|Beautiful and high quality|high quality|I can manage|Flutter/,
        COPY_FILES,
      ),
    ).toEqual([]);
  });

  it("has no banned adjective in this package's EN files (MKT-14 step 1)", () => {
    const mine = [
      "src/content/en/services.js",
      "src/content/en/cv.js",
      "src/content/en/home.js",
      "src/i18n/en/services.js",
      "src/i18n/en/cv.js",
      "src/i18n/en/home.js",
    ];
    expect(
      grep(/\b(cool|modern|beautiful|passionate|innovative)\b/i, mine),
    ).toEqual([]);
  });

  it("uses the single form of address in TR (no 'siz' imperatives, MKT-14 step 1)", () => {
    const mine = [
      "src/content/tr/services.js",
      "src/content/tr/cv.js",
      "src/i18n/tr/services.js",
      "src/i18n/tr/cv.js",
      "src/i18n/tr/home.js",
    ];
    expect(
      grep(
        /(geçin|gönderin|inceleyin|izleyin|okuyun|bakın)([^a-zçğıöşü]|$)/,
        mine,
      ),
    ).toEqual([]);
  });

  it('About\'s services row has no lang="5" typo (SEO-20, FE-27)', () => {
    expect(read("src/pages/about/index.jsx")).not.toContain('lang="5"');
  });
});

describe("CV files (ANL-12)", () => {
  const CV_FILES = {
    en: "public/cv/cengizhan-kose-cv-en.pdf",
    tr: "public/cv/cengizhan-kose-cv-tr.pdf",
  };

  it("lists the same two files, in the same order, in both languages", async () => {
    const en = (await import("../../../src/content/en/cv.js")).default;
    const tr = (await import("../../../src/content/tr/cv.js")).default;
    expect(tr).toEqual(en);
    expect(en.links.map((l) => [l.language, l.href])).toEqual(
      Object.entries(CV_FILES).map(([language, file]) => [
        language,
        file.replace("public", ""),
      ]),
    );
  });

  it("marks a file available exactly when it is in public/cv/", async () => {
    const { links } = (await import("../../../src/content/en/cv.js")).default;
    for (const link of links) {
      const present = existsSync(join(ROOT, "public", link.href));
      expect(link.available, link.href).toBe(present);
    }
  });

  it("serves .pdf as application/pdf", () => {
    expect(read("src/server/mime.ts")).toMatch(/"\.pdf":\s*"application\/pdf"/);
  });

  // The next two read the PDFs themselves. They run once the owner has put
  // the files in public/cv/ (until then there is nothing to read).
  const present = Object.entries(CV_FILES).filter(([, file]) =>
    existsSync(join(ROOT, file)),
  );
  const hasPoppler =
    spawnSync("pdftotext", ["-v"]).error === undefined &&
    spawnSync("pdfinfo", ["-v"]).error === undefined;

  it.skipIf(present.length === 0 || !hasPoppler)(
    "has no phone number, a Title, and a link to the site with utm_source=cv",
    () => {
      for (const [language, file] of present) {
        const path = join(ROOT, file);
        const text = spawnSync("pdftotext", [path, "-"], {
          encoding: "utf8",
        }).stdout;
        expect(
          text.match(
            /\+90|\b0?5[0-9]{2}[ .-]?[0-9]{3}[ .-]?[0-9]{2}[ .-]?[0-9]{2}\b/g,
          ) ?? [],
          `${language}: phone number`,
        ).toEqual([]);
        expect(text, `${language}: site address`).toContain(
          "cengizhankose.com",
        );
        const info = spawnSync("pdfinfo", [path], { encoding: "utf8" }).stdout;
        expect(info, `${language}: Title`).toMatch(/^Title:\s+\S/m);
        const urls = spawnSync("pdfinfo", ["-url", path], {
          encoding: "utf8",
        }).stdout;
        expect(urls, `${language}: UTM link`).toContain("utm_source=cv");
      }
    },
  );
});
