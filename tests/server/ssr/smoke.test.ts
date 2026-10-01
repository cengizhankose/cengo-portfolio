/**
 * scripts/seo-smoke.ts (SEO-01 step 12): the post-deploy check. Run against an
 * in-process app (no port) and through the command line against a real server.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { createApp } from "../../../src/api/app";
import { runSmoke } from "../../../scripts/seo-smoke";
import { LIVE } from "../../../src/seo/routes.js";
import { captureLogs, silenceLogs } from "../helpers";
import { fakeQueries, FIXTURE_DIST, makePost } from "./helpers";

silenceLogs();

const REPO = join(import.meta.dir, "..", "..", "..");

// The fixture dist plus the blog chunk's stylesheet, as Vite writes it
// (assets/style-<hash>.css), so the pages can link it.
const DIST = mkdtempSync(join(tmpdir(), "seo-smoke-dist-"));
cpSync(FIXTURE_DIST, DIST, { recursive: true });
writeFileSync(
  join(DIST, "assets", "style-blog1.css"),
  ".blog-container{padding:80px 20px}.blog-post-container{padding:20px}",
);
// PERF-03: the build's dist/server/entry-server.js is the real server render;
// in the copy its stand-in (a relative re-export) points at the source by an
// absolute path, so the server loads it the way it loads the build's.
mkdirSync(join(DIST, "server"), { recursive: true });
writeFileSync(
  join(DIST, "server", "entry-server.js"),
  `export { render } from ${JSON.stringify(join(REPO, "src/entry-server.jsx"))};\n`,
);
afterAll(() => rmSync(DIST, { recursive: true }));
const BASE = "http://smoke.test";

const siteApp = (seoInject?: boolean) =>
  createApp({
    queries: fakeQueries(),
    serveSpa: true,
    distDir: DIST,
    env: { RATE_LIMIT_DISABLED: "1" },
  });

const viaApp =
  (app: {
    request: (
      input: string,
      init?: RequestInit,
    ) => Response | Promise<Response>;
  }) =>
  async (url: string, init?: RequestInit) =>
    app.request(url, init);

describe("runSmoke against the app", () => {
  test("passes on a site with the SEO layer on", async () => {
    const { ok, failures, lines } = await runSmoke(BASE, {
      fetch: viaApp(siteApp()),
      minWords: 5,
    });
    expect(failures).toEqual([]);
    expect(ok).toBe(true);
    expect(lines.at(-1)).toMatch(/^SEO smoke passed \(\d+ pages fetched\)$/);
  });

  test("it looked at the pages, the posts and the 404s", async () => {
    const { lines } = await runSmoke(BASE, {
      fetch: viaApp(siteApp()),
      minWords: 5,
    });
    const text = lines.join("\n");
    for (const path of [
      "/",
      "/about",
      "/portfolio",
      "/contact",
      "/blog",
      "/privacy",
      "/blog/hello-world",
      "/tr/blog/merhaba-dunya",
    ]) {
      expect(text).toContain(`${path} answers 200`);
    }
    expect(text).toContain("/seo-smoke-not-a-page-7f3 answers 404");
    expect(text).toContain("/tr/seo-smoke-not-a-page-7f3 answers 404");
    expect(text).toContain(
      "/blog/merhaba-dunya is one 301 to /tr/blog/merhaba-dunya",
    );
    expect(text).toContain(
      "/tr/blog/hello-world is one 301 to /blog/hello-world",
    );
    expect(text).toContain("the 7 en titles are all different");
    expect(text).toContain("/ has one hero image preload");
    expect(text).toContain(
      "/blog/hello-world <-> /tr/blog/merhaba-dunya hreflang is reciprocal",
    );
    expect(text).toContain(
      LIVE.static.includes("tr")
        ? "TR static pages are open"
        : "TR static pages are not open",
    );
  });

  test("fails, naming the checks, when the layer is off (plain shell)", async () => {
    const off = new Hono();
    const { mountSite } = await import("../../../src/server/static");
    const queries = fakeQueries();
    const api = createApp({ queries, env: { RATE_LIMIT_DISABLED: "1" } });
    off.route("/", api);
    mountSite(off, { distDir: DIST, queries, seoInject: false });
    const { ok, failures } = await runSmoke(BASE, {
      fetch: viaApp(off),
      minWords: 5,
    });
    expect(ok).toBe(false);
    expect(failures).toEqual(
      expect.arrayContaining([
        "/about has one meta description",
        "/about has a readable snapshot in #root",
        "/blog/hello-world has one canonical",
      ]),
    );
  });

  test("fails when a blog page does not link a stylesheet for its snapshot (layout shift)", async () => {
    // The plain fixture dist has no blog stylesheet, so nothing is linked.
    const app = createApp({
      queries: fakeQueries(),
      serveSpa: true,
      distDir: FIXTURE_DIST,
      env: { RATE_LIMIT_DISABLED: "1" },
    });
    const { failures } = await runSmoke(BASE, {
      fetch: viaApp(app),
      minWords: 5,
    });
    expect(failures).toEqual(
      expect.arrayContaining([
        "/blog links a stylesheet that styles its snapshot (.blog-container)",
        "/blog/hello-world links a stylesheet that styles its snapshot (.blog-post-container)",
      ]),
    );
  });

  test("fails when a page answers with an error", async () => {
    const broken = new Hono();
    broken.all("*", (c) => c.text("boom", 500));
    const { ok, failures } = await runSmoke(BASE, { fetch: viaApp(broken) });
    expect(ok).toBe(false);
    expect(failures).toContain("the API lists at least one post to check");
  });

  test("--post names one more post to check", async () => {
    // Long enough to meet the default threshold every found post must meet.
    const content = `${Array.from({ length: 150 }, (_, i) => `word${i}`).join(" ")}\n\n## Section\n\nText.`;
    const extra = makePost({
      id: 7,
      slug: "second-post",
      title: "Second post",
      translationKey: null,
      translations: [],
      content,
    });
    const app = createApp({
      queries: fakeQueries({
        posts: [
          makePost({ translationKey: null, translations: [], content }),
          extra,
        ],
      }),
      serveSpa: true,
      distDir: DIST,
      env: { RATE_LIMIT_DISABLED: "1" },
    });
    const { lines, ok } = await runSmoke(BASE, {
      fetch: viaApp(app),
      post: "second-post",
      minWords: 5,
    });
    expect(lines.join("\n")).toContain("/blog/second-post answers 200");
    expect(lines.filter((line) => line.startsWith("FAIL"))).toEqual([]);
    expect(ok).toBe(true);
    const missing = await runSmoke(BASE, {
      fetch: viaApp(app),
      post: "no-such-post",
      minWords: 5,
    });
    expect(missing.failures).toContain("--post no-such-post exists in the API");
  });

  test("an hreflang alternate that does not answer 200 fails the pair check", async () => {
    // hello-world lists a TR translation that is not published.
    const app = createApp({
      queries: fakeQueries({ posts: [makePost()] }),
      serveSpa: true,
      distDir: DIST,
      env: { RATE_LIMIT_DISABLED: "1" },
    });
    const { failures } = await runSmoke(BASE, {
      fetch: viaApp(app),
      minWords: 5,
    });
    expect(failures).toContain(
      "/blog/hello-world <-> /tr/blog/merhaba-dunya hreflang is reciprocal",
    );
  });

  test("--min-words is the threshold of the --post post; the other posts keep the default", async () => {
    const long = makePost({
      id: 8,
      slug: "long-post",
      title: "Long post",
      translationKey: null,
      translations: [],
      content: `${Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ")}\n\n## Section\n\nText.`,
    });
    const app = createApp({
      queries: fakeQueries({
        posts: [makePost({ translationKey: null, translations: [] }), long],
      }),
      serveSpa: true,
      distDir: DIST,
      env: { RATE_LIMIT_DISABLED: "1" },
    });
    // W8-SEO-blog-author-rss: every post page now carries the author box and
    // the footer (~100 words), so hello-world passes the default 100. The named
    // post's threshold must still apply to it alone: 2000 words fails only
    // long-post (about 400 words here), hello-world is not held to it.
    const named = await runSmoke(BASE, {
      fetch: viaApp(app),
      post: "long-post",
      minWords: 2000,
    });
    const failing = named.lines.filter((line) => line.startsWith("FAIL"));
    expect(failing).toHaveLength(1);
    expect(failing[0]).toMatch(
      /^FAIL \/blog\/long-post #root holds the article \(\d+ words\) \(need 2000\)$/,
    );
    const met = await runSmoke(BASE, {
      fetch: viaApp(app),
      post: "long-post",
      minWords: 250,
    });
    expect(met.failures).toEqual([]);
    const all = await runSmoke(BASE, { fetch: viaApp(app), minWords: 5 });
    expect(all.failures).toEqual([]);
  });

  test("a snapshot shorter than --min-words fails", async () => {
    const { ok, failures } = await runSmoke(BASE, {
      fetch: viaApp(siteApp()),
      minWords: 5000,
    });
    expect(ok).toBe(false);
    expect(failures.some((f) => f.includes("#root holds the article"))).toBe(
      true,
    );
  });
});

describe("the command line", () => {
  // Async spawn: the servers below run in this process, and a blocking spawn
  // would stop them from answering.
  async function run(...args: string[]) {
    const proc = Bun.spawn(
      [process.execPath, "run", "scripts/seo-smoke.ts", ...args],
      {
        cwd: REPO,
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode };
  }

  test("exit 0 with a report against a running server, 1 on a failing site, 2 without a URL", async () => {
    const good = Bun.serve({ port: 0, fetch: siteApp().fetch });
    const bad = Bun.serve({
      port: 0,
      fetch: (req) =>
        new URL(req.url).pathname.startsWith("/api/")
          ? Response.json([])
          : new Response("nope", { status: 500 }),
    });
    try {
      const { result } = await captureLogs(async () => ({
        ok: await run(`http://127.0.0.1:${good.port}`, "--min-words", "5"),
        failing: await run(`http://127.0.0.1:${bad.port}`),
        usage: await run(),
      }));
      expect(result.ok.stdout).toContain("SEO smoke passed");
      expect(result.ok.exitCode).toBe(0);
      expect(result.failing.exitCode).toBe(1);
      expect(result.failing.stdout).toContain("FAIL");
      expect(result.usage.exitCode).toBe(2);
      expect(result.usage.stderr).toContain("usage:");
    } finally {
      void good.stop(true);
      void bad.stop(true);
    }
  }, 60_000);
});
