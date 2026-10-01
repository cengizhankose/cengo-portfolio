/**
 * How the pieces are wired (SEO-01 steps 8-11, PERF-01, PERF-03): the client
 * entry hydrates the server's HTML and takes the server's data, the server
 * entry draws the same tree, the build produces the server bundle and the
 * prerendered pages, and the modules the server and the browser share stay
 * pure.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inCheckout } from "../helpers";

const REPO = join(import.meta.dir, "..", "..", "..");
const read = (file: string) => readFileSync(join(REPO, file), "utf8");
const code = (file: string) => read(file).replace(/^\s*\/\/.*$/gm, "");

describe("src/entry-client.jsx", () => {
  const entry = code("src/entry-client.jsx");

  test("replaces src/main.jsx as the one entry the page loads", () => {
    expect(existsSync(join(REPO, "src/main.jsx"))).toBe(false);
    expect(read("index.html")).toContain('src="/src/entry-client.jsx"');
    expect(read("index.html")).not.toContain("main.jsx");
  });

  test("gives swr the server's data as its fallback", () => {
    expect(entry).toContain('from "./seo/readSeoData.js"');
    expect(entry).toContain('from "./lib/swrFallback.js"');
    expect(entry).toMatch(/fallback:\s*toSWRFallback\(readSeoData\(\)\)/);
  });

  test("hydrates a server render (data-ssr) and draws a plain shell with createRoot", () => {
    expect(entry).toContain('hasAttribute("data-ssr")');
    expect(entry).toMatch(
      /if \(hydrating\) hydrateRoot\(container, app\);\s*else createRoot\(container\)\.render\(app\)/,
    );
  });

  test("calls initAnalytics once, after the render", () => {
    expect(entry.match(/initAnalytics\(\)/g)).toHaveLength(1);
    expect(entry.indexOf("hydrateRoot(container, app)")).toBeLessThan(
      entry.indexOf("initAnalytics()"),
    );
  });

  test("loads the lazy page chunk before it hydrates, and adds no preloadError listener of its own", () => {
    expect(entry).toContain("chunkLoaderForRoute(matchRoute(");
    expect(entry).not.toContain("vite:preloadError");
    // The one listener lives in App.jsx (FE-05 step 4).
    expect(code("src/app/App.jsx")).toContain('"vite:preloadError"');
  });

  test("builds the same tree as the server: StrictMode > SWRConfig > router > AppRoot", () => {
    const server = code("src/entry-server.jsx");
    for (const source of [entry, server]) {
      expect(source).toContain("<StrictMode>");
      expect(source).toContain("<SWRConfig");
      expect(source).toContain("<AppRoot />");
      expect(source).toContain("basename={import.meta.env.BASE_URL}");
    }
    expect(entry).toContain("<BrowserRouter");
    expect(server).toContain("<StaticRouter");
    // IntentPrefetch sits inside AppRoot next to AppShell, so neither entry
    // places anything of its own beside them (useId depends on the tree's
    // shape).
    expect(entry).not.toContain("IntentPrefetch");
    expect(server).not.toContain("IntentPrefetch");
    expect(code("src/app/App.jsx")).toMatch(
      /function AppRoot\(\)[\s\S]*<IntentPrefetch \/>\s*<AppShell \/>/,
    );
  });

  test("keeps the font and global styles import order (fonts.css before index.css)", () => {
    expect(entry.indexOf("./styles/fonts.css")).toBeGreaterThan(-1);
    expect(entry.indexOf("./styles/fonts.css")).toBeLessThan(
      entry.indexOf("./index.css"),
    );
  });
});

describe("src/entry-server.jsx", () => {
  const entry = code("src/entry-server.jsx");

  test("waits for every boundary with prerender and keeps the output free of inline scripts", () => {
    expect(entry).toContain('from "react-dom/static"');
    expect(entry).toContain("progressiveChunkSize: Infinity");
  });

  test("throws a render error instead of serving half a page", () => {
    expect(entry).toMatch(/onError:\s*\(error\)\s*=>/);
    expect(entry).toMatch(/if \(errors\.length > 0\)\s*{\s*throw new Error/);
  });

  test("touches no browser global", () => {
    expect(entry).not.toMatch(/\b(window|document|localStorage|navigator)\b/);
  });

  test("does not draw the head: usePageMeta is an effect and the head has one source (T-03)", () => {
    expect(entry).not.toMatch(/Helmet|usePageMeta|renderHeadTags/);
  });
});

describe("the blog index and the page share the grouping rule", () => {
  test("BlogHome imports it and no longer defines it", () => {
    const page = code("src/pages/blog/BlogHome.jsx");
    expect(page).toContain('from "../../lib/postGroups.js"');
    expect(page).toContain("groupPostsForLocale(posts, locale)");
    expect(page).not.toMatch(/function groupPosts\b/);
    // The old export stays for its callers.
    expect(page).toMatch(/export const groupPosts = groupPostsForLocale/);
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

  test("the server layer imports no component, no stylesheet and no React package", () => {
    for (const file of [
      "src/seo/head.ts",
      "src/seo/inject.ts",
      "src/server/static.ts",
      "src/server/ssr.ts",
    ]) {
      const imports = code(file).match(/from\s+["'][^"']+["']/g) ?? [];
      for (const statement of imports) {
        expect(statement, `${file}: ${statement}`).not.toMatch(
          /\.(jsx|css|scss)["']/,
        );
        expect(statement, `${file}: ${statement}`).not.toMatch(
          /\/components\//,
        );
        expect(statement, `${file}: ${statement}`).not.toMatch(
          /["'](react|react-dom|react-router|react-router-dom|swr)(\/[^"']*)?["']/,
        );
      }
    }
  });

  test("the hero hint names its files from heroImage.js only", () => {
    expect(code("src/seo/pages/home.js")).toContain(
      'from "../../pages/home/heroImage.js"',
    );
  });
});

describe("the snapshot is gone (PERF-03 step 9)", () => {
  test("no second render path: src/seo/snapshot.ts and its markdown module do not exist", () => {
    expect(existsSync(join(REPO, "src/seo/snapshot.ts"))).toBe(false);
    expect(existsSync(join(REPO, "src/seo/markdown.ts"))).toBe(false);
  });

  test("nothing in the server layer still imports them", () => {
    for (const file of [
      "src/server/static.ts",
      "src/seo/inject.ts",
      "src/seo/head.ts",
      "scripts/prerender.ts",
      "server.ts",
    ]) {
      expect(code(file), file).not.toMatch(
        /seo\/(snapshot|markdown)|renderSnapshot|renderNotFoundSnapshot/,
      );
    }
  });

  test("the server's own graph needs no markdown packages any more", () => {
    for (const file of [
      "src/server/static.ts",
      "src/server/ssr.ts",
      "src/seo/inject.ts",
      "src/seo/head.ts",
      "src/seo/pages.js",
    ]) {
      expect(code(file), file).not.toMatch(
        /from\s+["'](unified|remark-[a-z]+|rehype-[a-z]+)["']/,
      );
    }
  });
});

describe("the build (package.json, vite.config.js)", () => {
  const pkg = JSON.parse(read("package.json"));

  test("build = client bundle, server bundle, prerender, in that order", () => {
    const steps = String(pkg.scripts.build)
      .split("&&")
      .map((step) => step.trim());
    expect(steps).toEqual([
      "vite build",
      "vite build --ssr src/entry-server.jsx --outDir dist/server",
      "bun scripts/prerender.ts",
    ]);
  });

  test("the client build writes the ssr manifest; the server build copies no public/ and names its entry", () => {
    const config = read("vite.config.js");
    expect(config).toContain("ssrManifest: !isSsrBuild");
    expect(config).toContain("copyPublicDir: !isSsrBuild");
    expect(config).toContain('entryFileNames: "entry-server.js"');
    expect(config).toMatch(/ssr:\s*isSsrBuild\s*\?\s*{\s*noExternal:\s*true/);
    expect(config).toContain('process.argv.includes("--ssr")');
  });

  test("the config stays a plain object (tests read it as data)", async () => {
    const { default: config } = (await import(
      "../../../vite.config.js" as string
    )) as { default: any };
    expect(config.build.ssrManifest).toBe(true); // a client build: no --ssr in argv
    expect(config.ssr).toBeUndefined();
    expect(config.build.copyPublicDir).toBe(true);
  });

  // .dockerignore drops Dockerfile*: inside the image's builder gate the file
  // is absent, so this only runs in a checkout (W10-BE-docker-image)
  test.skipIf(!inCheckout("Dockerfile"))("the production image copies dist/ (with dist/server) and all of src/", () => {
    const dockerfile = read("Dockerfile");
    expect(dockerfile).toMatch(/^COPY --from=builder \/app\/dist \.\/dist$/m);
    expect(dockerfile).toMatch(/^COPY src \.\/src$/m);
  });
});

describe("runtime packages", () => {
  const pkg = JSON.parse(read("package.json"));

  test("the packages the server process itself imports are dependencies (not dev ones)", () => {
    for (const name of ["hono", "drizzle-orm", "postgres", "zod"]) {
      expect(pkg.dependencies?.[name], name).toBeDefined();
      expect(pkg.devDependencies?.[name], name).toBeUndefined();
    }
  });
});
