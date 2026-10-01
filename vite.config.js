import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SEC-12: the dev and preview servers listen on loopback only. LAN access is a
// deliberate opt-in (`VITE_HOST=0.0.0.0 bun run dev:vite`); the compose app-dev
// container sets it because its port is published through Docker.
const host = process.env.VITE_HOST || "127.0.0.1";

// Dev API (`bun run api`, src/api/index.ts) on the same loopback interface.
// The browser only talks to this origin; /api is proxied (BE-09: no CORS).
const API_TARGET = "http://127.0.0.1:3001";

// PERF-09 / FE-21: src/styles/bootstrap-subset.scss is compiled with
// sass-embedded. Bootstrap 5.3 only supports @import and still uses global
// built-ins and the old color functions, so Dart Sass would print deprecation
// warnings for its sources (quietDeps) and for the subset's own @import lines.
// ("mixed-decls" from the plan is obsolete in Dart Sass 1.105 and would itself
// print a warning.) tests/frontend/bootstrap/** compiles with these options.
export const scssOptions = {
  quietDeps: true,
  silenceDeprecations: ["import", "global-builtin", "color-functions"],
};

// PERF-10 / FE-32: long-lived vendor chunks by package, decided per module id
// (the object form only caught the package entry files: `react-dom/client`,
// 553 kB of source, stayed in the entry chunk and the `vendor` chunk was
// empty). The React runtime changes only with a dependency bump, so its chunk
// keeps its hash, and its cache entry, across app releases.
// Nothing else is listed on purpose: the markdown chain (react-markdown,
// remark, rehype, parse5, ...) and mermaid belong to the lazy blog chunks
// (PERF-04) and Rollup keeps them there; Bootstrap's JS is not imported at all
// (PERF-09 reads only its SCSS), so only react-bootstrap needs a rule.
const NODE_MODULES = /[\\/]node_modules[\\/]/;
const REACT_RUNTIME =
  /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/;
const REACT_ROUTER =
  /[\\/]node_modules[\\/](?:react-router|react-router-dom)[\\/]/;
const REACT_BOOTSTRAP = /[\\/]node_modules[\\/]react-bootstrap[\\/]/;

export function manualChunks(id) {
  if (!NODE_MODULES.test(id)) return undefined;
  if (REACT_RUNTIME.test(id)) return "vendor";
  if (REACT_ROUTER.test(id)) return "router";
  if (REACT_BOOTSTRAP.test(id)) return "bootstrap";
  return undefined;
}

// PERF-03: `vite build --ssr src/entry-server.jsx --outDir dist/server` is the
// server bundle of the same config (an object, not a function: tests read it
// as plain data, tests/server/api/dev-servers.test.ts). Vite's own
// `isSsrBuild` flag only exists for the function form, so the flag is read
// from the command line.
const isSsrBuild = process.argv.includes("--ssr");

export default defineConfig({
  plugins: [react()],
  base: "/",
  css: {
    preprocessorOptions: {
      scss: scssOptions,
    },
  },
  // PERF-03 (T-06 Aşama 2): `vite build --ssr src/entry-server.jsx --outDir
  // dist/server` bundles the server render with every dependency inside it, so
  // the production image needs no node_modules/react to draw a page
  // (PERF-24, W10-BE-docker-image). Only for that build: the component tests
  // (Vitest) keep their own dependency handling.
  ssr: isSsrBuild ? { noExternal: true } : undefined,
  build: {
    outDir: "dist",
    // The client build writes dist/.vite/ssr-manifest.json (module -> chunk
    // files), which src/server/ssr.ts reads for the <link rel="modulepreload">
    // hints of the blog pages (the dot directory is never served,
    // src/server/static.ts).
    ssrManifest: !isSsrBuild,
    // public/ is copied once, by the client build.
    copyPublicDir: !isSsrBuild,
    sourcemap: false,
    rollupOptions: {
      output: isSsrBuild
        ? {
            // One fixed entry name: src/server/ssr.ts and scripts/prerender.ts
            // import dist/server/entry-server.js.
            entryFileNames: "entry-server.js",
            chunkFileNames: "chunks/[name]-[hash].js",
            assetFileNames: "assets/[name]-[hash].[ext]",
          }
        : {
            manualChunks,
            entryFileNames: "assets/[name]-[hash].js",
            chunkFileNames: "assets/[name]-[hash].js",
            assetFileNames: "assets/[name]-[hash].[ext]",
          },
    },
    assetsDir: "assets",
    // The server bundle is not sent to browsers: no minification, readable
    // stack traces in the server log.
    minify: isSsrBuild ? false : "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    host,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    host,
  },
  // Component tests (T-02): Vitest + jsdom, tests/frontend/**. Server/API
  // tests live in tests/server/** and run under `bun test`.
  test: {
    environment: "jsdom",
    setupFiles: [
      "tests/frontend/setup.js",
      "tests/frontend/split/setup-async-timeout.js",
    ],
    // tests/server/ssr/*.vitest.jsx: PERF-03 hydration checks that need a DOM
    // (the suffix keeps `bun test`, which collects *.test.*, away from them).
    include: [
      "tests/frontend/**/*.test.{js,jsx}",
      "tests/server/ssr/**/*.vitest.{js,jsx}",
    ],
    restoreMocks: true,
    unstubGlobals: true,
    // CSS Modules in the component tests: class names stay as written
    // (`styles.siteHeader === "siteHeader"`), the same names the Bun plugin
    // gives the server tests (tests/frontend/css-arch/bun-css-modules.ts), so
    // server markup and hydrated markup agree. No stylesheet is processed.
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
