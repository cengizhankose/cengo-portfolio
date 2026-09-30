// SEC-05 / SEC-20 / BE-02 (K-01 = A): the public API is read-only. No write
// route, no API key, no secret comparison anywhere in the runtime code.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { Hono } from "hono";
import { posts } from "../../../src/db/schema";
import { createPostQueries } from "../../../src/db/queries/posts";
import { createTestDb, REPO_ROOT } from "../db/pglite";

// The default router builds a postgres.js client on import; it never connects
// unless a route queries it. Aim it at a closed local port regardless.
process.env.PG_CONNECTION_URL = "postgres://test@127.0.0.1:1/portfolio_test";
const { default: postsRouter, createPostsRouter } =
  await import("../../../src/api/routes/posts");

const WRITE_REQUESTS: [method: string, path: string][] = [
  ["POST", "/api/posts"],
  ["PUT", "/api/posts/1"],
  ["PATCH", "/api/posts/1"],
  ["DELETE", "/api/posts/1"],
  ["POST", "/api/posts/some-slug"],
  ["DELETE", "/api/posts/some-slug"],
];

function writeRequest(app: Hono, method: string, path: string) {
  return app.request(path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-api-key": "your-secret-key",
    },
    body: JSON.stringify({
      slug: "pwned",
      title: "x",
      content: "<script>alert(1)</script>",
      published: true,
    }),
  });
}

describe("mounted production router (as in server.ts / src/api/index.ts)", () => {
  const app = new Hono().route("/api/posts", postsRouter);

  test.each(WRITE_REQUESTS)(
    "%s %s with the old fallback key -> 404",
    async (method, path) => {
      const res = await writeRequest(app, method, path);
      expect(res.status).toBe(404);
    },
  );
});

describe("router factory against Postgres (PGlite)", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Hono;

  beforeAll(async () => {
    ctx = await createTestDb();
    await ctx.db.insert(posts).values({
      slug: "hello",
      lang: "tr",
      title: "Hello",
      content: "body",
      published: true,
    });
    app = new Hono().route(
      "/api/posts",
      createPostsRouter(createPostQueries(ctx.db)),
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  test("GET /api/posts -> 200", async () => {
    const res = await app.request("/api/posts");
    expect(res.status).toBe(200);
    expect(((await res.json()) as unknown[]).length).toBe(1);
  });

  test.each(WRITE_REQUESTS)(
    "%s %s -> 404 and the database is unchanged",
    async (method, path) => {
      const res = await writeRequest(app, method, path);
      expect(res.status).toBe(404);
      const rows = await ctx.db.select().from(posts);
      expect(rows.map((r) => r.slug)).toEqual(["hello"]);
    },
  );
});

describe("no auth / secret-comparison surface left in runtime code", () => {
  test("src/api/middleware/auth.ts is gone", () => {
    expect(existsSync(join(REPO_ROOT, "src/api/middleware/auth.ts"))).toBe(
      false,
    );
  });

  test("no API key, fallback key or plain key comparison in server.ts, src/ or scripts/", async () => {
    const forbidden =
      /authMiddleware|your-secret-key|BLOG_API_KEY|x-api-key|!== API_KEY/;
    const hits: string[] = [];
    for (const pattern of [
      "src/**/*.{ts,tsx,js,jsx}",
      "scripts/**/*.{ts,js}",
      "server.ts",
    ]) {
      for await (const file of new Glob(pattern).scan({ cwd: REPO_ROOT })) {
        if (forbidden.test(await Bun.file(join(REPO_ROOT, file)).text()))
          hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });

  test("posts router registers no write handlers", async () => {
    const source = await Bun.file(
      join(REPO_ROOT, "src/api/routes/posts.ts"),
    ).text();
    expect(source).not.toMatch(/\.(post|put|patch|delete|all|on)\s*\(/);
  });

  // CLAUDE.md is not in the Docker build context (*.md excluded) -> skip there
  test.skipIf(!existsSync(join(REPO_ROOT, "CLAUDE.md")))(
    "CLAUDE.md documents the timing-safe comparison rule (SEC-20)",
    async () => {
      const doc = await Bun.file(join(REPO_ROOT, "CLAUDE.md")).text();
      expect(doc).toContain("timingSafeEqual");
    },
  );
});
