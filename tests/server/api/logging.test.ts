// BE-08: one JSON line per request with reqId/method/path/status/durMs, the
// same id in X-Request-Id, errors logged with that id, nothing sensitive.
import { afterEach, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/api/app";
import { log } from "../../../src/api/log";
import { captureLogs, fakeQueries } from "./fake-queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const savedLevel = process.env.LOG_LEVEL;

afterEach(() => {
  if (savedLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = savedLevel;
});

describe("request log line", () => {
  test("has the agreed fields and the response's X-Request-Id", async () => {
    delete process.env.LOG_LEVEL;
    const app = createApp({ queries: fakeQueries() });
    const { result: res, lines } = await captureLogs(() => app.request("/api/posts"));
    const reqId = res.headers.get("x-request-id");
    expect(reqId).toMatch(UUID);
    const requestLines = lines.filter((l) => l.msg === "request");
    expect(requestLines).toHaveLength(1);
    const [line] = requestLines;
    expect(line).toMatchObject({
      level: "info",
      msg: "request",
      reqId,
      method: "GET",
      path: "/api/posts",
      status: 200,
    });
    expect(typeof line.durMs).toBe("number");
    expect(new Date(String(line.ts)).toISOString()).toBe(line.ts as string);
  });

  test("never logs the query string, IPs, cookies or API keys", async () => {
    delete process.env.LOG_LEVEL;
    const app = createApp({ queries: fakeQueries() });
    const { lines } = await captureLogs(() =>
      app.request("/api/posts?token=q-secret-value", {
        headers: {
          cookie: "session=cookie-secret-value",
          "x-api-key": "key-secret-value",
          "cf-connecting-ip": "203.0.113.7",
          "x-forwarded-for": "198.51.100.9",
        },
      }),
    );
    const dump = JSON.stringify(lines);
    for (const needle of [
      "q-secret-value",
      "cookie-secret-value",
      "key-secret-value",
      "203.0.113.7",
      "198.51.100.9",
      '"ip"',
      "x-api-key",
      "cookie",
    ])
      expect(dump).not.toContain(needle);
  });

  test("a client-sent X-Request-Id is ignored; the server generates its own", async () => {
    const app = createApp({ queries: fakeQueries() });
    const { result: res } = await captureLogs(() =>
      app.request("/api/posts", { headers: { "x-request-id": "forged-id" } }),
    );
    expect(res.headers.get("x-request-id")).toMatch(UUID);
  });

  test("health probes are debug-level (quiet by default)", async () => {
    const app = createApp({ queries: fakeQueries() });
    delete process.env.LOG_LEVEL;
    const quiet = await captureLogs(() => app.request("/health"));
    expect(quiet.lines.filter((l) => l.msg === "request")).toHaveLength(0);
    process.env.LOG_LEVEL = "debug";
    const verbose = await captureLogs(() => app.request("/ready"));
    expect(verbose.lines.filter((l) => l.msg === "request")).toEqual([
      expect.objectContaining({ level: "debug", path: "/ready", status: 200 }),
    ]);
  });
});

describe("unhandled errors (BE-08 criterion 5)", () => {
  test("logged once as 'unhandled' with the response's request id and a stack", async () => {
    delete process.env.LOG_LEVEL;
    const app = createApp({
      queries: fakeQueries({
        listPublishedPosts: async () => {
          throw new Error("query exploded");
        },
      }),
    });
    const { result: res, lines } = await captureLogs(() => app.request("/api/posts"));
    const reqId = res.headers.get("x-request-id");
    const unhandled = lines.filter((l) => l.msg === "unhandled");
    expect(unhandled).toHaveLength(1);
    expect(unhandled[0]).toMatchObject({
      level: "error",
      reqId,
      path: "/api/posts",
      err: "query exploded",
    });
    expect(String(unhandled[0].stack)).toContain("query exploded");
    // The request line carries the final status.
    expect(lines.find((l) => l.msg === "request")).toMatchObject({ reqId, status: 500 });
  });
});

describe("log()", () => {
  test("fields cannot overwrite ts, level or msg; undefined fields are dropped", async () => {
    delete process.env.LOG_LEVEL;
    const { lines } = await captureLogs(async () =>
      log("info", "hello", { level: "error", msg: "x", ts: "never", extra: 1, gone: undefined }),
    );
    expect(lines[0]).toMatchObject({ level: "info", msg: "hello", extra: 1 });
    expect(lines[0].ts).not.toBe("never");
    expect(lines[0]).not.toHaveProperty("gone");
  });

  test("LOG_LEVEL filters lower severities", async () => {
    process.env.LOG_LEVEL = "warn";
    const { lines } = await captureLogs(async () => {
      log("info", "dropped");
      log("warn", "kept");
    });
    expect(lines.map((l) => l.msg)).toEqual(["kept"]);
  });

  test("an unserialisable field keeps the event", async () => {
    delete process.env.LOG_LEVEL;
    const { lines } = await captureLogs(async () => log("info", "big", { n: 1n }));
    expect(lines[0]).toMatchObject({ msg: "big", logError: "unserialisable fields" });
  });
});
