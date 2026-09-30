// @vitest-environment node
//
// The code split, measured on a real build (PERF-04, FE-05, PERF-10, FE-32).
//
// `vite build` runs in memory (write: false, outDir in the OS temp dir): the
// repository's dist/ is never touched. It is not minified (the chunking does
// not depend on it and the test stays short), and runs as a production build
// whatever NODE_ENV the test runner has (the image gate sets NODE_ENV=test).
// Byte budgets need a minified build and are measured in
// claudedocs/audit-2026-09-30/impl/W6-PERF-code-split.md, not here; this file
// pins the structure that produces them.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { manualChunks } from "../../../vite.config.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

// The markdown chain that only the blog post needs (PERF-04 <DESEN>).
const MARKDOWN_CHAIN =
  /node_modules\/(react-markdown|remark-|rehype-|micromark|mdast-|hast-|unified|parse5)/;
const isModule = (pattern) => (id) => pattern.test(id.replaceAll("\\", "/"));

async function inMemoryBuild(inlineConfig) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const result = await build({
      logLevel: "silent",
      mode: "production",
      ...inlineConfig,
    });
    return (Array.isArray(result) ? result[0] : result).output;
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

let output;
let chunks;
let warnings;
const chunkNamed = (prefix) =>
  chunks.filter((chunk) => chunk.fileName.startsWith(`assets/${prefix}-`));
const modulesOf = (chunk) => Object.keys(chunk.modules);

beforeAll(async () => {
  warnings = [];
  output = await inMemoryBuild({
    root: ROOT,
    configFile: join(ROOT, "vite.config.js"),
    build: {
      write: false,
      minify: false,
      reportCompressedSize: false,
      outDir: join(tmpdir(), "cengo-portfolio-split-test"),
      rollupOptions: { onwarn: (warning) => warnings.push(warning) },
    },
  });
  chunks = output.filter((item) => item.type === "chunk");
}, 600_000);

describe("route chunks (PERF-04, FE-05)", () => {
  it("BlogHome and BlogPost are separate chunks and the entry imports them only dynamically", () => {
    const entry = chunks.find((chunk) => chunk.isEntry);
    const [home] = chunkNamed("BlogHome");
    const [post] = chunkNamed("BlogPost");
    expect(chunkNamed("BlogHome")).toHaveLength(1);
    expect(chunkNamed("BlogPost")).toHaveLength(1);

    expect(entry.dynamicImports).toEqual(
      expect.arrayContaining([home.fileName, post.fileName]),
    );
    expect(entry.imports).not.toContain(home.fileName);
    expect(entry.imports).not.toContain(post.fileName);
  });

  it("the markdown chain is in BlogPost and in no other chunk the entry needs at load", () => {
    const [post] = chunkNamed("BlogPost");
    const [home] = chunkNamed("BlogHome");
    const entry = chunks.find((chunk) => chunk.isEntry);

    expect(modulesOf(post).some(isModule(MARKDOWN_CHAIN))).toBe(true);
    // PERF-04 criterion 1: the entry chunk holds 0 bytes of the chain ...
    expect(modulesOf(entry).filter(isModule(MARKDOWN_CHAIN))).toEqual([]);
    // ... BlogHome does not need it either (FE-05 step 5) ...
    expect(modulesOf(home).filter(isModule(MARKDOWN_CHAIN))).toEqual([]);
    // ... and nothing in the initial load (entry + static imports) has it.
    const byName = Object.fromEntries(chunks.map((c) => [c.fileName, c]));
    const initial = new Set();
    const visit = (name) => {
      if (initial.has(name)) return;
      initial.add(name);
      byName[name].imports.forEach(visit);
    };
    visit(entry.fileName);
    for (const name of initial) {
      expect(
        modulesOf(byName[name]).filter(isModule(MARKDOWN_CHAIN)),
        name,
      ).toEqual([]);
      expect(name).not.toMatch(/mermaid|elk|katex|cytoscape|BlogPost/);
    }
  });

  it("index.html does not preload a blog chunk (PERF-04: grep -c BlogPost index.html -> 0)", () => {
    const html = output.find((item) => item.fileName === "index.html");
    const source = String(html.source);
    expect(source).not.toMatch(/BlogPost|BlogHome/);
    const preloads = [
      ...source.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g),
    ].map((match) => match[1]);
    expect(preloads.length).toBeGreaterThan(0);
    expect(preloads.some((href) => href.includes("/vendor-"))).toBe(true);
  });
});

describe("vendor chunk (PERF-10, FE-32)", () => {
  it("holds the React runtime: react-dom, react and scheduler are in vendor and nowhere else", () => {
    const vendor = chunkNamed("vendor");
    expect(vendor).toHaveLength(1);
    const isRuntime = isModule(
      /node_modules\/(react|react-dom|scheduler)\/(?!.*node_modules)/,
    );

    expect(
      modulesOf(vendor[0]).some(isModule(/node_modules\/react-dom\//)),
    ).toBe(true);
    expect(modulesOf(vendor[0]).some(isModule(/node_modules\/react\//))).toBe(
      true,
    );
    for (const chunk of chunks) {
      if (chunk === vendor[0]) continue;
      expect(
        modulesOf(chunk).filter(isRuntime),
        `${chunk.fileName} carries React runtime files`,
      ).toEqual([]);
    }
    // The empty vendor chunk of the object form is gone.
    expect(vendor[0].code.length).toBeGreaterThan(100_000);
  });

  it("the entry holds app code only: no react-dom, no router, no react-bootstrap", () => {
    const entry = chunks.find((chunk) => chunk.isEntry);
    const foreign = modulesOf(entry).filter(
      isModule(
        /node_modules\/(react-dom|react-router|react-router-dom|react-bootstrap|scheduler)\//,
      ),
    );
    expect(foreign).toEqual([]);
    expect(chunkNamed("router")).toHaveLength(1);
    expect(chunkNamed("bootstrap")).toHaveLength(1);
  });

  it("every module manualChunks names ended up in that chunk", () => {
    for (const chunk of chunks) {
      for (const id of modulesOf(chunk)) {
        const wanted = manualChunks(id);
        if (!wanted) continue;
        expect(chunk.name, id).toBe(wanted);
      }
    }
  });

  it("no chunk cycle among static imports, no empty or circular-chunk warning", () => {
    const byName = Object.fromEntries(chunks.map((c) => [c.fileName, c]));
    const state = new Map();
    const cycles = [];
    const visit = (name, trail) => {
      if (state.get(name) === "done") return;
      if (state.get(name) === "open") {
        cycles.push([...trail, name].join(" -> "));
        return;
      }
      state.set(name, "open");
      for (const next of byName[name].imports) visit(next, [...trail, name]);
      state.set(name, "done");
    };
    chunks.forEach((chunk) => visit(chunk.fileName, []));
    expect(cycles).toEqual([]);

    const relevant = warnings.filter(
      (warning) =>
        warning.code === "EMPTY_BUNDLE" ||
        warning.code === "CIRCULAR_CHUNK" ||
        /circular chunk|empty chunk/i.test(warning.message),
    );
    expect(relevant.map((warning) => warning.message)).toEqual([]);
  });
});

// PERF-10 criterion 3 / FE-32 criterion 5: a change in app code changes the
// entry's file name and leaves the vendor file name alone, so a release does
// not make returning visitors download React again. The probe app imports
// react-dom and the router through the project's own manualChunks function.
describe("vendor file name across app changes", () => {
  const PROBE = "\0probe-entry";
  let previousEnv;

  beforeAll(() => {
    previousEnv = process.env.NODE_ENV;
  });
  afterAll(() => {
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  });

  const probe = (marker) =>
    inMemoryBuild({
      root: ROOT,
      configFile: false,
      logLevel: "silent",
      plugins: [
        {
          name: "probe-entry",
          resolveId: (id) => (id === PROBE ? id : undefined),
          load: (id) =>
            id === PROBE
              ? `import { createRoot } from "react-dom/client";
                 import { createElement } from "react";
                 import { BrowserRouter } from "react-router-dom";
                 createRoot(document.body).render(createElement(BrowserRouter, null, "${marker}"));`
              : undefined,
        },
      ],
      build: {
        write: false,
        minify: false,
        reportCompressedSize: false,
        outDir: join(tmpdir(), "cengo-portfolio-split-probe"),
        rollupOptions: {
          input: PROBE,
          output: {
            manualChunks,
            entryFileNames: "assets/[name]-[hash].js",
            chunkFileNames: "assets/[name]-[hash].js",
          },
        },
      },
    });

  it("changing one character of app code renames the entry, not vendor or router", async () => {
    const pick = (result, prefix) =>
      result.find(
        (item) =>
          item.type === "chunk" &&
          item.fileName.startsWith(`assets/${prefix}-`),
      )?.fileName;
    const a = await probe("version a");
    const b = await probe("version b");

    const vendor = pick(a, "vendor");
    expect(vendor).toBeTruthy();
    expect(pick(b, "vendor")).toBe(vendor);
    expect(pick(a, "router")).toBeTruthy();
    expect(pick(b, "router")).toBe(pick(a, "router"));
    const entries = (result) =>
      result.find((item) => item.type === "chunk" && item.isEntry).fileName;
    expect(entries(b)).not.toBe(entries(a));
  }, 120_000);
});
