/**
 * mountSite with the server render (PERF-03): the prerendered files the build
 * wrote, the pages drawn per request (the blog), the 404 pages, what is never
 * served from dist/, and what happens when there is no render or it fails.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { prerender } from "../../../scripts/prerender";
import { mountSite, type MountSiteOptions } from "../../../src/server/static";
import type { RenderPage } from "../../../src/server/ssr";
import { captureLogs, silenceLogs } from "../helpers";
import {
  count,
  EN_POST,
  fakeQueries,
  FIXTURE_DIST,
  makePost,
  render,
  rootOf,
} from "./helpers";

silenceLogs();

const dirs: string[] = [];
function copyDist(): string {
  const dist = mkdtempSync(join(tmpdir(), "static-ssr-"));
  dirs.push(dist);
  cpSync(FIXTURE_DIST, dist, { recursive: true });
  rmSync(join(dist, "server"), { recursive: true, force: true });
  rmSync(join(dist, "prerendered"), { recursive: true, force: true });
  return dist;
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function mount(distDir: string, options: Partial<MountSiteOptions> = {}) {
  const app = new Hono();
  mountSite(app, { distDir, queries: fakeQueries(), render, ...options });
  return app;
}
const text = async (app: Hono, path: string, init?: RequestInit) => {
  const res = await app.request(path, init);
  return { res, html: await res.text() };
};

// A dist as `bun run build` leaves it: client files, server bundle, prerender.
const built = copyDist();
mkdirSync(join(built, "server", "chunks"), { recursive: true });
writeFileSync(join(built, "server", "entry-server.js"), "// bundle");
mkdirSync(join(built, ".vite"), { recursive: true });
writeFileSync(
  join(built, ".vite", "ssr-manifest.json"),
  JSON.stringify({
    "src/pages/blog/BlogHome.jsx": ["/assets/BlogHome-h0me.js"],
    "src/pages/blog/BlogPost.jsx": ["/assets/BlogPost-p0st.js"],
    "src/pages/blog/style.css": [
      "/assets/style-st1.js",
      "/assets/style-st1.css",
    ],
    "src/pages/home/index.jsx": [],
  }),
);
await prerender(built, render);
const prerenderedFile = (...path: string[]) =>
  readFileSync(join(built, ...path), "utf8");

describe("prerendered pages are files", () => {
  const site = mount(built);

  test("/about, /portfolio and /contact are the written files: 200, no-cache, strong ETag, same bytes", async () => {
    for (const [path, file] of [
      ["/about", "about/index.html"],
      ["/portfolio", "portfolio/index.html"],
      ["/contact", "contact/index.html"],
    ] as const) {
      const { res, html } = await text(site, path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-cache");
      expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]+"$/);
      expect(html).toBe(prerenderedFile(...file.split("/")));
      expect(html).toContain('<div id="root" data-ssr>');
    }
  });

  test("a matching If-None-Match is a 304, HEAD has the length", async () => {
    const res = await site.request("/about");
    const etag = res.headers.get("etag")!;
    expect(
      (await site.request("/about", { headers: { "If-None-Match": etag } }))
        .status,
    ).toBe(304);
    const head = await site.request("/about", { method: "HEAD" });
    expect(head.headers.get("content-length")).toBe(
      String(new TextEncoder().encode(await res.text()).length),
    );
  });

  test("another spelling is one 301 to the canonical path, and so is the file name", async () => {
    for (const [from, to] of [
      ["/about/", "/about"],
      ["/About", "/about"],
      ["/about/index.html", "/about"],
      ["/index.html", "/"],
      ["/contact/index.html?a=1", "/contact?a=1"],
    ]) {
      const res = await site.request(from);
      expect(res.status, from).toBe(301);
      expect(res.headers.get("location"), from).toBe(to);
    }
  });

  test("they are served with injection off as well (they are files); the blog is then the plain shell", async () => {
    const off = mount(built, { seoInject: false });
    expect((await text(off, "/about")).html).toBe(
      prerenderedFile("about", "index.html"),
    );
    const blog = await text(off, "/blog");
    expect(blog.res.status).toBe(200);
    expect(blog.html).toContain('<div id="root"></div>');
    expect(blog.html).toContain("<title>Fixture shell</title>");
  });

  test("a page whose file is not a prerender (no data-ssr) is built per request", async () => {
    const plain = copyDist(); // the fixture's own index.html: the bare shell
    const { res, html } = await text(mount(plain), "/");
    expect(res.status).toBe(200);
    expect(html).toContain("introName");
    expect(html).toContain("<title data-seo>");
  });
});

describe("what dist/ never serves", () => {
  const site = mount(built);

  test.each([
    "/server/entry-server.js",
    "/server/_shell.html",
    "/server/chunks/x.js",
    "/server",
    "/server/",
    "/.vite/ssr-manifest.json",
  ])("%s -> 404", async (path) => {
    const res = await site.request(path);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("the pristine shell is not a page: /_shell.html is not a route either", async () => {
    expect((await site.request("/_shell.html")).status).toBe(404);
  });
});

describe("the blog is drawn per request into the pristine shell", () => {
  const site = mount(built);

  test("/blog: head of the blog, the render in #root marked data-ssr, the data block; not the home page", async () => {
    const { res, html } = await text(site, "/blog");
    expect(res.status).toBe(200);
    expect(html).toContain("<title data-seo>Blog");
    expect(html).not.toContain("introName");
    expect(html).toContain('<div id="root" data-ssr>');
    expect(count(rootOf(html), /<h1\b/g)).toBe(1);
    expect(html).toContain('<script id="__SEO_DATA__"');
    expect(count(html, /<title\b/g)).toBe(1);
  });

  test("a post: its article, lang, canonical, the swr data under its key", async () => {
    const { res, html } = await text(site, "/blog/hello-world");
    expect(res.status).toBe(200);
    expect(html).toContain('<article class="blog-post" lang="en">');
    expect(html).toContain('"/api/posts/hello-world"');
  });

  test("the lazy page chunks are named in the head (from the ssr manifest), the one the page needs only", async () => {
    const blog = (await text(site, "/blog")).html;
    expect(blog).toContain(
      '<link rel="modulepreload" crossorigin href="/assets/BlogHome-h0me.js">',
    );
    expect(blog).toContain('href="/assets/style-st1.js"');
    expect(blog).not.toContain("BlogPost-p0st");
    const post = (await text(site, "/blog/hello-world")).html;
    expect(post).toContain('href="/assets/BlogPost-p0st.js"');
    expect(post).not.toContain("BlogHome-h0me");
    // A page that is not lazy gets none.
    expect(prerenderedFile("about", "index.html")).not.toContain(
      'modulepreload" crossorigin href="/assets/Blog',
    );
  });

  test("the render is given the data exactly as the browser will read it back (a JSON round trip)", async () => {
    const seen: unknown[] = [];
    const spy: RenderPage = async (url, options) => {
      seen.push({ url, options });
      return { html: "<h1>x</h1>" };
    };
    const app = mount(built, { render: spy });
    const { html } = await text(app, "/blog/hello-world");
    expect(seen).toHaveLength(1);
    const { url, options } = seen[0] as { url: string; options: any };
    expect(url).toBe("/blog/hello-world");
    const post = options.fallback["/api/posts/hello-world"];
    expect(post.createdAt).toBe("2026-09-30T10:00:00.000Z"); // a string, not a Date
    const block = JSON.parse(
      />({"\/api\/posts\/hello-world".*})<\/script><\/body>/.exec(html)![1],
    );
    expect(options.fallback).toEqual(block);
  });
});

// SEO-17 RAW: the home page's latest-writing block reads the posts, which live
// in the database, so the build's file cannot hold it. The server draws the
// home page like the blog index and the block's links are in the raw HTML.
describe("the home page carries the latest posts in its raw HTML (SEO-17)", () => {
  const site = mount(built);
  const block = (html: string) =>
    /<section id="blog"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";

  test("/: the #blog block with a link to each post, drawn from the same data the page carries", async () => {
    const { res, html } = await text(site, "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(html).toContain('<div id="root" data-ssr>');
    expect(count(rootOf(html), /<h1\b/g)).toBe(1);
    // The prerendered file has no block; this response has it.
    expect(prerenderedFile("index.html")).not.toContain('id="blog"');
    const blog = block(html);
    expect(blog).toContain('href="/blog/hello-world"');
    expect(blog).toContain("Hello world");
    // A post that only exists in another language is listed after, with its own path.
    expect(blog).toContain('href="/tr/blog/sadece-turkce"');
    // Hydration reads these lists back under their API keys.
    const data = JSON.parse(
      /<script id="__SEO_DATA__" type="application\/json">(.*?)<\/script>/.exec(
        html,
      )![1],
    );
    expect(Object.keys(data)).toEqual([
      "/api/posts?lang=en",
      "/api/posts?lang=tr&missingIn=en",
    ]);
    // The rest of the page is the prerendered one: same head, same sections.
    expect(html).toContain("<title data-seo>");
    expect(count(html, /<title\b/g)).toBe(1);
  });

  test("/tr: the Turkish posts first, with Turkish links", async () => {
    const { res, html } = await text(site, "/tr");
    expect(res.status).toBe(200);
    const blog = block(html);
    expect(blog).toContain('href="/tr/blog/merhaba-dunya"');
    expect(blog).toContain('href="/tr/blog/sadece-turkce"');
    expect(html).toContain('<html lang="tr"');
  });

  test("the render is given the lists the browser will read back", async () => {
    const seen: any[] = [];
    const spy: RenderPage = async (url, options) => {
      seen.push({ url, options });
      return { html: "<h1>x</h1>" };
    };
    await text(mount(built, { render: spy }), "/");
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("/");
    expect(Object.keys(seen[0].options.fallback)).toEqual([
      "/api/posts?lang=en",
      "/api/posts?lang=tr&missingIn=en",
    ]);
    expect(seen[0].options.fallback["/api/posts?lang=en"][0].createdAt).toBe(
      "2026-09-30T10:00:00.000Z", // a string, as after the JSON block
    );
  });

  test("no posts yet: the block is not drawn and the page still answers", async () => {
    const app = mount(built, { queries: fakeQueries({ posts: [] }) });
    const { res, html } = await text(app, "/");
    expect(res.status).toBe(200);
    expect(html).toContain('<div id="root" data-ssr>');
    expect(html).not.toContain("/blog/hello-world");
  });

  test("a database that does not answer: the prerendered file, not an error", async () => {
    const failing = fakeQueries();
    failing.listPublishedPosts = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    const { result: out, lines } = await captureLogs(() =>
      text(mount(built, { queries: failing }), "/"),
    );
    expect(out.res.status).toBe(200);
    expect(out.html).toBe(prerenderedFile("index.html"));
    expect(lines.find((l) => l.msg === "home post list failed")).toMatchObject({
      level: "error",
    });
  });

  test("without listPublishedPosts or with injection off the home page is the file", async () => {
    const noList = mount(built, {
      queries: {
        getPostForLocale: fakeQueries().getPostForLocale,
      },
    });
    expect((await text(noList, "/")).html).toBe(prerenderedFile("index.html"));
    const off = mount(built, { seoInject: false });
    expect((await text(off, "/")).html).toBe(prerenderedFile("index.html"));
  });

  test("the pages that are files stay files", async () => {
    expect((await text(site, "/about")).html).toBe(
      prerenderedFile("about", "index.html"),
    );
  });
});

describe("the render of a page is kept by what it was made from", () => {
  test("the same post twice is drawn once; a changed post is drawn again", async () => {
    let calls = 0;
    const counting: RenderPage = async () => {
      calls += 1;
      return { html: "<h1>x</h1>" };
    };
    const posts = [EN_POST];
    const app = mount(built, {
      render: counting,
      queries: fakeQueries({ posts }),
    });
    await app.request("/blog/hello-world");
    await app.request("/blog/hello-world");
    expect(calls).toBe(1);
    posts[0] = makePost({ updatedAt: new Date("2026-10-01T10:00:00Z") });
    await app.request("/blog/hello-world");
    expect(calls).toBe(2);
    posts[0] = makePost({ content: "changed" });
    await app.request("/blog/hello-world");
    expect(calls).toBe(3);
  });

  test("concurrent requests for the same page share one render", async () => {
    let calls = 0;
    const slow: RenderPage = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { html: "<h1>x</h1>" };
    };
    const app = mount(built, { render: slow });
    await Promise.all(
      Array.from({ length: 5 }, () => app.request("/blog/hello-world")),
    );
    expect(calls).toBe(1);
  });
});

describe("404 pages", () => {
  test("a missing post is drawn by the app's own NotFound, told its request came back 404, and is not hydrated", async () => {
    const seen: { url: string; options: any }[] = [];
    const spy: RenderPage = async (url, options) => {
      seen.push({ url, options });
      return render(url, options);
    };
    const app = mount(built, { render: spy });
    const { res, html } = await text(app, "/blog/no-such-post");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(seen[0].url).toBe("/blog/not-found");
    expect(seen[0].options.errors).toEqual({ "/api/posts/not-found": 404 });
    expect(html).toContain("Post not found");
    expect(html).toContain('<div id="root">');
    expect(html).not.toContain("data-ssr");
    // One page per language is kept, not one per missing slug.
    await app.request("/blog/another-missing");
    expect(seen).toHaveLength(1);
  });

  test("an unknown path is the page 404 in the language of its prefix", async () => {
    const { res, html } = await text(mount(built), "/nope");
    expect(res.status).toBe(404);
    expect(html).toContain("Page not found");
    expect(html).not.toContain("data-ssr");
    expect(html).toContain('<meta name="robots" content="noindex" data-seo>');
  });
});

describe("no render, or one that fails", () => {
  test("no render at all: head tags and data, an empty #root the browser draws itself", async () => {
    const app = mount(built, { render: null });
    const { res, html } = await text(app, "/blog/hello-world");
    expect(res.status).toBe(200);
    expect(html).toContain("<title data-seo>Hello world");
    expect(html).toContain('<div id="root"></div>');
    expect(html).not.toContain("data-ssr");
    expect(html).toContain('<script id="__SEO_DATA__"');
    const notFound = await text(app, "/nope");
    expect(notFound.res.status).toBe(404);
    expect(notFound.html).toContain('<div id="root"></div>');
  });

  test("a render that throws is logged and the page is the same as with no render", async () => {
    const failing: RenderPage = async () => {
      throw new Error("render exploded");
    };
    const app = mount(built, { render: failing });
    const { result, lines } = await captureLogs(() =>
      text(app, "/blog/hello-world"),
    );
    expect(result.res.status).toBe(200);
    expect(result.html).toContain('<div id="root"></div>');
    expect(result.html).not.toContain("data-ssr");
    expect(
      lines.some(
        (line) =>
          line.msg === "page render failed" &&
          String(line.err ?? line.error ?? "").includes("render exploded"),
      ),
    ).toBe(true);
    // And the next request tries again (a failure is not cached).
    let calls = 0;
    const flaky: RenderPage = async () => {
      calls += 1;
      if (calls === 1) throw new Error("once");
      return { html: "<h1>ok</h1>" };
    };
    const retry = mount(built, { render: flaky });
    const first = (await text(retry, "/blog/hello-world")).html;
    const second = (await text(retry, "/blog/hello-world")).html;
    expect(first).toContain('<div id="root"></div>');
    expect(second).toContain('<div id="root" data-ssr><h1>ok</h1></div>');
  });
});

describe("the build's bundle is loaded from dist/server", () => {
  const withBundle = (source: string) => {
    const dist = copyDist();
    mkdirSync(join(dist, "server"));
    writeFileSync(join(dist, "server", "entry-server.js"), source);
    return dist;
  };

  test("its render() draws the blog pages", async () => {
    const dist = withBundle(
      "export const render = async (url) => ({ html: `<h1>bundle ${url}</h1>` });",
    );
    const { html } = await text(mount(dist, { render: undefined }), "/blog");
    expect(html).toContain(
      '<div id="root" data-ssr><h1>bundle /blog</h1></div>',
    );
  });

  test("a bundle that cannot be loaded is logged once and the site serves without a render", async () => {
    const dist = withBundle("throw new Error('bad bundle');");
    const { result, lines } = await captureLogs(async () => {
      const app = mount(dist, { render: undefined });
      return text(app, "/blog");
    });
    expect(result.res.status).toBe(200);
    expect(result.html).toContain('<div id="root"></div>');
    expect(
      lines.filter((line) => line.msg === "ssr bundle could not be loaded"),
    ).toHaveLength(1);
  });

  test("a bundle without render() is refused the same way", async () => {
    const dist = withBundle("export const other = 1;");
    const { result, lines } = await captureLogs(async () =>
      text(mount(dist, { render: undefined }), "/blog"),
    );
    expect(result.html).toContain('<div id="root"></div>');
    expect(lines.some((l) => l.msg === "ssr bundle could not be loaded")).toBe(
      true,
    );
  });

  test("with injection off nothing is loaded", async () => {
    const dist = withBundle("throw new Error('must not load');");
    const { lines } = await captureLogs(async () =>
      text(mount(dist, { render: undefined, seoInject: false }), "/blog"),
    );
    expect(lines.some((l) => l.msg === "ssr bundle could not be loaded")).toBe(
      false,
    );
  });
});
