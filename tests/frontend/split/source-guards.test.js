// @vitest-environment node
//
// Static guards for the code split (PERF-04, FE-05, PERF-10, FE-32, BE-26).
// Builds prove the result (build-chunks.test.js); these say where a change
// would break it before anyone builds:
// - nothing in src/ imports BlogHome or BlogPost statically: one static
//   import puts the markdown chain back into the entry chunk,
// - manualChunks decides per module id (not by package entry file), and
//   sends the React runtime to `vendor`,
// - vite.config.js has no dead alias, and dist/ is not tracked.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import viteConfig, { manualChunks } from "../../../vite.config.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (file) => readFileSync(join(ROOT, file), "utf8");

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

// The module specifier of every static `import ... from "x"` / `import "x"`
// and `export ... from "x"` in a source file (dynamic import() excluded).
function staticSpecifiers(source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const found = [];
  for (const match of code.matchAll(
    /^\s*(?:import|export)\s+(?:[\w*{}\s,$]+\s+from\s+)?["']([^"']+)["']/gm,
  )) {
    found.push(match[1]);
  }
  return found;
}

describe("the blog pages stay out of the entry chunk (PERF-04, FE-05)", () => {
  it("src/ has no static import of BlogHome or BlogPost", () => {
    const offenders = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      for (const specifier of staticSpecifiers(readFileSync(file, "utf8"))) {
        if (/(^|\/)Blog(Home|Post)(\.jsx)?$/.test(specifier)) {
          offenders.push(`${relative(ROOT, file)}: ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("only loaders.js names the pages, through two import() calls and no static import", () => {
    const source = read("src/pages/blog/loaders.js");
    expect(staticSpecifiers(source)).toEqual([]);
    expect(source).toMatch(
      /loadBlogHome\s*=\s*\(\)\s*=>\s*import\("\.\/BlogHome"\)/,
    );
    expect(source).toMatch(
      /loadBlogPost\s*=\s*\(\)\s*=>\s*import\("\.\/BlogPost"\)/,
    );

    const naming = sourceFiles(join(ROOT, "src")).filter((file) =>
      /import\(\s*["'][^"']*Blog(Home|Post)/.test(readFileSync(file, "utf8")),
    );
    expect(naming.map((file) => relative(ROOT, file))).toEqual([
      "src/pages/blog/loaders.js",
    ]);
  });

  it("the route table wraps the lazy pages in Suspense with RouteFallback and adds no routes.jsx edit", () => {
    const source = read("src/app/pageRoutes.jsx");
    expect(source).toMatch(/lazyPage\(loadBlogHome\)/);
    expect(source).toMatch(/lazyPage\(loadBlogPost\)/);
    expect(source).toMatch(/<Suspense fallback=\{<RouteFallback \/>\}>/);
    expect(staticSpecifiers(source)).not.toContain("../pages/blog/BlogHome");
    expect(staticSpecifiers(source)).not.toContain("../pages/blog/BlogPost");
  });
});

describe("manualChunks (PERF-10, FE-32)", () => {
  it("is a function, wired into the build, not the object form", () => {
    expect(typeof manualChunks).toBe("function");
    expect(viteConfig.build.rollupOptions.output.manualChunks).toBe(
      manualChunks,
    );
  });

  it("sends the React runtime to vendor (every file of it, not only the package entry)", () => {
    for (const id of [
      "/app/node_modules/react/index.js",
      "/app/node_modules/react/cjs/react.production.js",
      "/app/node_modules/react-dom/index.js",
      "/app/node_modules/react-dom/client.js",
      "/app/node_modules/react-dom/cjs/react-dom-client.production.js",
      "/app/node_modules/react-dom/cjs/react-dom.production.js",
      "/app/node_modules/scheduler/index.js",
      "/app/node_modules/scheduler/cjs/scheduler.production.js",
    ]) {
      expect(manualChunks(id), id).toBe("vendor");
    }
  });

  it("knows the router and react-bootstrap, and nothing else", () => {
    expect(manualChunks("/app/node_modules/react-router/dist/x.mjs")).toBe(
      "router",
    );
    expect(manualChunks("/app/node_modules/react-router-dom/dist/x.mjs")).toBe(
      "router",
    );
    expect(
      manualChunks("/app/node_modules/react-bootstrap/esm/Button.js"),
    ).toBe("bootstrap");
    // Bootstrap's own JS is never imported (PERF-09 reads its SCSS only).
    expect(
      manualChunks("/app/node_modules/bootstrap/dist/js/bootstrap.esm.js"),
    ).toBeUndefined();
  });

  it("leaves the markdown chain, mermaid, swr, lookalike names and app code to Rollup", () => {
    for (const id of [
      "/app/node_modules/react-markdown/index.js",
      "/app/node_modules/remark-gfm/index.js",
      "/app/node_modules/rehype-raw/index.js",
      "/app/node_modules/parse5/dist/index.js",
      "/app/node_modules/micromark/index.js",
      "/app/node_modules/mermaid/dist/mermaid.core.mjs",
      "/app/node_modules/swr/dist/index/index.mjs",
      "/app/node_modules/react-is/index.js",
      "/app/node_modules/react-icons/fa/index.mjs",
      "/app/node_modules/react-dom-lookalike/index.js",
      "/app/src/pages/blog/BlogPost.jsx",
      "/app/src/react/index.js",
      "\0vite/preload-helper.js",
    ]) {
      expect(manualChunks(id), id).toBeUndefined();
    }
  });

  it("matches Windows path separators and nested node_modules", () => {
    expect(
      manualChunks("C:\\app\\node_modules\\react-dom\\cjs\\react-dom.js"),
    ).toBe("vendor");
    expect(
      manualChunks(
        "/app/node_modules/.bun/react-dom@19.2.3/node_modules/react-dom/index.js",
      ),
    ).toBe("vendor");
  });
});

describe("vite.config.js (FE-32)", () => {
  it("has no resolve.alias: the '@' alias was never used", () => {
    expect(viteConfig.resolve?.alias).toBeUndefined();
    expect(read("vite.config.js")).not.toMatch(/alias/);
    const users = sourceFiles(join(ROOT, "src")).filter((file) =>
      /from\s+["']@\//.test(readFileSync(file, "utf8")),
    );
    expect(users).toEqual([]);
  });
});

// The Docker builder copies neither .git nor .gitignore (.dockerignore), and
// the image gate runs these tests there: the repository checks step aside.
const inRepository = existsSync(join(ROOT, ".git"));

describe("dist/ is build output, not source (BE-26, FE-32)", () => {
  it.skipIf(!inRepository)(".gitignore ignores /dist exactly once", () => {
    const lines = read(".gitignore").split("\n");
    expect(lines.filter((line) => line === "/dist")).toHaveLength(1);
  });

  it.skipIf(!inRepository)("git tracks no file under dist/", () => {
    const tracked = execFileSync("git", ["ls-files", "dist"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(tracked.trim()).toBe("");
  });

  it.skipIf(!inRepository)(
    "git ignores dist/index.html but not the tracked test fixture dist",
    () => {
      const ignored = (path) => {
        try {
          execFileSync("git", ["check-ignore", "-q", path], { cwd: ROOT });
          return true;
        } catch {
          return false;
        }
      };
      expect(ignored("dist/index.html")).toBe(true);
      expect(ignored("dist/assets/index-abc123.js")).toBe(true);
      expect(ignored("tests/server/fixtures/dist/index.html")).toBe(false);
    },
  );
});
