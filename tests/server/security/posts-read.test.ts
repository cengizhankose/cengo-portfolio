// SEC-08 / BE-03: drafts are not readable by slug, and a draft is
// indistinguishable from a slug that never existed.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { posts } from "../../../src/db/schema";
import { createPostQueries } from "../../../src/db/queries/posts";
import { createTestDb } from "../db/pglite";

// Importing the router module constructs the default (postgres.js) client,
// which never connects until queried. Point it at a closed local port so
// nothing here can ever reach a real database.
process.env.PG_CONNECTION_URL = "postgres://test@127.0.0.1:1/portfolio_test";
const { createPostsRouter, NOT_FOUND_BODY } =
  await import("../../../src/api/routes/posts");

describe("GET /api/posts/:slug (published filter)", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let app: Hono;

  beforeAll(async () => {
    ctx = await createTestDb();
    await ctx.db.insert(posts).values([
      {
        slug: "sec08-published",
        lang: "tr",
        title: "Published",
        content: "visible",
        published: true,
      },
      {
        slug: "sec08-draft",
        lang: "tr",
        title: "Draft",
        content: "secret draft body",
        published: false,
      },
    ]);
    app = new Hono().route(
      "/api/posts",
      createPostsRouter(createPostQueries(ctx.db)),
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  test("published post -> 200", async () => {
    const res = await app.request("/api/posts/sec08-published");
    expect(res.status).toBe(200);
    expect((await res.json()).slug).toBe("sec08-published");
  });

  test("draft -> 404 with the T-01 envelope", async () => {
    const res = await app.request("/api/posts/sec08-draft");
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ error: "Not found", code: "NOT_FOUND" });
    expect(body).not.toContain("secret draft body");
  });

  test("draft and unknown slug responses are identical", async () => {
    const draft = await app.request("/api/posts/sec08-draft");
    const missing = await app.request("/api/posts/yok-boyle-bir-yazi");
    expect(draft.status).toBe(missing.status);
    expect(draft.headers.get("content-type")).toBe(
      missing.headers.get("content-type"),
    );
    expect(await draft.text()).toBe(await missing.text());
  });

  test("the list never contains drafts", async () => {
    const res = await app.request("/api/posts");
    expect(res.status).toBe(200);
    const list = (await res.json()) as { slug: string }[];
    expect(list.map((p) => p.slug)).toEqual(["sec08-published"]);
  });

  test("NOT_FOUND_BODY is the documented envelope", () => {
    expect(NOT_FOUND_BODY).toEqual({ error: "Not found", code: "NOT_FOUND" });
  });
});
