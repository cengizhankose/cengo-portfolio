// BE-10 / T-01: one error envelope { error, code, issues? }, right status,
// Cache-Control: no-store, request id only in the X-Request-Id header.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { createApp } from "../../../src/api/app";
import {
  AppError,
  BadRequestError,
  errorHandler,
  NotFoundError,
  notFoundHandler,
} from "../../../src/api/errors";
import type { AppEnv } from "../../../src/api/types";
import { REPO_ROOT } from "../db/pglite";
import { captureLogs, fakeQueries } from "./fake-queries";

const SECRETISH = "connect ECONNREFUSED db.internal.invalid:5432 password=hunter2";

describe("unexpected errors -> 500 INTERNAL (BE-10 criterion 2)", () => {
  test("a throwing query object does not leak internals", async () => {
    const app = createApp({
      queries: fakeQueries({
        listPublishedPosts: async () => {
          throw new Error(SECRETISH);
        },
      }),
    });
    const { result: res } = await captureLogs(() => app.request("/api/posts"));
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-type")).toStartWith("application/json");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "Internal Server Error", code: "INTERNAL" });
    expect(text).not.toContain("stack");
    expect(text).not.toContain("    at ");
    expect(text).not.toContain("ECONNREFUSED");
    expect(text).not.toContain("hunter2");
  });
});

describe("the envelope itself (BE-10 criterion 3)", () => {
  const app = new Hono<AppEnv>();
  app.use("*", requestId({ limitLength: 0 }));
  app.get("/api/bad-param", () => {
    throw new BadRequestError("BAD_PARAM", "Invalid query parameter", [
      { path: "lang", message: "Expected 'en' | 'tr'" },
    ]);
  });
  app.get("/api/bad-cursor", () => {
    throw new BadRequestError("BAD_CURSOR", "Invalid cursor");
  });
  app.get("/api/http-400", () => {
    throw new HTTPException(400, { message: "Malformed" });
  });
  app.get("/api/http-429", () => {
    throw new HTTPException(429, {
      message: "Too many requests",
      res: new Response(null, { status: 429, headers: { "Retry-After": "30" } }),
    });
  });
  app.get("/api/http-418", () => {
    throw new HTTPException(418);
  });
  app.get("/api/http-503", () => {
    throw new HTTPException(503, { message: "internal detail: pool exhausted" });
  });
  app.get("/api/not-found", () => {
    throw new NotFoundError();
  });
  app.get("/api/custom", () => {
    throw new AppError(409, "SOMETHING", "Custom");
  });
  app.get("/page", () => {
    throw new Error("site boom");
  });
  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  const call = async (path: string) => {
    const { result } = await captureLogs(() => app.request(path));
    return result;
  };

  test("BadRequestError(BAD_PARAM) -> 400 with issues", async () => {
    const res = await call("/api/bad-param");
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "Invalid query parameter",
      code: "BAD_PARAM",
      issues: [{ path: "lang", message: "Expected 'en' | 'tr'" }],
    });
  });

  test("BadRequestError(BAD_CURSOR) -> 400 without issues", async () => {
    const res = await call("/api/bad-cursor");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid cursor", code: "BAD_CURSOR" });
  });

  test("HTTPException(400) -> 400 BAD_REQUEST", async () => {
    const res = await call("/api/http-400");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Malformed", code: "BAD_REQUEST" });
  });

  test("HTTPException(429) -> RATE_LIMITED and keeps Retry-After", async () => {
    const res = await call("/api/http-429");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(await res.json()).toEqual({ error: "Too many requests", code: "RATE_LIMITED" });
  });

  test("an unmapped status gets HTTP_<status>", async () => {
    const res = await call("/api/http-418");
    expect(res.status).toBe(418);
    expect((await res.json()).code).toBe("HTTP_418");
  });

  test("HTTPException 5xx keeps its status but never exposes its message", async () => {
    const { result: res, lines } = await captureLogs(() => app.request("/api/http-503"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Service Unavailable", code: "HTTP_503" });
    expect(lines.find((l) => l.msg === "unhandled")).toMatchObject({
      err: "internal detail: pool exhausted",
    });
  });

  test("NotFoundError and unknown API routes -> NOT_FOUND", async () => {
    for (const path of ["/api/not-found", "/api/nothing-here"]) {
      const res = await call(path);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found", code: "NOT_FOUND" });
    }
  });

  test("AppError carries its own status and code", async () => {
    const res = await call("/api/custom");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Custom", code: "SOMETHING" });
  });

  test("request id is a header, never a body field", async () => {
    const res = await call("/api/bad-cursor");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(Object.keys(await res.json())).toEqual(["error", "code"]);
  });

  test("site paths get plain text with the same status", async () => {
    const res = await call("/page");
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toStartWith("text/plain");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("Internal Server Error");
  });
});

describe("source rules (BE-10 criterion 4)", () => {
  async function grep(re: RegExp) {
    const hits: string[] = [];
    for await (const file of new Glob("src/api/**/*.ts").scan({ cwd: REPO_ROOT })) {
      const text = await Bun.file(join(REPO_ROOT, file)).text();
      if (re.test(text)) hits.push(file);
    }
    return hits;
  }

  test("no console.error in src/api (errors go through the JSON logger)", async () => {
    expect(await grep(/console\.error/)).toEqual([]);
  });

  test("codes the read-only API never produces are not defined", async () => {
    expect(await grep(/ValidationError|SLUG_CONFLICT|PAYLOAD_TOO_LARGE/)).toEqual([]);
  });

  test("no try/catch left in the posts router", async () => {
    const source = await Bun.file(join(REPO_ROOT, "src/api/routes/posts.ts")).text();
    expect(source).not.toMatch(/\btry\s*\{/);
  });
});
