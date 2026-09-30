// BE-11 (+ the W1 write-surface handoff): every unknown /api path, any
// method, is a JSON 404 in the T-01 envelope and never the SPA shell.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createApp } from "../../../src/api/app";
import { REPO_ROOT } from "../db/pglite";
import { fakeQueries } from "./fake-queries";

const DIST = join(REPO_ROOT, "tests/server/fixtures/dist");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Production shape: the site is mounted, so a miss here would otherwise get the shell.
const app = createApp({ queries: fakeQueries(), serveSpa: true, distDir: DIST });

async function expectJson404(res: Response) {
  expect(res.status).toBe(404);
  expect(res.headers.get("content-type")).toStartWith("application/json");
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("x-request-id")).toMatch(UUID);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body).toEqual({ error: "Not found", code: "NOT_FOUND" });
  expect(Object.keys(body).filter((k) => !["error", "code", "issues"].includes(k))).toEqual([]);
}

describe("unknown /api paths (BE-11 criterion 4)", () => {
  test.each([
    ["GET", "/api"],
    ["GET", "/api/"],
    ["GET", "/api/x"],
    ["GET", "/api/bu-yol-yok"],
    ["POST", "/api/bilinmeyen"],
    ["GET", "/api/posts/a/b"],
    ["GET", "/api/posts/..%2f..%2fetc%2fpasswd/extra"],
  ])("%s %s -> JSON 404", async (method, path) => {
    await expectJson404(await app.request(path, { method }));
  });

  test("HEAD /api/x -> 404 JSON headers, no body", async () => {
    const res = await app.request("/api/x", { method: "HEAD" });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toStartWith("application/json");
  });
});

describe("write requests (K-01 = A: no write routes) get the envelope too", () => {
  test.each([
    ["POST", "/api/posts"],
    ["PUT", "/api/posts/1"],
    ["PATCH", "/api/posts/1"],
    ["DELETE", "/api/posts/1"],
    ["POST", "/api/posts/some-slug"],
    ["DELETE", "/api/posts/some-slug"],
  ])("%s %s -> JSON 404", async (method, path) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", "x-api-key": "your-secret-key" },
      body: JSON.stringify({ slug: "pwned", title: "x", content: "<script>", published: true }),
    });
    await expectJson404(res);
  });
});

describe("the boundary is /api, not every path starting with those letters", () => {
  test("/apix is a site path (handled by the static layer, not the JSON 404)", async () => {
    const res = await app.request("/apix");
    expect(res.headers.get("content-type")).toStartWith("text/html");
  });
});

test("a draft or unknown slug uses the same envelope (SEC-08)", async () => {
  await expectJson404(await app.request("/api/posts/not-there"));
});
