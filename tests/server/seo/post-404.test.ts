/**
 * Post routes checked against the database (SEO-08, SEO-11 Adım A server
 * half). mountSite gets the real query module on PGlite (production schema,
 * published filter) plus a throwing stub:
 *   published, own language  -> 200 shell
 *   other language           -> 301 to that language's path (T-12)
 *   missing or draft slug    -> 404 + noindex, title in the URL's language
 *   lookup error             -> 503 + Retry-After, no noindex
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { join } from "node:path";
import { createPostQueries } from "../../../src/db/queries/posts";
import { posts } from "../../../src/db/schema";
import { mountSite } from "../../../src/server/static";
import { createStrictTestDb } from "../db/pglite";

const DIST = join(import.meta.dir, "..", "fixtures", "dist");

let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;
let app: Hono;

beforeAll(async () => {
  ctx = await createStrictTestDb();
  await ctx.db.insert(posts).values([
    {
      slug: "hello-world",
      title: "Hello world",
      content: "EN body",
      lang: "en",
      translationKey: "hello-world",
      published: true,
    },
    {
      slug: "merhaba-dunya",
      title: "Merhaba dünya",
      content: "TR body",
      lang: "tr",
      translationKey: "hello-world",
      published: true,
    },
    {
      slug: "sadece-turkce",
      title: "Sadece Türkçe",
      content: "TR only",
      lang: "tr",
      published: true,
    },
    {
      slug: "taslak-ornek",
      title: "Taslak",
      content: "draft",
      lang: "tr",
      published: false,
    },
  ]);
  app = new Hono();
  mountSite(app, { distDir: DIST, queries: createPostQueries(ctx.db) });
});

afterAll(async () => {
  await ctx?.close();
});

const get = (path: string, init?: RequestInit) => app.request(path, init);

async function expectPostNotFound(res: Response, lang: "en" | "tr") {
  expect(res.status).toBe(404);
  expect(res.headers.get("x-robots-tag")).toBe("noindex");
  expect(res.headers.get("cache-control")).toBe("no-store");
  const html = await res.text();
  expect(html).toContain('<meta name="robots" content="noindex" data-seo>');
  expect(html).toContain(`<html lang="${lang}">`);
  expect(html).toContain(
    lang === "tr"
      ? "<title data-seo>Yazı bulunamadı | Cengizhan Köse</title>"
      : "<title data-seo>Post not found | Cengizhan Köse</title>",
  );
}

describe("published posts in their own language -> 200", () => {
  test.each([
    "/blog/hello-world",
    "/tr/blog/merhaba-dunya",
    "/tr/blog/sadece-turkce",
  ])("%s", async (path) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/html");
    expect(res.headers.get("x-robots-tag")).toBeNull();
    const html = await res.text();
    expect(html).not.toContain("noindex");
    expect(html).toContain('<div id="root"></div>');
  });

  test("HEAD and If-None-Match work on a checked post", async () => {
    const res = await get("/blog/hello-world", { method: "HEAD" });
    expect(res.status).toBe(200);
    const etag = res.headers.get("etag")!;
    expect(
      (await get("/blog/hello-world", { headers: { "If-None-Match": etag } }))
        .status,
    ).toBe(304);
  });
});

describe("a post under the other language's prefix -> one 301 (SEO-11)", () => {
  test("TR post at /blog/<slug> -> /tr/blog/<slug>", async () => {
    const res = await get("/blog/merhaba-dunya");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/tr/blog/merhaba-dunya");
  });

  test("the live TR post's old URL moves the same way", async () => {
    // Stand-in for atlas-steward-laya-konustan-yarim-is-cikaran-sistem.
    const res = await get("/blog/sadece-turkce");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/tr/blog/sadece-turkce");
    const target = await get(res.headers.get("location")!);
    expect(target.status).toBe(200); // 1 redirect, then 200
  });

  test("EN post at /tr/blog/<slug> -> /blog/<slug>", async () => {
    const res = await get("/tr/blog/hello-world");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/blog/hello-world");
  });

  test("the query string is kept; the location is a local path", async () => {
    const res = await get("/blog/merhaba-dunya?utm_source=li", {
      headers: { Host: "evil.example" },
    });
    expect(res.headers.get("location")).toBe(
      "/tr/blog/merhaba-dunya?utm_source=li",
    );
  });

  test("a case variant is normalised first, then moved (two hops at most)", async () => {
    const first = await get("/blog/Merhaba-Dunya");
    expect(first.status).toBe(301);
    expect(first.headers.get("location")).toBe("/blog/merhaba-dunya");
    const second = await get(first.headers.get("location")!);
    expect(second.headers.get("location")).toBe("/tr/blog/merhaba-dunya");
  });
});

describe("missing or draft slug -> 404 + noindex (SEO-08)", () => {
  test("/blog/bu-yazi-yok-seo-audit-7f3 -> EN post-not-found", async () => {
    await expectPostNotFound(
      await get("/blog/bu-yazi-yok-seo-audit-7f3"),
      "en",
    );
  });

  test("/tr/blog/bu-yazi-yok-seo-audit-7f3 -> TR post-not-found", async () => {
    await expectPostNotFound(
      await get("/tr/blog/bu-yazi-yok-seo-audit-7f3"),
      "tr",
    );
  });

  test("a draft is indistinguishable from a missing slug, under both prefixes", async () => {
    await expectPostNotFound(await get("/tr/blog/taslak-ornek"), "tr");
    await expectPostNotFound(await get("/blog/taslak-ornek"), "en");
  });

  test("HEAD on a missing post -> 404", async () => {
    const res = await get("/blog/nope", { method: "HEAD" });
    expect(res.status).toBe(404);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });
});

describe("lookup error -> 503 + Retry-After, never 404 (SEO-08 risk)", () => {
  const failing = new Hono();
  mountSite(failing, {
    distDir: DIST,
    queries: {
      getPostForLocale: async () => {
        throw new Error("connection refused");
      },
    },
  });

  test("503, Retry-After 120, no-store, no noindex", async () => {
    const original = console.log;
    const lines: string[] = [];
    console.log = (line: unknown) => lines.push(String(line));
    let res: Response;
    try {
      res = await failing.request("/tr/blog/merhaba-dunya");
    } finally {
      console.log = original;
    }
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("120");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBeNull();
    const html = await res.text();
    expect(html).not.toContain("noindex");
    expect(html).toContain('<div id="root"></div>');

    // One structured log line, without the query string.
    const entry = JSON.parse(
      lines.find((l) => l.includes("post lookup failed"))!,
    );
    expect(entry).toMatchObject({
      level: "error",
      msg: "post lookup failed",
      path: "/tr/blog/merhaba-dunya",
      err: "connection refused",
    });
  });

  test("static pages do not touch the database", async () => {
    expect((await failing.request("/about")).status).toBe(200);
    expect((await failing.request("/nope")).status).toBe(404);
  });
});

describe("without queries (tests, tools)", () => {
  test("post routes get the shell unchecked", async () => {
    const bare = new Hono();
    mountSite(bare, { distDir: DIST });
    expect((await bare.request("/blog/anything")).status).toBe(200);
    expect((await bare.request("/tr/blog/anything")).status).toBe(200);
  });
});
