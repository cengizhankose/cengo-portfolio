/**
 * How the pieces are wired (SEO-01 steps 8-11, PERF-01): the client entry
 * takes the server's data, the blog page shares the grouping rule with the
 * snapshot, the modules the server and the client share stay pure, and the
 * runtime packages the snapshot needs are dependencies the image installs.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..", "..");
const read = (file: string) => readFileSync(join(REPO, file), "utf8");
const code = (file: string) => read(file).replace(/^\s*\/\/.*$/gm, "");

describe("src/main.jsx", () => {
  const main = code("src/main.jsx");

  test("gives swr the server's data as its fallback", () => {
    expect(main).toContain('from "./seo/readSeoData.js"');
    expect(main).toContain('from "./lib/swrFallback.js"');
    expect(main).toMatch(/fallback:\s*toSWRFallback\(readSeoData\(\)\)/);
  });

  test("still mounts with createRoot and calls initAnalytics once, after the render", () => {
    expect(main).toContain("createRoot(");
    expect(main).not.toContain("hydrateRoot");
    expect(main.match(/initAnalytics\(\)/g)).toHaveLength(1);
    expect(main.indexOf("root.render(")).toBeLessThan(
      main.indexOf("initAnalytics()"),
    );
  });

  test("reloads once for a lazy import that is gone after a deploy (FE-05 step 4)", () => {
    expect(main).toContain('addEventListener("vite:preloadError"');
    expect(main).toMatch(/reloadForNewRelease\(\)/);
    // The default is prevented only when the page did reload; otherwise the
    // error must reach the route's error boundary.
    expect(main).toMatch(
      /if \(reloadForNewRelease\(\)\) event\.preventDefault\(\)/,
    );
  });

  test("keeps the server's snapshot on screen while a lazy page chunk loads", () => {
    expect(main).toContain("container.hasChildNodes()");
    expect(main).toContain("chunkLoaderForRoute(matchRoute(");
  });
});

describe("the blog index and the snapshot share the grouping rule", () => {
  test("BlogHome imports it and no longer defines it", () => {
    const page = code("src/pages/blog/BlogHome.jsx");
    expect(page).toContain('from "../../lib/postGroups.js"');
    expect(page).toContain("groupPostsForLocale(posts, locale)");
    expect(page).not.toMatch(/function groupPosts\b/);
    // The old export stays for its callers.
    expect(page).toMatch(/export const groupPosts = groupPostsForLocale/);
  });

  test("the snapshot imports the same module", () => {
    expect(code("src/seo/snapshot.ts")).toContain(
      'from "../lib/postGroups.js"',
    );
  });
});

describe("modules shared by the server and the browser stay pure", () => {
  test.each([
    "src/lib/postGroups.js",
    "src/lib/swrFallback.js",
    "src/seo/pages/home.js",
  ])("%s imports no React and touches no browser global", (file) => {
    const source = code(file);
    expect(source).not.toMatch(/from\s+["']react/);
    expect(source).not.toMatch(/\b(window|document|navigator|localStorage)\b/);
    expect(source).not.toMatch(/import\.meta\.env/);
  });

  test("the server layer imports no component and no stylesheet", () => {
    for (const file of [
      "src/seo/head.ts",
      "src/seo/inject.ts",
      "src/seo/snapshot.ts",
      "src/seo/markdown.ts",
    ]) {
      const imports = code(file).match(/from\s+["'][^"']+["']/g) ?? [];
      for (const statement of imports) {
        expect(statement, `${file}: ${statement}`).not.toMatch(
          /\.(jsx|css|scss)["']/,
        );
        expect(statement, `${file}: ${statement}`).not.toMatch(
          /\/components\//,
        );
      }
    }
  });

  test("the hero hint and the markup name their files from heroImage.js only", () => {
    expect(code("src/seo/pages/home.js")).toContain(
      'from "../../pages/home/heroImage.js"',
    );
    expect(code("src/seo/snapshot.ts")).toContain(
      'from "../pages/home/heroImage.js"',
    );
  });

  test("the snapshot runs the page's own markdown pipeline, not a second allowlist", () => {
    const markdown = code("src/seo/markdown.ts");
    expect(markdown).toContain('from "../lib/markdown/pipeline.js"');
    expect(markdown).not.toContain("defaultSchema");
    expect(markdown).not.toContain("allowDangerousHtml: false");
  });
});

describe("runtime packages and the image", () => {
  const pkg = JSON.parse(read("package.json"));

  test("every package the server layer imports is a dependency (not a dev one)", () => {
    for (const name of [
      "unified",
      "remark-parse",
      "remark-gfm",
      "remark-rehype",
      "rehype-raw",
      "rehype-sanitize",
      "rehype-stringify",
      "swr",
      "hono",
    ]) {
      expect(pkg.dependencies?.[name], name).toBeDefined();
      expect(pkg.devDependencies?.[name], name).toBeUndefined();
    }
  });

  test("the production stage copies all of src/ (seo, lib, content, i18n, pages/home/heroImage.js)", () => {
    expect(read("Dockerfile")).toMatch(/^COPY src \.\/src$/m);
  });
});
