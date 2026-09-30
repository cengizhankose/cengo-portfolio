import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SEC-12: the dev and preview servers listen on loopback only. LAN access is a
// deliberate opt-in (`VITE_HOST=0.0.0.0 bun run dev:vite`); the compose app-dev
// container sets it because its port is published through Docker.
const host = process.env.VITE_HOST || "127.0.0.1";

// Dev API (`bun run api`, src/api/index.ts) on the same loopback interface.
// The browser only talks to this origin; /api is proxied (BE-09: no CORS).
const API_TARGET = "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          bootstrap: ["react-bootstrap", "bootstrap"],
          router: ["react-router-dom"],
        },
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
    assetsDir: "assets",
    minify: "terser",
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
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  preview: {
    port: 4173,
    host,
  },
  // Component tests (T-02): Vitest + jsdom, only tests/frontend/**.
  // Server/API tests live in tests/server/** and run under `bun test`.
  test: {
    environment: "jsdom",
    setupFiles: ["tests/frontend/setup.js"],
    include: ["tests/frontend/**/*.test.{js,jsx}"],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
