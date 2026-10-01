/**
 * FE-30: Create React App leftovers and dead code stay out of the repo.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SRC = join(ROOT, "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(jsx?|tsx?|css)$/.test(name) ? [path] : [];
  });
}

describe("CRA leftovers (FE-30)", () => {
  test.each([
    "src/index.js",
    "src/reportWebVitals.js",
    "public/index.html",
    "src/assets/images/logo.svg",
    "test.html",
  ])("%s is gone", (file) => {
    expect(existsSync(join(ROOT, file))).toBe(false);
  });

  test("no dead CRA entry, no-op web-vitals call and no Facebook icon in src", () => {
    const hits = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          /reportWebVitals|FaFacebookF|ReactDOM\.render\b/.test(line)
            ? [`${relative(ROOT, file)}:${i + 1}`]
            : [],
        ),
    );
    expect(hits).toEqual([]);
  });

  test("entry-client.jsx is the only entry; it hydrates a server render and otherwise mounts with createRoot (PERF-03)", () => {
    const entry = readFileSync(join(SRC, "entry-client.jsx"), "utf8");
    expect(entry).toContain("hydrateRoot(");
    expect(entry).toContain("createRoot(");
    expect(entry).not.toMatch(/ReactDOM\.render\b/);
    expect(readFileSync(join(ROOT, "index.html"), "utf8")).toContain(
      'src="/src/entry-client.jsx"',
    );
  });

  test("portfolio page has no commented-out dataportfolio grid", () => {
    const page = readFileSync(
      join(SRC, "pages", "portfolio", "index.jsx"),
      "utf8",
    );
    expect(page).not.toContain("dataportfolio");
  });
});
