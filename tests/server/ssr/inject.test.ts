/**
 * injectIntoShell / assertShellMarkers (SEO-01 step 5): the page is written
 * into the shell at the right places, every value is inserted literally, the
 * JSON data block cannot be closed from inside, tags the shell already has do
 * not become second tags, and a shell without a marker stops startup.
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertShellMarkers,
  findStylesheets,
  injectIntoShell,
  injectShellMeta,
  readShell,
  serializeSeoData,
} from "../../../src/seo/inject";
import { SEO_DATA_ID } from "../../../src/seo/readSeoData.js";
import { count, FIXTURE_DIST } from "./helpers";

const REPO = join(import.meta.dir, "..", "..", "..");

const SHELL =
  '<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8" />' +
  '<meta name="author" content="Cengizhan Köse" />' +
  "<title>Shell title</title>" +
  '<script type="module" src="/assets/app.js"></script></head>' +
  '<body><div id="root"></div></body></html>';

describe("assertShellMarkers", () => {
  test("the repository's index.html and the fixture shell have every marker", () => {
    expect(() => readShell(join(REPO, "index.html"))).not.toThrow();
    expect(() => readShell(join(FIXTURE_DIST, "index.html"))).not.toThrow();
  });

  test.each([
    ["<html> tag", SHELL.replace(/<html[^>]*>/, "")],
    ["</head>", SHELL.replace("</head>", "")],
    ["<title>", SHELL.replace(/<title>.*<\/title>/, "")],
    [
      '<div id="root"></div>',
      SHELL.replace('<div id="root"></div>', "<div id='root'></div>"),
    ],
    ["</body>", SHELL.replace("</body>", "")],
  ])("a shell without %s is refused, naming it", (marker, shell) => {
    expect(() => assertShellMarkers(shell, "dist/index.html")).toThrow(
      new RegExp(
        `dist/index\\.html is missing .*${marker.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&")}`,
      ),
    );
  });

  test("every missing marker is listed at once", () => {
    expect(() => assertShellMarkers("<p>nothing</p>")).toThrow(
      /<html> tag, <\/head>, <title>, <div id="root"><\/div>, <\/body>/,
    );
  });
});

describe("injectIntoShell", () => {
  const out = injectIntoShell(SHELL, {
    lang: "tr",
    headTags:
      '<title data-seo>Yeni başlık</title><meta name="description" content="d" data-seo>',
    bodyHtml: "<h1>Merhaba</h1>",
    data: { "/api/posts/x": { slug: "x" } },
  });

  test("sets <html lang> and keeps the other <html> attributes", () => {
    expect(out).toContain('<html data-theme="dark" lang="tr">');
    expect(count(out, /<html\b/g)).toBe(1);
  });

  test("the shell's own title is gone; the head tags land before </head>", () => {
    expect(out).not.toContain("Shell title");
    expect(count(out, /<title\b/g)).toBe(1);
    expect(out).toContain(
      '<script type="module" src="/assets/app.js"></script><title data-seo>Yeni başlık</title><meta name="description" content="d" data-seo></head>',
    );
    // charset and author stay
    expect(out).toContain('<meta charset="utf-8" />');
    expect(out).toContain('<meta name="author"');
  });

  test("the snapshot goes inside #root", () => {
    expect(out).toContain('<div id="root"><h1>Merhaba</h1></div>');
  });

  test("the data block is the last thing before </body>", () => {
    expect(out).toContain(
      `</div><script id="${SEO_DATA_ID}" type="application/json">{"/api/posts/x":{"slug":"x"}}</script></body>`,
    );
  });

  test("no language, body or data: those parts stay as they were", () => {
    const plain = injectIntoShell(SHELL, {
      headTags: "<title data-seo>T</title>",
    });
    expect(plain).toContain('<html lang="en" data-theme="dark">');
    expect(plain).toContain('<div id="root"></div>');
    expect(plain).not.toContain(SEO_DATA_ID);
    expect(injectIntoShell(SHELL, { headTags: "", data: {} })).not.toContain(
      SEO_DATA_ID,
    );
    expect(injectIntoShell(SHELL, { headTags: "", data: null })).not.toContain(
      SEO_DATA_ID,
    );
  });

  test("a hostile lang cannot add an attribute", () => {
    const html = injectIntoShell(SHELL, {
      lang: 'en" onload="x',
      headTags: "",
    });
    expect(html).toContain('lang="en&quot; onload=&quot;x"');
    expect(html).not.toContain(' onload="x"');
  });

  test("`$&`, `$1` and `$$` in tags, body and data land literally", () => {
    const html = injectIntoShell(SHELL, {
      headTags: "<title data-seo>$& $1 $$</title>",
      bodyHtml: "<p>$& $` $' $$</p>",
      data: { k: "$& $1 $$" },
    });
    expect(html).toContain("<title data-seo>$& $1 $$</title>");
    expect(html).toContain("<p>$& $` $' $$</p>");
    // `&` is written as \u0026 in the block; the `$` sequences stay as they are.
    expect(html).toContain('{"k":"$\\u0026 $1 $$"}');
  });
});

describe("the data block (T-04, CSP-safe)", () => {
  const evil = {
    "/api/posts/x": {
      content:
        "</script><script>alert(1)</script><!-- & <img src=x onerror=alert(2)>   ",
    },
  };
  const html = injectIntoShell(SHELL, { headTags: "", data: evil });
  const block = new RegExp(
    `<script id="${SEO_DATA_ID}" type="application/json">([\\s\\S]*?)</script>`,
  ).exec(html)!;

  test("the text inside cannot close the script element or open a tag", () => {
    expect(block[1]).not.toContain("<");
    expect(block[1]).not.toContain(">");
    expect(block[1]).not.toContain("&");
    expect(count(html, /<script\b/g)).toBe(2); // the module script and the block
    expect(count(html, /<\/script>/g)).toBe(2);
  });

  test("it parses back to the same value", () => {
    expect(JSON.parse(block[1])).toEqual(evil);
  });

  test("it is not executable: type=application/json", () => {
    expect(block[0]).toContain('type="application/json"');
  });

  test("serializeSeoData escapes the same characters", () => {
    expect(serializeSeoData({ a: "<&>" })).toBe(
      '{"a":"\\u003c\\u0026\\u003e"}',
    );
  });
});

describe("tags the shell already has do not become second tags", () => {
  const dirty =
    '<html lang="en"><head><meta charset="utf-8">' +
    "<title>Old</title>" +
    '<meta name="description" content="old">' +
    '<meta name="robots" content="all">' +
    '<meta name="robots-extra" content="keep">' +
    '<link rel="canonical" href="https://old.example/">' +
    '<link rel="alternate" hreflang="en" href="https://old.example/">' +
    '<link href="https://old.example/" rel="alternate" hreflang="tr">' +
    '<link rel="alternate" type="application/rss+xml" href="/rss.xml">' +
    '<meta property="og:title" content="old">' +
    '<meta property="article:author" content="old">' +
    '<meta name="twitter:card" content="old">' +
    '<script type="application/ld+json">{"old":true}</script>' +
    '<meta name="theme-color" content="#000">' +
    '</head><body><div id="root"></div></body></html>';
  const html = injectIntoShell(dirty, {
    headTags:
      '<title data-seo>New</title><meta name="description" content="new" data-seo>' +
      '<meta name="robots" content="noindex" data-seo>' +
      '<link rel="canonical" href="https://www.cengizhankose.com/" data-seo>' +
      '<meta property="og:title" content="new" data-seo>' +
      '<script type="application/ld+json" id="ld-json" data-seo>{"new":true}</script>',
  });

  test("one of each managed tag, the new one", () => {
    expect(count(html, /<title\b/g)).toBe(1);
    expect(count(html, /name="description"/g)).toBe(1);
    expect(count(html, /name="robots"/g)).toBe(1);
    expect(count(html, /rel="canonical"/g)).toBe(1);
    expect(count(html, /property="og:title"/g)).toBe(1);
    expect(count(html, /ld\+json/g)).toBe(1);
    expect(html).not.toContain("old.example");
    expect(html).not.toContain('"old"');
    expect(html).not.toContain('content="old"');
    expect(html).toContain('content="noindex"');
  });

  test("hreflang links and Open Graph/Twitter leftovers are removed", () => {
    expect(html).not.toContain("hreflang");
    expect(html).not.toContain("article:author");
    expect(html).not.toContain("twitter:card");
  });

  test("unrelated tags survive: charset, theme-color, a similarly named meta, the RSS link", () => {
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="theme-color" content="#000">');
    expect(html).toContain('<meta name="robots-extra" content="keep">');
    expect(html).toContain(
      '<link rel="alternate" type="application/rss+xml" href="/rss.xml">',
    );
  });
});

describe("injectShellMeta (SEO-02 step 4, kept for SEO_INJECT=off)", () => {
  test("replaces the title, sets robots and lang, leaves other tags", () => {
    const html = injectShellMeta(SHELL, {
      title: "Not found",
      robots: "noindex",
      lang: "tr",
    });
    expect(html).toContain('<html data-theme="dark" lang="tr">');
    expect(html).toContain("<title data-seo>Not found</title>");
    expect(html).toContain(
      '<meta name="robots" content="noindex" data-seo></head>',
    );
    expect(html).toContain('<meta name="author"');
  });

  test("a meta named like robots-something is not removed (W3 review)", () => {
    const html = injectShellMeta(
      '<html><head><meta name="robots-extra" content="keep"><meta name="robots" content="all"></head></html>',
      { robots: "noindex" },
    );
    expect(html).toContain('name="robots-extra"');
    expect(count(html, /name="robots"/g)).toBe(1);
    expect(html).toContain('content="noindex"');
  });
});

describe("findStylesheets (the lazy chunk's CSS, found by a class name the snapshot prints)", () => {
  function dist(files: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), "seo-css-"));
    mkdirSync(join(dir, "assets"));
    for (const [name, text] of Object.entries(files)) {
      writeFileSync(join(dir, "assets", name), text);
    }
    return dir;
  }

  test("returns the site path of every stylesheet holding the marker, in name order", () => {
    const dir = dist({
      "style-b.css": ".blog-container{padding:0}",
      "index-a.css": ":root{}",
      "style-a.css": ".x{}.blog-container{}",
      "notes.txt": ".blog-container",
      "app.js": ".blog-container",
    });
    try {
      expect(findStylesheets(dir, ".blog-container")).toEqual([
        "/assets/style-a.css",
        "/assets/style-b.css",
      ]);
      expect(findStylesheets(dir, ".nothing-here")).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("no assets directory (dev, tests) gives an empty list", () => {
    expect(findStylesheets(join(tmpdir(), "no-such-dist-7f3"), ".x")).toEqual(
      [],
    );
  });
});
