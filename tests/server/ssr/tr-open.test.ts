/**
 * PERF-03 with the TR pages open (T-12): the prerender writes both languages
 * and the handler serves them, with nothing more than the one LIVE edit that
 * SEO-11 Adım B makes. Run in a Bun process of its own that applies that edit
 * while src/seo/routes.js loads (tr-open-prerender.ts), because LIVE is read
 * at import time all over the app.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { count, FIXTURE_DIST } from "./helpers";

interface Answer {
  status: number;
  location: string | null;
  html: string;
}
let files: [string, string][];
let pages: Record<string, Answer>;
let dist: string;

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "tr-open-"));
  cpSync(FIXTURE_DIST, dist, { recursive: true });
  rmSync(join(dist, "server"), { recursive: true, force: true });
  rmSync(join(dist, "prerendered"), { recursive: true, force: true });
  const proc = Bun.spawn(
    [process.execPath, join(import.meta.dir, "tr-open-prerender.ts"), dist],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if ((await proc.exited) !== 0) throw new Error(stderr);
  ({ files, pages } = JSON.parse(stdout));
}, 60_000);
afterAll(() => rmSync(dist, { recursive: true, force: true }));

const h1 = (html: string) =>
  /<h1\b[^>]*>([\s\S]*?)<\/h1>/
    .exec(html)![1]
    .replace(/<[^>]*>/g, " ")
    .trim();
const rootText = (html: string) =>
  html.slice(html.indexOf('<div id="root"'), html.indexOf("</body>"));
const title = (html: string) => /<title[^>]*>([^<]*)<\/title>/.exec(html)![1];

describe("both languages are prerendered", () => {
  test("eight files: the four pages under / and under /tr", () => {
    expect(files).toEqual([
      ["/", "/index.html"],
      ["/about", "/about/index.html"],
      ["/portfolio", "/portfolio/index.html"],
      ["/contact", "/contact/index.html"],
      ["/tr", "/tr/index.html"],
      ["/tr/about", "/tr/about/index.html"],
      ["/tr/portfolio", "/tr/portfolio/index.html"],
      ["/tr/contact", "/tr/contact/index.html"],
    ]);
  });

  test.each(["/", "/about", "/portfolio", "/contact"])(
    "%s and its /tr twin: own <html lang>, one title, one h1, data-ssr, its own text",
    (path) => {
      const trPath = path === "/" ? "/tr" : `/tr${path}`;
      const en = pages[path];
      const tr = pages[trPath];
      expect([en.status, tr.status]).toEqual([200, 200]);
      expect(en.html).toContain('<html lang="en">');
      expect(tr.html).toContain('<html lang="tr">');
      for (const { html } of [en, tr]) {
        expect(count(html, /<title\b/g)).toBe(1);
        expect(count(html, /<h1\b/g)).toBe(1);
        expect(html).toContain('<div id="root" data-ssr>');
      }
      // The home page's h1 is the name and the role, which are the same in
      // both languages (T-12); its description and lead text are not.
      if (path !== "/") {
        expect(h1(tr.html)).not.toBe(h1(en.html));
        expect(title(tr.html)).not.toBe(title(en.html));
      }
      expect(rootText(tr.html)).not.toBe(rootText(en.html));
      expect(tr.html).toContain(
        `<link rel="canonical" href="https://www.cengizhankose.com${trPath}" data-seo>`,
      );
      expect(tr.html).toContain('property="og:locale" content="tr_TR"');
    },
  );

  test("hreflang pairs point at each other where the page is indexable", () => {
    const about = pages["/about"].html;
    const trAbout = pages["/tr/about"].html;
    for (const html of [about, trAbout]) {
      expect(html).toContain(
        'hreflang="en" href="https://www.cengizhankose.com/about"',
      );
      expect(html).toContain(
        'hreflang="tr" href="https://www.cengizhankose.com/tr/about"',
      );
      expect(html).toContain(
        'hreflang="x-default" href="https://www.cengizhankose.com/about"',
      );
    }
  });

  test("the home page's hero preload is on / and /tr and nowhere else", () => {
    const preloads = Object.fromEntries(
      ["/", "/tr", "/about", "/tr/about", "/contact", "/tr/contact"].map(
        (path) => [
          path,
          count(pages[path].html, /<link rel="preload" as="image"/g),
        ],
      ),
    );
    expect(preloads).toEqual({
      "/": 1,
      "/tr": 1,
      "/about": 0,
      "/tr/about": 0,
      "/contact": 0,
      "/tr/contact": 0,
    });
  });

  test("the chrome of a /tr page speaks Turkish and links /tr pages", () => {
    const html = pages["/tr/about"].html;
    expect(html).toContain('href="/tr/contact"');
    expect(html).toContain('href="/tr/blog"');
    expect(html).not.toContain('href="/contact"');
  });
});

describe("the handler serves them as routes", () => {
  test("another spelling of a /tr page is one 301 to the canonical path", () => {
    expect(pages["/tr/"]).toMatchObject({ status: 301, location: "/tr" });
    expect(pages["/TR/about"]).toMatchObject({
      status: 301,
      location: "/tr/about",
    });
    expect(pages["/tr/about/index.html"]).toMatchObject({
      status: 301,
      location: "/tr/about",
    });
  });

  test("/tr/blog is drawn per request in Turkish, with the other language's lists", () => {
    const blog = pages["/tr/blog"];
    expect(blog.status).toBe(200);
    expect(blog.html).toContain('<html lang="tr">');
    expect(blog.html).toContain('<div id="root" data-ssr>');
    expect(blog.html).toContain("Merhaba dünya");
    expect(pages["/blog"].html).toContain('<html lang="en">');
  });
});
