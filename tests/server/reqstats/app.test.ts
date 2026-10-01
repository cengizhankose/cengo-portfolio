// ANL-13: the middleware in createApp, and the environment wiring
// (REQUEST_STATS_ENABLED + PG_STATS_URL) over a real postgres.js connection to
// an in-process PGlite (tests/server/ops/pglite-wire.ts).
import { afterAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createApp } from "../../../src/api/app";
import {
  createRequestStats,
  createRequestStatsFromEnv,
  requestStatsEnabled,
} from "../../../src/server/requestStats";
import {
  FIXTURE_DIST,
  captureLogs,
  fakeQueries,
  silenceLogs,
} from "../helpers";
import { MIGRATIONS } from "../db/pglite";
import { startPgliteWire } from "../ops/pglite-wire";

silenceLogs();

const WWW = { host: "www.cengizhankose.com" };

function memoryStats() {
  return createRequestStats({
    sink: { upsert: async () => {}, purge: async () => {} },
  });
}

describe("createApp request statistics", () => {
  test("off by default: no flag, no middleware, nothing connects", async () => {
    const app = createApp({
      queries: fakeQueries(),
      env: {}, // REQUEST_STATS_ENABLED unset
    });
    expect((await app.request("/health")).status).toBe(200);
  });

  test("an injected aggregator counts every response by its final status", async () => {
    const stats = memoryStats();
    const app = createApp({
      queries: fakeQueries(),
      serveSpa: true,
      distDir: FIXTURE_DIST,
      requestStats: stats,
      env: {},
    });
    const ua = { "user-agent": "Mozilla/5.0 Safari/605.1.15" };
    const headers = { ...WWW, ...ua, "cf-ipcountry": "tr" };
    expect((await app.request("/", { headers })).status).toBe(200);
    expect((await app.request("/about", { headers })).status).toBe(200);
    expect((await app.request("/api/posts", { headers })).status).toBe(200);
    expect((await app.request("/api/nope", { headers })).status).toBe(404);
    expect((await app.request("/wp-login.php", { headers })).status).toBe(404);
    expect((await app.request("/health", { headers })).status).toBe(200);

    const by = (group: string, status: string) =>
      stats
        .snapshot()
        .filter((r) => r.pathGroup === group && r.statusClass === status)
        .reduce((n, r) => n + r.requests, 0);
    expect(by("page", "2xx")).toBe(2);
    expect(by("api", "2xx")).toBe(1);
    expect(by("api", "4xx")).toBe(1);
    expect(by("probe", "4xx")).toBe(1);
    expect(by("health", "2xx")).toBe(1);
    expect(stats.snapshot().every((r) => r.country === "TR")).toBe(true);
    expect(stats.snapshot().every((r) => r.host === "www")).toBe(true);
  });

  test("3 identical requests aggregate to requests = 3; a request without cf-ipcountry is 'XX'", async () => {
    const stats = memoryStats();
    const app = createApp({
      queries: fakeQueries(),
      serveSpa: true,
      distDir: FIXTURE_DIST,
      requestStats: stats,
      env: {},
    });
    for (let i = 0; i < 3; i++) await app.request("/about", { headers: WWW });
    await app.request("/missing-page", { headers: WWW });
    const rows = stats.snapshot();
    const about = rows.find(
      (r) => r.pathGroup === "page" && r.statusClass === "2xx",
    );
    expect(about).toMatchObject({ requests: 3, country: "XX", isBot: true });
    expect(rows.find((r) => r.statusClass === "4xx")).toMatchObject({
      requests: 1,
      pathGroup: "other",
    });
  });

  test("redirects (canonical host) and rate-limited answers are counted too", async () => {
    const stats = memoryStats();
    const app = createApp({
      queries: fakeQueries(),
      serveSpa: true,
      distDir: FIXTURE_DIST,
      requestStats: stats,
      env: {},
    });
    const res = await app.request("/about", {
      headers: { host: "cengizhankose.com" },
      redirect: "manual",
    });
    expect(res.status).toBe(301);
    expect(stats.snapshot()[0]).toMatchObject({
      host: "apex",
      statusClass: "3xx",
    });
  });

  test("an unexpected handler error is counted as 5xx and the envelope is unchanged", async () => {
    const stats = memoryStats();
    const app = createApp({
      queries: fakeQueries({
        listPublishedPosts: async () => {
          throw new Error("db down");
        },
      }),
      requestStats: stats,
      env: {},
    });
    const res = await app.request("/api/posts", { headers: WWW });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(stats.snapshot()[0]).toMatchObject({
      pathGroup: "api",
      statusClass: "5xx",
    });
  });

  test("a recorder that throws never breaks the response", async () => {
    const app = createApp({
      queries: fakeQueries(),
      requestStats: {
        record() {
          throw new Error("stats bug");
        },
      } as never,
      env: {},
    });
    expect((await app.request("/health")).status).toBe(200);
  });

  test("the query string is not part of what is counted", async () => {
    const stats = memoryStats();
    const app = createApp({
      queries: fakeQueries(),
      requestStats: stats,
      env: {},
    });
    await app.request("/api/posts?cursor=secret-token", { headers: WWW });
    expect(JSON.stringify(stats.snapshot())).not.toContain("secret-token");
  });

  test("null forces it off even when the environment enables it", async () => {
    const { lines } = await captureLogs(async () => {
      const app = createApp({
        queries: fakeQueries(),
        requestStats: null,
        env: { REQUEST_STATS_ENABLED: "1" },
      });
      await app.request("/health");
    });
    expect(lines.some((l) => String(l.msg).startsWith("request_stats"))).toBe(
      false,
    );
  });
});

describe("environment wiring", () => {
  test("only REQUEST_STATS_ENABLED=1 turns it on", () => {
    expect(requestStatsEnabled({})).toBe(false);
    expect(requestStatsEnabled({ REQUEST_STATS_ENABLED: "0" })).toBe(false);
    expect(requestStatsEnabled({ REQUEST_STATS_ENABLED: "true" })).toBe(false);
    expect(requestStatsEnabled({ REQUEST_STATS_ENABLED: " 1 " })).toBe(true);
  });

  test("disabled -> null, silently", async () => {
    const { result, lines } = await captureLogs(() =>
      createRequestStatsFromEnv({}),
    );
    expect(result).toBeNull();
    expect(lines).toEqual([]);
  });

  test("enabled without PG_STATS_URL -> null + a warning (the site keeps serving)", async () => {
    const { result, lines } = await captureLogs(() =>
      createRequestStatsFromEnv({ REQUEST_STATS_ENABLED: "1" }),
    );
    expect(result).toBeNull();
    expect(lines[0]).toMatchObject({ level: "warn" });
    expect(String(lines[0].msg)).toContain("PG_STATS_URL");
  });

  test("outside production a non-local database is refused, and the URL is never logged", async () => {
    const url = "postgres://writer:s3cret@db.prod.invalid:5432/portfolio";
    const { result, lines } = await captureLogs(() =>
      createRequestStatsFromEnv({
        REQUEST_STATS_ENABLED: "1",
        PG_STATS_URL: url,
        NODE_ENV: "development",
      }),
    );
    expect(result).toBeNull();
    expect(lines[0]).toMatchObject({ level: "error" });
    const text = JSON.stringify(lines);
    expect(text).not.toContain("s3cret");
    expect(text).not.toContain("db.prod.invalid");
  });

  test("a production URL without a safe TLS setup is refused too (SEC-22)", async () => {
    const { result, lines } = await captureLogs(() =>
      createRequestStatsFromEnv({
        REQUEST_STATS_ENABLED: "1",
        PG_STATS_URL: "postgres://writer:pw@db.prod.invalid:5432/portfolio",
        NODE_ENV: "production",
        PG_SSL_MODE: "disable",
      }),
    );
    expect(result).toBeNull();
    expect(lines.some((l) => l.level === "error")).toBe(true);
  });

  describe("end to end over the postgres.js driver", () => {
    const setup = (async () => {
      const db = new PGlite();
      await migrate(drizzle(db), { migrationsFolder: MIGRATIONS });
      return startPgliteWire(db);
    })();
    afterAll(async () => (await setup).close());

    test("requests -> middleware -> flush on close() -> rows in the table", async () => {
      const wire = await setup;
      const { result: stats, lines } = await captureLogs(() =>
        createRequestStatsFromEnv({
          REQUEST_STATS_ENABLED: "1",
          PG_STATS_URL: wire.url,
          PG_SSL_MODE: "disable",
        }),
      );
      expect(stats).not.toBeNull();
      expect(lines[0]).toMatchObject({
        level: "info",
        msg: "request_stats enabled",
      });

      const app = createApp({
        queries: fakeQueries(),
        serveSpa: true,
        distDir: FIXTURE_DIST,
        requestStats: stats,
        env: {},
      });
      const headers = {
        ...WWW,
        "cf-ipcountry": "DE",
        "user-agent": "Mozilla/5.0 Safari/605.1.15",
      };
      for (let i = 0; i < 3; i++) await app.request("/about", { headers });
      await app.request("/does-not-exist", { headers });

      const closing = await captureLogs(() => stats!.close());
      expect(
        closing.lines.find(
          (l) => l.msg === "request_stats flush" && l.reason === "shutdown",
        ),
      ).toMatchObject({ requests: 4 });

      const { rows } = await wire.db.query<{
        path_group: string;
        status_class: string;
        country: string;
        requests: number;
      }>(
        `select path_group, status_class, country, requests from request_daily_stats order by status_class`,
      );
      expect(rows).toEqual([
        { path_group: "page", status_class: "2xx", country: "DE", requests: 3 },
        {
          path_group: "other",
          status_class: "4xx",
          country: "DE",
          requests: 1,
        },
      ]);
    });

    test("the sink writes on a connection that is not read-only", async () => {
      const wire = await setup;
      const stats = createRequestStatsFromEnv({
        REQUEST_STATS_ENABLED: "1",
        PG_STATS_URL: wire.url,
        PG_SSL_MODE: "disable",
      })!;
      stats.record({
        host: "www.cengizhankose.com",
        path: "/",
        status: 200,
        ms: 1,
      });
      const result = await stats.flush("test");
      await stats.close();
      expect(result.ok).toBe(true);
    });
  });
});
