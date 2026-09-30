// PERF-08 / ANL-17: the fonts are self-hosted, so the CSP has no Google Fonts
// host any more: font-src is 'self' alone and style-src has no external host.
// The woff2 files are served from our own origin with the immutable policy.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../../../src/api/app";
import { buildCsp } from "../../../src/api/middleware/csp";
import { fakeQueries } from "../api/fake-queries";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const WWW = "www.cengizhankose.com";
const GOOGLE_FONTS = /fonts\.(googleapis|gstatic)\.com/;

let dist: string;
let savedLogLevel: string | undefined;

beforeAll(() => {
  savedLogLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "error";
  // A built-site stand-in: the real index.html (its inline script is hashed at
  // startup) and the real public/fonts folder.
  dist = mkdtempSync(join(tmpdir(), "csp-fonts-dist-"));
  cpSync(join(ROOT, "index.html"), join(dist, "index.html"));
  cpSync(join(ROOT, "public", "fonts"), join(dist, "fonts"), {
    recursive: true,
  });
});

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
  if (savedLogLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = savedLogLevel;
});

const app = () =>
  createApp({ queries: fakeQueries(), serveSpa: true, distDir: dist, env: {} });

const get = (path: string) =>
  app().request(path, {
    headers: { host: WWW, "cf-connecting-ip": "203.0.113.10" },
  });

describe("CSP directive list (PERF-08)", () => {
  for (const mode of ["report-only", "enforce"] as const) {
    test(`${mode}: font-src is 'self' only and no directive names a Google Fonts host`, () => {
      const csp = buildCsp({ mode });
      expect(csp.fontSrc).toEqual(["'self'"]);
      expect(csp.styleSrc).toEqual(["'self'", "'unsafe-inline'"]);
      expect(JSON.stringify(csp)).not.toMatch(GOOGLE_FONTS);
    });
  }

  test("the header on a real response carries no Google Fonts host and no preconnect need", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy-report-only") ?? "";
    expect(csp).toContain("font-src 'self'");
    expect(csp).not.toMatch(GOOGLE_FONTS);
    // the font preloads in the HTML are same-origin, so 'self' covers them
    const html = await res.text();
    expect(html).not.toMatch(GOOGLE_FONTS);
    expect(html).toContain('href="/fonts/v1/raleway-latin-400-normal.woff2"');
  });
});

describe("font files are served from our origin (PERF-08 criterion 4)", () => {
  test.each([
    "/fonts/v1/raleway-latin-400-normal.woff2",
    "/fonts/v1/marcellus-latin-400-normal.woff2",
    "/fonts/v1/raleway-latin-ext-700-normal.woff2",
  ])("%s -> font/woff2, one year, immutable", async (path) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("font/woff2");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("wOF2");
  });

  test("a font path that does not exist is a real 404, not the SPA shell", async () => {
    const res = await get("/fonts/v1/missing-400-normal.woff2");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type") ?? "").not.toContain("text/html");
  });

  test("the OFL licence text sits next to the fonts", async () => {
    const res = await get("/fonts/v1/OFL.txt");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(text).toContain("Raleway");
    expect(text).toContain("Marcellus");
  });
});
