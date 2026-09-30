/**
 * Repository-level acceptance checks for the single head mechanism
 * (SEO-25, FE-25, MKT-21, DSG-33): the grep criteria of the plans as tests,
 * plus a guard that every page component calls usePageMeta.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pages } from "../../../src/seo/pages.js";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SRC = join(ROOT, "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = walk(SRC).filter((f) => /\.(jsx?|tsx?)$/.test(f));
const read = (path: string) => readFileSync(path, "utf8");

function filesMatching(pattern: RegExp, files = sourceFiles) {
  return files
    .filter((file) => pattern.test(read(file)))
    .map((file) => relative(ROOT, file));
}

describe("one head mechanism (SEO-25, FE-25, DSG-33)", () => {
  test("no react-helmet-async, HelmetProvider or <Helmet in src or package.json", () => {
    const pattern = /react-helmet-async|HelmetProvider|<Helmet/;
    expect(filesMatching(pattern)).toEqual([]);
    expect(read(join(ROOT, "package.json"))).not.toMatch(pattern);
  });

  test("react-helmet-async is not a dependency", () => {
    const pkg = JSON.parse(read(join(ROOT, "package.json")));
    expect(pkg.dependencies?.["react-helmet-async"]).toBeUndefined();
    expect(pkg.devDependencies?.["react-helmet-async"]).toBeUndefined();
  });

  test("no PageMeta component (FE-25)", () => {
    expect(filesMatching(/\bPageMeta\b/)).toEqual([]);
  });

  test("no charSet in src/pages; charset only in index.html", () => {
    const pageFiles = sourceFiles.filter((f) =>
      f.startsWith(join(SRC, "pages")),
    );
    expect(filesMatching(/charSet/, pageFiles)).toEqual([]);
  });

  test("SITE_URL is assigned in one place only (T-03)", () => {
    expect(filesMatching(/SITE_URL *=/)).toEqual(["src/seo/site.js"]);
  });

  test("React's native <title>/<meta> hoisting is not used in components", () => {
    const jsx = sourceFiles.filter((f) => f.endsWith(".jsx"));
    expect(filesMatching(/<title[\s>]|<meta\s/, jsx)).toEqual([]);
  });
});

describe("name spelling (T-07, MKT-21, DSG-33)", () => {
  test("no KÖSE in src or index.html", () => {
    expect(filesMatching(/KÖSE/)).toEqual([]);
    expect(read(join(ROOT, "index.html"))).not.toContain("KÖSE");
  });
});

describe("index.html head (MKT-21 step 5, DSG-33 step 4)", () => {
  const html = read(join(ROOT, "index.html"));

  test("exactly one charset and one title", () => {
    expect(html.match(/<meta charset/gi) ?? []).toHaveLength(1);
    expect(html.match(/<title[\s>]/gi) ?? []).toHaveLength(1);
  });

  test("the static title equals the EN home title", () => {
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
    expect(title).toBe(pages["/"].en.title);
    expect(title).toBe("Cengizhan Köse | Senior Fullstack Engineer");
  });

  test("the document language is the default locale", () => {
    expect(html).toMatch(/<html lang="en">/);
  });
});

describe("every page component writes its meta (FE-25 risk guard)", () => {
  const PAGE_COMPONENTS = [
    "src/pages/home/index.jsx",
    "src/pages/about/index.jsx",
    "src/pages/portfolio/index.jsx",
    "src/pages/contact/index.jsx",
    "src/pages/blog/BlogHome.jsx",
    "src/pages/blog/BlogPost.jsx",
  ];

  test.each(PAGE_COMPONENTS)(
    "%s calls usePageMeta(getPageMeta(...))",
    (file) => {
      const source = read(join(ROOT, file));
      expect(source).toMatch(/usePageMeta\(\s*getPageMeta\(/);
      expect(source).toMatch(/matchRoute\(/);
    },
  );

  test("the blog post passes its data (post / notFound) to getPageMeta", () => {
    const source = read(join(ROOT, "src/pages/blog/BlogPost.jsx"));
    expect(source).toMatch(/\{ notFound: true \}/);
    expect(source).toMatch(/\{ post \}/);
  });
});
