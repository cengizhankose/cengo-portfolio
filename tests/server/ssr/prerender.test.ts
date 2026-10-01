/**
 * scripts/prerender.ts (PERF-03): the build step that writes one finished HTML
 * file per static page and language, from the client build's index.html and
 * the server render. Run here on a copy of the fixture dist with the real
 * render; the pages are then served by the real site handler.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fileForUrl,
  pagesToPrerender,
  prerender,
  validatePage,
} from "../../../scripts/prerender";
import { ALL_LIVE, LIVE } from "../../../src/seo/routes.js";
import { SHELL_FILE } from "../../../src/server/ssr";
import { silenceLogs } from "../helpers";
import { count, FIXTURE_DIST, render } from "./helpers";

silenceLogs();

const dirs: string[] = [];
function freshDist(): string {
  const dist = mkdtempSync(join(tmpdir(), "prerender-"));
  dirs.push(dist);
  cpSync(FIXTURE_DIST, dist, { recursive: true });
  rmSync(join(dist, "server"), { recursive: true, force: true });
  rmSync(join(dist, "prerendered"), { recursive: true, force: true });
  return dist;
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const read = (dist: string, ...path: string[]) =>
  readFileSync(join(dist, ...path), "utf8");

describe("which pages", () => {
  test("every static route in every language that is open for static pages, but the blog", () => {
    expect(pagesToPrerender().map(({ url }) => url)).toEqual(
      LIVE.static.flatMap((locale) =>
        ["/", "/about", "/portfolio", "/contact", "/privacy"].map((path) =>
          locale === "en"
            ? path
            : path === "/"
              ? `/${locale}`
              : `/${locale}${path}`,
        ),
      ),
    );
  });

  test("once the TR pages open, the same list doubles with /tr and /tr/<page>", () => {
    expect(pagesToPrerender(ALL_LIVE).map(({ url }) => url)).toEqual([
      "/",
      "/about",
      "/portfolio",
      "/contact",
      "/privacy",
      "/tr",
      "/tr/about",
      "/tr/portfolio",
      "/tr/contact",
      "/tr/privacy",
    ]);
  });

  test("a page's URL is its directory: / -> index.html, /tr -> tr/index.html, /tr/about -> tr/about/index.html", () => {
    expect(fileForUrl("/d", "/")).toBe("/d/index.html");
    expect(fileForUrl("/d", "/about")).toBe("/d/about/index.html");
    expect(fileForUrl("/d", "/tr")).toBe("/d/tr/index.html");
    expect(fileForUrl("/d", "/tr/about")).toBe("/d/tr/about/index.html");
  });
});

describe("the written pages", () => {
  let dist: string;
  let written: Awaited<ReturnType<typeof prerender>>;
  beforeAll(async () => {
    dist = freshDist();
    written = await prerender(dist, render);
  });

  test("one file per page, and nothing else is touched", () => {
    expect(written.map(({ url }) => url)).toEqual(
      pagesToPrerender().map(({ url }) => url),
    );
    for (const { file } of written) expect(existsSync(file)).toBe(true);
    expect(existsSync(join(dist, "blog", "index.html"))).toBe(false);
    expect(existsSync(join(dist, "assets", "app-3f9a1c.js"))).toBe(true);
  });

  test("the untouched shell is kept where the server finds it, and is still the bare shell", () => {
    const shell = read(dist, "server", SHELL_FILE);
    expect(shell).toContain('<div id="root"></div>');
    expect(shell).toContain("<title>Fixture shell</title>");
  });

  test.each(["/", "/about", "/portfolio", "/contact"])(
    "%s: lang, one title, one h1, data-ssr, the head from the page registry",
    (url) => {
      const html = readFileSync(
        written.find((page) => page.url === url)!.file,
        "utf8",
      );
      expect(html).toContain('<html lang="en">');
      expect(count(html, /<title\b/g)).toBe(1);
      expect(html).not.toContain("Fixture shell");
      expect(count(html, /<h1\b/g)).toBe(1);
      expect(html).toContain('<div id="root" data-ssr>');
      // The server cannot know the visitor's theme: <html> carries no
      // data-theme (the head script sets it, the toggle follows after
      // hydration), and the shell's static theme script is untouched.
      expect(/<html\b[^>]*data-theme/.test(html)).toBe(false);
      expect(html).toContain("<title data-seo>");
      expect(html).toContain('rel="canonical"');
      expect(html).toContain('property="og:title"');
      expect(html).not.toContain("Loading...");
      // The module script of the shell survives, and no other script runs.
      const executable = [...html.matchAll(/<script\b([^>]*)>/g)].filter(
        ([, attrs]) => !/type="application\/(?:ld\+)?json"/.test(attrs),
      );
      expect(executable).toHaveLength(1);
    },
  );

  test("the home page carries the hero preload once, in the head; the other pages carry none", () => {
    const counts = Object.fromEntries(
      written.map(({ url, file }) => [
        url,
        count(readFileSync(file, "utf8"), /<link rel="preload" as="image"/g),
      ]),
    );
    expect(counts).toEqual({
      "/": 1,
      "/about": 0,
      "/portfolio": 0,
      "/contact": 0,
      "/privacy": 0,
    });
  });

  test("the titles differ from page to page", () => {
    const titles = written.map(
      ({ file }) =>
        /<title[^>]*>([^<]*)<\/title>/.exec(readFileSync(file, "utf8"))![1],
    );
    expect(new Set(titles).size).toBe(titles.length);
  });

  test("running it again on the same dist gives the same files (it reads the kept shell, not the home page)", async () => {
    const before = read(dist, "about", "index.html");
    await prerender(dist, render);
    expect(read(dist, "about", "index.html")).toBe(before);
    expect(read(dist, "server", SHELL_FILE)).toContain('<div id="root"></div>');
  });
});

describe("a page that would ship broken fails the build", () => {
  test("a render that returns nothing: no h1, no data-ssr marker", async () => {
    const dist = freshDist();
    await expect(prerender(dist, async () => ({ html: "" }))).rejects.toThrow(
      /no <h1>[\s\S]*#root has no data-ssr marker/,
    );
    // Nothing was written for it.
    expect(existsSync(join(dist, "about", "index.html"))).toBe(false);
  });

  test("a render that throws names the page", async () => {
    const dist = freshDist();
    await expect(
      prerender(dist, async (url) => {
        if (url === "/about") throw new Error("boom");
        return render(url);
      }),
    ).rejects.toThrow("/about: boom");
  });

  test("a client build is required", async () => {
    const dist = mkdtempSync(join(tmpdir(), "prerender-empty-"));
    dirs.push(dist);
    await expect(prerender(dist, render)).rejects.toThrow("run vite build");
  });

  test("validatePage names every problem", () => {
    const good =
      '<html lang="en"><head><title>x</title></head><body><div id="root" data-ssr><h1>x</h1></div></body></html>';
    expect(validatePage(good, "en")).toEqual([]);
    expect(validatePage(good, "tr")).toEqual(['<html lang> is not "tr"']);
    expect(
      validatePage(good.replace("<h1>x</h1>", "Loading..."), "en"),
    ).toEqual(["no <h1>", '"Loading..." placeholder']);
    expect(
      validatePage(good.replace("</head>", "<title>y</title></head>"), "en"),
    ).toEqual(["2 <title> elements (expected 1)"]);
    expect(validatePage(good.replace(" data-ssr", ""), "en")).toEqual([
      "#root has no data-ssr marker",
    ]);
    expect(
      validatePage(
        good.replace("<h1>x</h1>", "<h1>x</h1><script>$RC()</script>"),
        "en",
      ),
    ).toEqual(["a script inside the body (the CSP would block it)"]);
    // The data block is JSON, not code.
    expect(
      validatePage(
        good.replace(
          "</body>",
          '<script id="__SEO_DATA__" type="application/json">{}</script></body>',
        ),
        "en",
      ),
    ).toEqual([]);
  });
});
