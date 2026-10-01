// BE-20: /ready pings the database and reports build info; /health stays
// constant; both no-store. Build info comes from build-info.json + env.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { createApp } from "../../../src/api/app";
import { readBuildInfo } from "../../../src/api/build-info";
import { readyHandler } from "../../../src/api/ready";
import type { AppEnv } from "../../../src/api/types";
import {
  createPostQueries,
  PING_TIMEOUT_MS,
  type PostsDb,
} from "../../../src/db/queries/posts";
import { REPO_ROOT, captureLogs, fakeQueries, inCheckout } from "../helpers";

const BUILD = { commit: "0123abc", buildTime: "2026-09-30T12:00:00.000Z" };

describe("/ready", () => {
  test("database up -> 200 ready with build info (BE-20 criterion 1)", async () => {
    const app = createApp({ queries: fakeQueries(), buildInfo: BUILD });
    const res = await app.request("/ready");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ready", db: "ok", ...BUILD });
    expect(body.buildTime.length).toBeGreaterThan(0);
    expect(typeof body.uptimeS).toBe("number");
  });

  test("Cache-Control: no-store, also on HEAD (BE-20 criterion 2)", async () => {
    const app = createApp({ queries: fakeQueries(), buildInfo: BUILD });
    for (const method of ["GET", "HEAD"]) {
      const res = await app.request("/ready", { method });
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  test("ping throws -> 503 db:error while /health stays 200 (BE-20 criterion 3)", async () => {
    const app = createApp({
      queries: fakeQueries({
        ping: async () => {
          throw new Error("connect ECONNREFUSED");
        },
      }),
    });
    const { result: ready, lines } = await captureLogs(() =>
      app.request("/ready"),
    );
    expect(ready.status).toBe(503);
    expect(ready.headers.get("cache-control")).toBe("no-store");
    expect(await ready.json()).toEqual({ status: "not_ready", db: "error" });
    expect(lines.find((l) => l.msg === "ready check failed")).toMatchObject({
      level: "warn",
      err: "connect ECONNREFUSED",
    });
    const health = await app.request("/health");
    expect(health.status).toBe(200);
  });

  // The 2 s budget without 2 s of wall clock (BE-17 speed) and without
  // bun:test's jest.advanceTimersByTime / getTimerCount: the builder gate runs
  // on the image's Bun (1.3.3), which does not have them. Two halves instead:
  // the real race with a short budget, then a hand-rolled clock that records
  // the budget /ready arms and fires it on demand.
  const hangingDb = () =>
    ({ execute: () => new Promise(() => {}) }) as unknown as PostsDb;

  test("ping() gives up once its budget runs out (real timer, short budget)", async () => {
    const started = performance.now();
    await expect(createPostQueries(hangingDb()).ping(25)).rejects.toThrow(
      "database ping timed out after 25 ms",
    );
    expect(performance.now() - started).toBeGreaterThanOrEqual(20);
  });

  test("a database that never answers -> 503 once the 2 s budget runs out", async () => {
    expect(PING_TIMEOUT_MS).toBe(2000);
    const app = createApp({ queries: createPostQueries(hangingDb()) });
    const armed: { ms: number | undefined; fire: () => void }[] = [];
    const realSetTimeout = globalThis.setTimeout;
    // Record instead of schedule; a long real timer stands in as the handle,
    // so the code's unref() and clearTimeout() work as usual.
    globalThis.setTimeout = ((fire: () => void, ms?: number) => {
      armed.push({ ms, fire });
      return realSetTimeout(() => {}, 60_000);
    }) as unknown as typeof setTimeout;
    let settled = false;
    let pending: ReturnType<typeof captureLogs<Response>> | undefined;
    try {
      pending = captureLogs(() => app.request("/ready")).then((r) => {
        settled = true;
        return r;
      });
      // Let the handler reach the ping and arm its timer (Bun.sleep does
      // not go through globalThis.setTimeout).
      for (let i = 0; i < 50 && armed.length === 0; i++) await Bun.sleep(0);
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    expect(armed.map((t) => t.ms)).toEqual([PING_TIMEOUT_MS]);
    await Bun.sleep(20);
    expect(settled).toBe(false); // nothing answers before the budget
    armed[0].fire(); // the 2 s are up
    const { result: res } = await pending;
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "not_ready", db: "error" });
  });

  test("shutting down -> 503 without touching the database (BE-21 step 3)", async () => {
    let pinged = false;
    const app = createApp({
      queries: fakeQueries({
        ping: async () => {
          pinged = true;
        },
      }),
      isShuttingDown: () => true,
    });
    const res = await app.request("/ready");
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("not_ready");
    expect(pinged).toBe(false);
  });

  test("without build info the fields are null, not missing", async () => {
    const body = await (
      await createApp({ queries: fakeQueries() }).request("/ready")
    ).json();
    expect(body).toMatchObject({ commit: null, buildTime: null });
  });
});

describe("readBuildInfo", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "build-info-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("reads what the Dockerfile writes", async () => {
    const file = join(dir, "a.json");
    await writeFile(file, '{"buildTime":"2026-09-30T12:34:56Z","commit":""}\n');
    expect(await readBuildInfo(file, {})).toEqual({
      commit: null,
      buildTime: "2026-09-30T12:34:56.000Z",
    });
  });

  test("a runtime commit variable wins; junk values are ignored", async () => {
    const file = join(dir, "b.json");
    await writeFile(file, '{"buildTime":"not a date","commit":"abcdef1"}');
    expect(await readBuildInfo(file, {})).toEqual({
      commit: "abcdef1",
      buildTime: null,
    });
    expect(
      (await readBuildInfo(file, { SOURCE_COMMIT: "FEDCBA9876543210" })).commit,
    ).toBe("fedcba9876543210");
    expect(
      (await readBuildInfo(file, { GIT_COMMIT: "$(rm -rf)" })).commit,
    ).toBe("abcdef1");
  });

  test("missing or malformed file -> nulls", async () => {
    expect(await readBuildInfo(join(dir, "missing.json"), {})).toEqual({
      commit: null,
      buildTime: null,
    });
    const bad = join(dir, "bad.json");
    await writeFile(bad, "{nope");
    expect(await readBuildInfo(bad, {})).toEqual({
      commit: null,
      buildTime: null,
    });
  });

  // The Docker build context has no Dockerfile (.dockerignore); runs locally and in CI.
  test.skipIf(!inCheckout("Dockerfile"))(
    "the Dockerfile writes build-info.json outside dist/ and ships it",
    async () => {
      const dockerfile = await Bun.file(join(REPO_ROOT, "Dockerfile")).text();
      expect(dockerfile).toMatch(
        /date -u \+%Y-%m-%dT%H:%M:%SZ.*> build-info\.json/s,
      );
      expect(dockerfile).toContain(
        "COPY --from=builder /app/build-info.json ./build-info.json",
      );
      expect(dockerfile).toContain('ARG GIT_COMMIT=""');
    },
  );
});

// W11 handoff: /ready is anonymous, so a flood must not reach the pool one
// `select 1` per request. Single-flight plus a short cache of the result.
describe("/ready single-flight and cache", () => {
  const BUILD = { commit: null, buildTime: null };
  const countingQueries = (
    ping: () => Promise<void>,
  ): { queries: ReturnType<typeof fakeQueries>; pings: () => number } => {
    let n = 0;
    return {
      queries: fakeQueries({
        ping: async () => {
          n++;
          await ping();
        },
      }),
      pings: () => n,
    };
  };

  test("concurrent calls share one ping", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { queries, pings } = countingQueries(() => gate);
    const app = createApp({ queries, buildInfo: BUILD });
    const calls = Array.from({ length: 50 }, () => app.request("/ready"));
    await Bun.sleep(5);
    expect(pings()).toBe(1); // 50 requests in flight, one connection used
    release();
    const responses = await Promise.all(calls);
    expect(responses.map((r) => r.status)).toEqual(Array(50).fill(200));
    expect(pings()).toBe(1);
  });

  test("a finished ping answers the next calls until the TTL runs out", async () => {
    let clock = 1_000;
    const { queries, pings } = countingQueries(async () => {});
    const handler = readyHandler({
      queries,
      buildInfo: BUILD,
      isShuttingDown: () => false,
      cacheTtlMs: 1500,
      now: () => clock,
    });
    const app = new Hono<AppEnv>();
    app.get("/ready", handler);
    await app.request("/ready");
    clock += 1499;
    await app.request("/ready");
    expect(pings()).toBe(1);
    clock += 1; // 1500 ms after the first answer: expired
    await app.request("/ready");
    expect(pings()).toBe(2);
  });

  test("a failure is kept for the TTL only, then the database is asked again", async () => {
    let clock = 1_000;
    let up = false;
    const { queries, pings } = countingQueries(async () => {
      if (!up) throw new Error("connect ECONNREFUSED");
    });
    const app = new Hono<AppEnv>();
    app.get(
      "/ready",
      readyHandler({
        queries,
        buildInfo: BUILD,
        isShuttingDown: () => false,
        cacheTtlMs: 1500,
        now: () => clock,
      }),
    );
    const { result: first, lines } = await captureLogs(() =>
      app.request("/ready"),
    );
    expect(first.status).toBe(503);
    clock += 500;
    const again = await app.request("/ready");
    expect(again.status).toBe(503);
    expect(pings()).toBe(1); // the failure answered from the cache
    expect(lines.filter((l) => l.msg === "ready check failed")).toHaveLength(1);

    up = true; // the database is back
    clock += 1000; // TTL over
    const recovered = await app.request("/ready");
    expect(recovered.status).toBe(200);
    expect(pings()).toBe(2);
  });

  test("a failed in-flight ping fails every waiting call and does not stick", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { queries, pings } = countingQueries(async () => {
      await gate;
      throw new Error("boom");
    });
    const app = createApp({ queries, buildInfo: BUILD });
    const { result: responses } = await captureLogs(async () => {
      const calls = Array.from({ length: 5 }, () => app.request("/ready"));
      await Bun.sleep(5);
      release();
      return Promise.all(calls);
    });
    const statuses = responses.map((r) => r.status);
    expect(statuses).toEqual(Array(5).fill(503));
    expect(pings()).toBe(1);
  });

  test("shutting down is checked before the cache", async () => {
    let down = false;
    const { queries, pings } = countingQueries(async () => {});
    const app = createApp({
      queries,
      buildInfo: BUILD,
      isShuttingDown: () => down,
    });
    expect((await app.request("/ready")).status).toBe(200);
    down = true;
    expect((await app.request("/ready")).status).toBe(503);
    expect(pings()).toBe(1);
  });
});
