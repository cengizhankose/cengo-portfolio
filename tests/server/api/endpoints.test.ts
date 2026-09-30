// BE-17 test matrix: every endpoint has a happy path and an error path, run
// through createApp().request() (no port, no database; T-02). Test names carry
// the matrix row, so the row -> test mapping is the test list itself.
//
// Rows owned by later packages are tested there: `?lang`, cursor and the
// card-field diet of GET /api/posts (BE-05/BE-07, W4 tests/server/posts/),
// "unknown route -> 404 + noindex" (SEO-02, W3 tests/server/seo/). The real
// published filter (drafts) runs against PGlite in
// tests/server/security/posts-read.test.ts and tests/server/db/queries-posts.test.ts.
import { describe, expect, test } from "bun:test";
import { createApp } from "../../../src/api/app";
import {
  captureLogs,
  failingQueries,
  fakeQueries,
  FIXTURE_DIST,
  SAMPLE_POST,
  silenceLogs,
  UUID,
} from "../helpers";

silenceLogs();

const site = (queries = fakeQueries()) =>
  createApp({ queries, serveSpa: true, distDir: FIXTURE_DIST });

async function expectEnvelope(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get("content-type")).toStartWith("application/json");
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("x-request-id")).toMatch(UUID);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.code).toBe(code);
  expect(typeof body.error).toBe("string");
  expect(Object.keys(body).sort()).toEqual(["code", "error"]);
  return body;
}

describe("row 1: GET /health", () => {
  test("happy: 200 {status:'ok'}, no-store", async () => {
    const res = await site().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("error: every query throws (DB down) -> still 200, liveness never asks the DB", async () => {
    const res = await site(failingQueries()).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("row 2: GET /ready (BE-20)", () => {
  test("happy: 200 status ready, db ok", async () => {
    const res = await site().request("/ready");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ready", db: "ok" });
  });

  test("error: ping throws -> 503 db error", async () => {
    const { result: res } = await captureLogs(() =>
      site(failingQueries()).request("/ready"),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "not_ready", db: "error" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("row 3: GET /api/posts", () => {
  test("happy: 200 JSON array from the injected list query", async () => {
    const res = await site().request("/api/posts");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("application/json");
    const body = (await res.json()) as Record<string, unknown>[];
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ slug: SAMPLE_POST.slug, lang: "en" });
    expect(body[0]).not.toHaveProperty("translations");
  });

  test("error: the query throws -> 500 INTERNAL envelope, no internals leaked", async () => {
    const secret = "connect ECONNREFUSED db.internal.invalid:5432";
    const { result: res, lines } = await captureLogs(() =>
      site(failingQueries(new Error(secret))).request("/api/posts"),
    );
    const body = await expectEnvelope(res, 500, "INTERNAL");
    expect(JSON.stringify(body)).not.toContain("db.internal.invalid");
    // The details go to the log line with the same request id, not the client.
    expect(lines.some((l) => l.reqId === res.headers.get("x-request-id"))).toBe(
      true,
    );
  });
});

describe("row 4: GET /api/posts/:slug", () => {
  test("happy: 200 with lang and translations (T-12)", async () => {
    const res = await site().request(`/api/posts/${SAMPLE_POST.slug}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      slug: SAMPLE_POST.slug,
      lang: "en",
      translationKey: "hello-world",
      translations: [{ lang: "tr", slug: "merhaba-dunya" }],
    });
  });

  test.each([
    ["unknown slug", "/api/posts/no-such-post"],
    [
      "draft (the query returns null for unpublished rows)",
      "/api/posts/taslak-ornek",
    ],
    ["slug outside the slug pattern", "/api/posts/..%2f..%2fetc%2fpasswd"],
  ])("error: %s -> 404 NOT_FOUND", async (_name, path) => {
    await expectEnvelope(await site().request(path), 404, "NOT_FOUND");
  });

  test("error: the query throws -> 500 INTERNAL", async () => {
    const { result: res } = await captureLogs(() =>
      site(failingQueries()).request(`/api/posts/${SAMPLE_POST.slug}`),
    );
    await expectEnvelope(res, 500, "INTERNAL");
  });
});

describe("row 5: writes on /api/posts (K-01 = A: no write routes)", () => {
  test.each([
    ["POST", "/api/posts"],
    ["PUT", `/api/posts/${SAMPLE_POST.slug}`],
    ["PATCH", `/api/posts/${SAMPLE_POST.slug}`],
    ["DELETE", `/api/posts/${SAMPLE_POST.slug}`],
  ])(
    "error: %s %s -> 404 JSON envelope, the query object is never called",
    async (method, path) => {
      let called = false;
      const spy = fakeQueries({
        getPublishedPostBySlug: async () => {
          called = true;
          return null;
        },
        listPublishedPosts: async () => {
          called = true;
          return [];
        },
      });
      const res = await site(spy).request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "x" }),
      });
      await expectEnvelope(res, 404, "NOT_FOUND");
      expect(called).toBe(false);
    },
  );
});

describe("row 6: unknown /api/*", () => {
  test.each(["/api", "/api/", "/api/unknown", "/api/posts/a/b"])(
    "error: GET %s -> 404 JSON envelope, never the SPA shell",
    async (path) => {
      await expectEnvelope(await site().request(path), 404, "NOT_FOUND");
    },
  );
});

describe("row 7: site handler (T-11: BE-12/BE-22/BE-23)", () => {
  test("happy: known route / -> 200 HTML shell, revalidated (no-cache)", async () => {
    const res = await site().request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/html");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  test("happy: /robots.txt -> 200 text/plain", async () => {
    const res = await site().request("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/plain");
  });

  test("happy: hashed asset -> 200 immutable", async () => {
    const res = await site().request("/assets/app-3f9a1c.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  test.each(["/assets/yok.js", "/nope.png"])(
    "error: missing file %s -> 404 no-store, not the shell",
    async (path) => {
      const res = await site().request(path);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("content-type")).not.toStartWith("text/html");
    },
  );
});
