// @vitest-environment node
//
// FE-01 acceptance: the site no longer carries the template it started from.
//   - The measurement of 07-frontend-plan (FE-01): the share of the
//     template's meaningful CSS lines (ubaimutl/react-portfolio, five
//     stylesheets, 509 lines) that still live, in order, in src/**/*.css is
//     at most 20% (it was 97%, 495/509). The template lines are stored as
//     hashes (./fixtures/template-css-lines.json), so the test runs offline;
//     the count is difflib's SequenceMatcher(autojunk=False) matching-block
//     total, the same number the plan's Python script prints.
//   - The template's class names and placeholder copy are gone (the two
//     grep criteria of FE-01).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (file) => readFileSync(join(ROOT, file), "utf8");
const FIXTURE = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "fixtures", "template-css-lines.json"),
    "utf8",
  ),
);

/** Files under `dir`, repository-relative, in Python's sorted(Path.rglob) order. */
function filesUnder(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      return entry.isDirectory() ? filesUnder(path) : [path];
    },
  );
}

const byParts = (a, b) => {
  const pa = a.split("/");
  const pb = b.split("/");
  for (let i = 0; i < Math.min(pa.length, pb.length); i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return pa.length - pb.length;
};

// The plan's normalisation: whitespace runs collapsed, blank lines and bare
// braces dropped.
const normalise = (text) =>
  text
    .split(/\r?\n/)
    .filter((line) => line.trim() && !["{", "}", "{}"].includes(line.trim()))
    .map((line) => line.trim().split(/\s+/).join(" "));

const hash = (line) =>
  createHash("sha256").update(line).digest("hex").slice(0, 16);

/** difflib.SequenceMatcher(None, a, b, autojunk=False): matching-block total. */
function matchingTotal(a, b) {
  const b2j = new Map();
  b.forEach((item, j) => {
    if (!b2j.has(item)) b2j.set(item, []);
    b2j.get(item).push(j);
  });
  const longest = (alo, ahi, blo, bhi) => {
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map();
    for (let i = alo; i < ahi; i += 1) {
      const next = new Map();
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      j2len = next;
    }
    return [besti, bestj, bestsize];
  };
  let total = 0;
  const queue = [[0, a.length, 0, b.length]];
  while (queue.length > 0) {
    const [alo, ahi, blo, bhi] = queue.pop();
    const [i, j, k] = longest(alo, ahi, blo, bhi);
    if (k === 0) continue;
    total += k;
    if (alo < i && blo < j) queue.push([alo, i, blo, j]);
    if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
  }
  return total;
}

const SITE_CSS = filesUnder("src")
  .filter((file) => file.endsWith(".css"))
  .sort(byParts);
const SITE_LINES = SITE_CSS.flatMap((file) => normalise(read(file))).map(hash);

describe("template CSS still in the site (FE-01 criterion 2)", () => {
  it("measures the five template stylesheets (509 lines)", () => {
    const sizes = Object.values(FIXTURE.files).map((lines) => lines.length);
    expect(sizes.reduce((sum, n) => sum + n, 0)).toBe(509);
    expect(SITE_CSS.length).toBeGreaterThan(10);
  });

  it("keeps at most 20% of the template's lines (was 97%, 495/509)", () => {
    let same = 0;
    let total = 0;
    for (const lines of Object.values(FIXTURE.files)) {
      same += matchingTotal(lines, SITE_LINES);
      total += lines.length;
    }
    expect(same / total).toBeLessThanOrEqual(0.2);
  });

  it("the matcher agrees with difflib on a known case", () => {
    // difflib.SequenceMatcher(None, "abxcd", "abcd", autojunk=False) -> 4
    expect(matchingTotal([..."abxcd"], [..."abcd"])).toBe(4);
    expect(matchingTotal([..."qwerty"], [..."asdf"])).toBe(0);
  });
});

describe("template names and placeholder copy (FE-01 criteria 3-4)", () => {
  const SOURCES = filesUnder("src").filter((file) =>
    /\.(jsx?|tsx?|css|scss)$/.test(file),
  );

  it("has none of the template's class names", () => {
    const pattern =
      /stick_follow_icon|site__navigation|menu__opend|bg__menu|ac_btn/;
    expect(SOURCES.filter((file) => pattern.test(read(file)))).toEqual([]);
  });

  it("has no ring-layer button kit: no .ring class in any stylesheet the site renders from FE-01's files, and no ring class in markup", () => {
    const markup = SOURCES.filter((file) => /\.jsx?$/.test(file)).filter(
      (file) => /\.ring(One|Two|Three)?\b|hasRings/.test(read(file)),
    );
    expect(markup).toEqual([]);
    for (const file of [
      "src/header/header.module.css",
      "src/pages/home/home.module.css",
      "src/components/socialicons/socialicons.module.css",
      "src/components/langswitch/langswitch.module.css",
    ]) {
      expect(read(file), file).not.toMatch(/\.ring\b|hasRings/);
    }
  });

  it("has no template placeholder copy", () => {
    expect(
      SOURCES.filter((file) => /abit about|picsum|Follow Me/.test(read(file))),
    ).toEqual([]);
  });
});
