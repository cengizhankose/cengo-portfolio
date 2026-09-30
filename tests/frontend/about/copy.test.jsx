// Visible copy and Bootstrap 4 leftovers across the pages this package owns:
// MKT-09 / DSG-23 / FE-36 (typos, footer copyright), FE-28 / DSG-34 (BS4
// classes, undefined classes) and SEO-20 / FE-27 (lang="5"). The grep
// criteria from the plans run over every file under src/.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Headermain from "../../../src/header";

// Vitest runs from the repository root (jsdom has no file: import.meta.url).
const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), "utf8");

function sourceFiles(dir = "src") {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(jsx?|tsx?|css)$/.test(entry.name) ? [path] : [];
    },
  );
}

// `grep -rnE <pattern> src` as "file:line: text" strings.
function grep(pattern, files = sourceFiles()) {
  return files.flatMap((file) =>
    read(file)
      .split("\n")
      .flatMap((text, index) =>
        pattern.test(text) ? [`${file}:${index + 1}: ${text.trim()}`] : [],
      ),
  );
}

describe("typos (MKT-09, DSG-23, FE-36, SEO-13, FE-27)", () => {
  it("finds none of the listed misspellings anywhere under src", () => {
    expect(
      grep(
        /abit about|my self|Timline|Thankyou|messege|Faild|copyright __| ,currently|Developer _|web to mobile project/,
      ),
    ).toEqual([]);
    expect(grep(/thankyou|messege|faild|copyright __/i)).toEqual([]);
  });

  it("capitalises the pronoun I in the page copy", () => {
    expect(
      grep(/(^|[^A-Za-z])i (have|love|work)/, sourceFiles("src/content")),
    ).toEqual([]);
  });

  it("has no lower-case services heading on About", () => {
    expect(grep(/>services</, ["src/pages/about/index.jsx"])).toEqual([]);
  });
});

describe("Bootstrap 4 leftovers and undefined classes (FE-28, DSG-34, SEO-20)", () => {
  it("uses no BS4 class names and no numeric lang attribute", () => {
    expect(grep(/lang="5"|\bml-0\b|\btext-left\b|\bform-group\b/)).toEqual([]);
    expect(grep(/lang="[0-9]/)).toEqual([]);
    expect(grep(/\b(mb-1x|fluidz-48)\b/)).toEqual([]);
  });

  it("keeps About-header only as the defined scope of the DSG-01 table rule", () => {
    // FE-28 removed it where it styled nothing (portfolio); on About it is
    // the selector of the table rule in about/style.css (DSG-01). The server
    // snapshot of the About page (SEO-01, src/seo/snapshot.ts) mirrors the
    // page's markup, so it carries the same class.
    const files = new Set(
      grep(/\bAbout-header\b/).map((hit) => hit.split(":")[0]),
    );
    expect([...files]).toEqual([
      "src/pages/about/index.jsx",
      "src/pages/about/style.css",
      "src/seo/snapshot.ts",
    ]);
  });

  it('uses lg="5" for the eight section title columns, Services and the intro reel (MKT-18, W8) included', () => {
    const about = read("src/pages/about/index.jsx");
    expect(about.match(/<Col lg="5">/g)).toHaveLength(8);
    expect(about).not.toMatch(/<Col lang=/);
  });
});

describe("menu footer copyright (MKT-09, FE-36, DSG-23)", () => {
  it("shows © with the current year and the full name", () => {
    render(
      <MemoryRouter>
        <Headermain />
      </MemoryRouter>,
    );

    const copyright = document.querySelector(".menu_footer .copyright");
    expect(copyright.textContent.trim()).toBe(
      `© ${new Date().getFullYear()} Cengizhan Köse`,
    );
    expect(read("src/header/index.jsx")).toMatch(
      /new Date\(\)\.getFullYear\(\)/,
    );
  });
});
