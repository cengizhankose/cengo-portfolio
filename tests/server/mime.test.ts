import { describe, expect, test } from "bun:test";
import { contentTypeFor } from "../../src/server/mime";

/** `text/plain; charset=utf-8` and `text/plain;charset=utf-8` are the same media type (RFC 9110 §5.6.6). */
const normalize = (value: string) =>
  value.toLowerCase().replace(/\s*;\s*/g, ";");

describe("contentTypeFor", () => {
  // PERF-17 acceptance table
  test.each([
    ["photo.JPG", "image/jpeg"],
    ["robots.txt", "text/plain; charset=utf-8"],
    ["manifest.webmanifest", "application/manifest+json"],
    ["x.avif", "image/avif"],
  ])("PERF-17: %s -> %s", (path, expected) => {
    expect(normalize(contentTypeFor(path))).toBe(normalize(expected));
  });

  // BE-23 acceptance table (exact strings, Bun's own format)
  test.each([
    ["robots.txt", "text/plain;charset=utf-8"],
    ["sitemap.xml", "application/xml"],
    ["site.webmanifest", "application/manifest+json"],
    ["index-abc.js.map", "application/json;charset=utf-8"],
    ["loader.gif", "image/gif"],
    ["font.ttf", "font/ttf"],
    ["photo-4OjSTnTo.JPG", "image/jpeg"],
  ])("BE-23: %s -> %s", (path, expected) => {
    expect(contentTypeFor(path)).toBe(expected);
  });

  // Contract for later waves (ANL-12 .pdf, PERF-02/FE-18 .avif, SEO-22 robots.txt, fonts, icons)
  test.each([
    ["/assets/index-UkMONeEf.js", "text/javascript;charset=utf-8"],
    ["/assets/chunk.mjs", "text/javascript;charset=utf-8"],
    ["/assets/index-Bqx_0eD8.css", "text/css;charset=utf-8"],
    ["/index.html", "text/html;charset=utf-8"],
    ["/manifest.json", "application/json;charset=utf-8"],
    ["/cv/Cengizhan_Kose_CV_EN.pdf", "application/pdf"],
    ["/img/hero-1284.webp", "image/webp"],
    ["/img/hero-1284.AVIF", "image/avif"],
    ["/img/hero.jpeg", "image/jpeg"],
    ["/img/logo.png", "image/png"],
    ["/favicon.ico", "image/x-icon"],
    ["/favicon.svg", "image/svg+xml"],
    ["/fonts/urbanist-v1.woff2", "font/woff2"],
    ["/fonts/urbanist-v1.woff", "font/woff"],
    ["/fonts/urbanist-v1.otf", "font/otf"],
    ["/video/intro.mp4", "video/mp4"],
    ["/video/intro.webm", "video/webm"],
  ])("contract: %s -> %s", (path, expected) => {
    expect(contentTypeFor(path)).toBe(expected);
  });

  test("JavaScript is served as text/javascript (module scripts need a JS MIME type)", () => {
    expect(contentTypeFor("/assets/app.JS")).toStartWith("text/javascript");
  });

  test("extension lookup is case-insensitive for every pinned type", () => {
    for (const ext of [
      "TXT",
      "Xml",
      "WEBMANIFEST",
      "Map",
      "PNG",
      "Svg",
      "ICO",
      "WOFF2",
      "PDF",
      "MP4",
      "GIF",
      "TTF",
    ]) {
      expect(contentTypeFor(`file.${ext}`)).toBe(
        contentTypeFor(`file.${ext.toLowerCase()}`),
      );
      expect(contentTypeFor(`file.${ext}`)).not.toBe(
        "application/octet-stream",
      );
    }
  });

  test("unknown extensions fall back to Bun, then to application/octet-stream", () => {
    expect(contentTypeFor("data.csv")).toBe(Bun.file("x.csv").type);
    expect(contentTypeFor("archive.unknownext")).toBe(
      "application/octet-stream",
    );
    expect(contentTypeFor("apple-app-site-association")).toBe(
      "application/octet-stream",
    );
    expect(contentTypeFor("/.well-known/")).toBe("application/octet-stream");
    expect(contentTypeFor("trailing.")).toBe("application/octet-stream");
  });

  test("only the last extension counts", () => {
    expect(contentTypeFor("bundle.js.txt")).toBe("text/plain;charset=utf-8");
    expect(contentTypeFor("/assets/dir.v2/file.css")).toBe(
      "text/css;charset=utf-8",
    );
  });
});
