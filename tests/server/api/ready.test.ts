// BE-20: /ready pings the database and reports build info; /health stays
// constant; both no-store. Build info comes from build-info.json + env.
import { afterAll, beforeAll, describe, expect, jest, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../../src/api/app";
import { readBuildInfo } from "../../../src/api/build-info";
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

  // Fake timers: the real 2 s budget, without spending 2 s of wall clock (BE-17 speed).
  test("a database that never answers -> 503 once the 2 s budget runs out", async () => {
    expect(PING_TIMEOUT_MS).toBe(2000);
    const hanging = {
      execute: () => new Promise(() => {}),
    } as unknown as PostsDb;
    const app = createApp({ queries: createPostQueries(hanging) });
    jest.useFakeTimers();
    try {
      let settled = false;
      const pending = captureLogs(() => app.request("/ready")).then((r) => {
        settled = true;
        return r;
      });
      // Let the handler reach the ping and arm its timer.
      for (let i = 0; i < 50 && jest.getTimerCount() === 0; i++)
        await Promise.resolve();
      expect(jest.getTimerCount()).toBe(1);
      jest.advanceTimersByTime(PING_TIMEOUT_MS - 1);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      expect(settled).toBe(false);
      jest.advanceTimersByTime(1);
      const { result: res } = await pending;
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ status: "not_ready", db: "error" });
    } finally {
      jest.useRealTimers();
    }
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
