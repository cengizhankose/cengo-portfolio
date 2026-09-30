// /api read rate limit (SEC-10 / BE-18, T-08): 60 requests per minute per
// client, token bucket, bounded memory, CF-Connecting-IP trusted only on the
// Cloudflare-proxied hosts, /health and /ready exempt, 429 + T-01 envelope.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp, HEALTH_PATH, READY_PATH } from "../../../src/api/app";
import {
  DEFAULT_MAX_KEYS,
  ipKey,
  rateLimitSettingsFromEnv,
  readBucketStore,
  TokenBucketStore,
} from "../../../src/api/middleware/rate-limit";
import { captureLogs, fakeQueries } from "../api/fake-queries";

const WWW = "www.cengizhankose.com";
const APEX = "cengizhankose.com";
const OUTPLANE = "x-3000-y.outplane.app";

let savedLogLevel: string | undefined;
beforeAll(() => {
  savedLogLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = "error"; // keep the per-request log lines out of the test output
});
afterAll(() => {
  if (savedLogLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = savedLogLevel;
});

/** A fake monotonic clock in ms. */
function fakeClock(start = 1_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

/** createApp with the env's limit and an injected store (fake clock by default). */
function limitedApp(
  env: Record<string, string | undefined> = {},
  store = readBucketStore(
    rateLimitSettingsFromEnv(env).perMinute,
    fakeClock().now,
  ),
) {
  return {
    app: createApp({ queries: fakeQueries(), env, rateLimitStore: store }),
    store,
  };
}

type App = ReturnType<typeof createApp>;

function call(
  app: App,
  path = "/api/posts",
  headers: Record<string, string> = {},
) {
  return app.request(path, { headers: { host: WWW, ...headers } });
}

async function statuses(
  app: App,
  n: number,
  path: string,
  headers: (i: number) => Record<string, string>,
) {
  const out: number[] = [];
  for (let i = 0; i < n; i++)
    out.push((await call(app, path, headers(i))).status);
  return out;
}

describe("T-08 limit on /api/* (SEC-10 / BE-18 criterion 1)", () => {
  test("60 GETs from one IP pass, the 61st gets 429 + Retry-After + RATE_LIMITED", async () => {
    const { app } = limitedApp();
    const ip = { "cf-connecting-ip": "203.0.113.7" };
    const first = await statuses(app, 60, "/api/posts", () => ip);
    expect(first.every((s) => s === 200)).toBe(true);

    const res = await call(app, "/api/posts", ip);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("1");
    expect(res.headers.get("ratelimit-limit")).toBe("60");
    expect(res.headers.get("ratelimit-remaining")).toBe("0");
    expect(res.headers.get("content-type")).toStartWith("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(await res.json()).toEqual({
      error: "Too many requests",
      code: "RATE_LIMITED",
    });
  });

  test("another IP is not affected", async () => {
    const { app } = limitedApp();
    await statuses(app, 61, "/api/posts", () => ({
      "cf-connecting-ip": "203.0.113.7",
    }));
    expect(
      (await call(app, "/api/posts", { "cf-connecting-ip": "203.0.113.8" }))
        .status,
    ).toBe(200);
  });

  test("one second later the same IP gets exactly one more request (1 token/s)", async () => {
    const clock = fakeClock();
    const { app } = limitedApp({}, readBucketStore(60, clock.now));
    const ip = { "cf-connecting-ip": "203.0.113.7" };
    await statuses(app, 60, "/api/posts", () => ip);
    expect((await call(app, "/api/posts", ip)).status).toBe(429);
    clock.advance(1_000);
    expect((await call(app, "/api/posts", ip)).status).toBe(200);
    expect((await call(app, "/api/posts", ip)).status).toBe(429);
    clock.advance(60_000); // a full minute refills the whole bucket, no more
    const refilled = await statuses(app, 61, "/api/posts", () => ip);
    expect(refilled.filter((s) => s === 200).length).toBe(60);
    expect(refilled.at(-1)).toBe(429);
  });

  test("/health and /ready never get 429, even for an exhausted client (100 requests each)", async () => {
    const { app } = limitedApp();
    const ip = { "cf-connecting-ip": "203.0.113.7" };
    await statuses(app, 61, "/api/posts", () => ip);
    for (const path of [HEALTH_PATH, READY_PATH]) {
      const got = await statuses(app, 100, path, () => ip);
      expect(new Set(got)).toEqual(new Set([200]));
    }
  });

  test("/api, /api/ and unknown /api paths (scanners) spend the same bucket; site paths do not", async () => {
    const { app } = limitedApp();
    const ip = { "cf-connecting-ip": "198.51.100.1" };
    const paths = ["/api", "/api/", "/api/.env", "/api/posts/x", "/api/posts"];
    const mixed: number[] = [];
    for (let i = 0; i < 60; i++) {
      mixed.push((await call(app, paths[i % paths.length], ip)).status);
    }
    expect(mixed).not.toContain(429);
    expect((await call(app, "/api/posts?lang=tr", ip)).status).toBe(429);
    expect((await call(app, "/apix", ip)).status).toBe(404); // not an API path
  });

  test("query-string variants share the bucket (BE-18 step 2)", async () => {
    const { app } = limitedApp();
    const ip = { "cf-connecting-ip": "198.51.100.2" };
    const variants: number[] = [];
    for (let i = 0; i < 61; i++) {
      variants.push((await call(app, `/api/posts?lang=en&rl=${i}`, ip)).status);
    }
    expect(variants.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(variants[60]).toBe(429);
  });

  test("HEAD counts like GET", async () => {
    const { app } = limitedApp({ RL_READ_PER_MIN: "2" });
    const init = {
      method: "HEAD",
      headers: { host: WWW, "cf-connecting-ip": "198.51.100.3" },
    };
    expect((await app.request("/api/posts", init)).status).toBe(200);
    expect((await app.request("/api/posts", init)).status).toBe(200);
    expect((await app.request("/api/posts", init)).status).toBe(429);
  });
});

describe("client key (T-08, SEC-10 criterion 3)", () => {
  test("www and apex: the key is CF-Connecting-IP", async () => {
    const { app } = limitedApp({ RL_READ_PER_MIN: "3" });
    for (const host of [WWW, APEX, WWW]) {
      const res = await app.request("/api/posts", {
        headers: {
          host,
          "cf-connecting-ip": "192.0.2.50",
          "x-forwarded-for": `10.0.0.${host.length}`,
        },
      });
      expect(res.status).toBe(host === APEX ? 301 : 200); // apex is redirected after counting
    }
    const fourth = await app.request("/api/posts", {
      headers: { host: WWW, "cf-connecting-ip": "192.0.2.50" },
    });
    expect(fourth.status).toBe(429);
  });

  test("*.outplane.app: changing CF-Connecting-IP does not reset the limit", async () => {
    const { app } = limitedApp();
    const got: number[] = [];
    for (let i = 0; i < 61; i++) {
      const res = await app.request("/api/posts", {
        headers: {
          host: OUTPLANE,
          "cf-connecting-ip": `203.0.113.${i + 1}`,
          "x-forwarded-for": "198.51.100.9",
        },
      });
      got.push(res.status);
    }
    expect(got.slice(0, 60).every((s) => s === 301)).toBe(true); // limited first, then sent to www
    expect(got[60]).toBe(429);
  });

  test("*.outplane.app: only the right-most X-Forwarded-For entry counts", async () => {
    const { app } = limitedApp({ RL_READ_PER_MIN: "2" });
    const req = (xff: string) =>
      app.request("/api/posts", {
        headers: { host: OUTPLANE, "x-forwarded-for": xff },
      });
    expect((await req("1.1.1.1, 198.51.100.20")).status).toBe(301);
    expect((await req("2.2.2.2, 198.51.100.20")).status).toBe(301);
    expect((await req("3.3.3.3,198.51.100.20")).status).toBe(429);
    expect((await req("198.51.100.21")).status).toBe(301);
  });

  test("www without CF-Connecting-IP (origin reached directly) falls back to X-Forwarded-For", async () => {
    const { app } = limitedApp({ RL_READ_PER_MIN: "1" });
    const req = (headers: Record<string, string>) =>
      call(app, "/api/posts", headers);
    expect((await req({ "x-forwarded-for": "198.51.100.30" })).status).toBe(
      200,
    );
    expect((await req({ "x-forwarded-for": "198.51.100.30" })).status).toBe(
      429,
    );
    expect(
      (
        await req({
          "cf-connecting-ip": "not-an-ip",
          "x-forwarded-for": "198.51.100.30",
        })
      ).status,
    ).toBe(429);
    expect((await req({ "x-forwarded-for": "198.51.100.31" })).status).toBe(
      200,
    );
  });

  test("X-Forwarded-Host decides the host class exactly like Host (documented trust limit, S13)", async () => {
    // A platform proxy that rewrites Host keeps the original in X-Forwarded-Host,
    // so a www request must still be keyed by CF-Connecting-IP. A forged value
    // gains nothing over sending `Host: www...` to the origin directly, which the
    // app cannot tell apart either; only an origin IP allowlist (S13) closes that.
    const { app } = limitedApp({ RL_READ_PER_MIN: "1" });
    const req = (headers: Record<string, string>) =>
      app.request("/api/posts", {
        headers: { "x-forwarded-for": "198.51.100.40", ...headers },
      });
    const viaProxy = { host: "10.1.2.3:3000", "x-forwarded-host": WWW };
    expect(
      (await req({ ...viaProxy, "cf-connecting-ip": "203.0.113.1" })).status,
    ).toBe(200);
    expect(
      (await req({ ...viaProxy, "cf-connecting-ip": "203.0.113.2" })).status,
    ).toBe(200);
    // no X-Forwarded-Host: the platform address, keyed by XFF whatever CF-Connecting-IP says
    expect(
      (await req({ host: OUTPLANE, "cf-connecting-ip": "203.0.113.3" })).status,
    ).toBe(301);
    expect(
      (await req({ host: OUTPLANE, "cf-connecting-ip": "203.0.113.4" })).status,
    ).toBe(429);
  });

  test("IPv6 clients are grouped by /64", async () => {
    const { app } = limitedApp({ RL_READ_PER_MIN: "2" });
    const req = (ip: string) =>
      call(app, "/api/posts", { "cf-connecting-ip": ip });
    expect((await req("2001:db8:1:2::1")).status).toBe(200);
    expect((await req("2001:0db8:0001:0002:ffff:0:0:9")).status).toBe(200);
    expect((await req("2001:db8:1:2:abcd::77")).status).toBe(429);
    expect((await req("2001:db8:1:3::1")).status).toBe(200);
  });

  test("ipKey normalises and rejects", () => {
    expect(ipKey(" 203.0.113.7 ")).toBe("203.0.113.7");
    expect(ipKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey("[2001:db8::1]")).toBe("2001:db8:0:0::/64");
    expect(ipKey("2001:DB8:0:0:1::1")).toBe("2001:db8:0:0::/64");
    expect(ipKey("::1")).toBe("0:0:0:0::/64");
    expect(ipKey("64:ff9b::192.0.2.33")).toBe("64:ff9b:0:0::/64");
    for (const bad of [
      undefined,
      "",
      "unknown",
      "203.0.113.999",
      "1.2.3",
      "a".repeat(5000),
      "2001:db8::1::2",
    ]) {
      expect(ipKey(bad)).toBeNull();
    }
  });

  test("the client address is never written to the log", async () => {
    process.env.LOG_LEVEL = "debug";
    try {
      const { app } = limitedApp({ RL_READ_PER_MIN: "1" });
      const { lines } = await captureLogs(async () => {
        await call(app, "/api/posts", { "cf-connecting-ip": "203.0.113.77" });
        await call(app, "/api/posts", { "cf-connecting-ip": "203.0.113.77" });
      });
      expect(lines.length).toBeGreaterThan(0);
      expect(JSON.stringify(lines)).not.toContain("203.0.113.77");
      expect(lines.some((l) => l.status === 429)).toBe(true);
    } finally {
      process.env.LOG_LEVEL = "error";
    }
  });
});

describe("bounded memory (SEC-10 / BE-18 criterion 2)", () => {
  test("20 000 distinct clients through the app leave at most 10 000 buckets", async () => {
    const { app, store } = limitedApp();
    for (let i = 0; i < 20_000; i++) {
      const ip = `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
      await call(app, "/api/posts", { "cf-connecting-ip": ip });
    }
    expect(store.size).toBeLessThanOrEqual(DEFAULT_MAX_KEYS);
    expect(store.size).toBe(10_000);
  });

  test("full map: idle buckets go first, then the least recently used one", () => {
    const clock = fakeClock();
    const store = new TokenBucketStore({
      capacity: 2,
      refillPerSec: 1 / 30,
      maxKeys: 3,
      idleMs: 600_000,
      now: clock.now,
    });
    store.take("a");
    store.take("b");
    store.take("c");
    store.take("a"); // a is now the most recently used
    store.take("d"); // full: b (least recently used) is dropped
    expect(store.size).toBe(3);
    store.take("b"); // b comes back with a full bucket; c is dropped
    expect(store.take("b").allowed).toBe(true);
    expect(store.take("b").allowed).toBe(false);
    clock.advance(600_000); // everything idle for 10 min
    store.take("e");
    expect(store.size).toBe(1);
  });

  test("sweep() drops only buckets idle for idleMs", () => {
    const clock = fakeClock();
    const store = new TokenBucketStore({
      capacity: 1,
      refillPerSec: 1,
      idleMs: 1_000,
      now: clock.now,
    });
    store.take("old");
    clock.advance(600);
    store.take("new");
    clock.advance(500);
    store.sweep();
    expect(store.size).toBe(1);
    clock.advance(1_000);
    store.sweep();
    expect(store.size).toBe(0);
  });

  test("Retry-After is the time until one token is back, rounded up", () => {
    const clock = fakeClock();
    const store = readBucketStore(5, clock.now); // 5/min = one token every 12 s
    for (let i = 0; i < 5; i++) expect(store.take("k").allowed).toBe(true);
    expect(store.take("k")).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterS: 12,
    });
    clock.advance(6_000);
    expect(store.take("k").retryAfterS).toBe(6);
    clock.advance(5_500);
    expect(store.take("k").retryAfterS).toBe(1);
    clock.advance(500);
    expect(store.take("k")).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterS: 0,
    });
  });

  test("invalid store settings are refused", () => {
    expect(
      () => new TokenBucketStore({ capacity: 0, refillPerSec: 1 }),
    ).toThrow(RangeError);
    expect(
      () => new TokenBucketStore({ capacity: 1, refillPerSec: 0 }),
    ).toThrow(RangeError);
    expect(
      () => new TokenBucketStore({ capacity: 1, refillPerSec: 1, maxKeys: 0 }),
    ).toThrow(RangeError);
  });
});

describe("configuration (RL_READ_PER_MIN, RATE_LIMIT_DISABLED)", () => {
  test("RL_READ_PER_MIN changes the limit without a code change", async () => {
    const app = createApp({
      queries: fakeQueries(),
      env: { RL_READ_PER_MIN: "5" },
    });
    const got = await statuses(app, 6, "/api/posts", () => ({
      "cf-connecting-ip": "198.51.100.50",
    }));
    expect(got).toEqual([200, 200, 200, 200, 200, 429]);
    const last = await call(app, "/api/posts", {
      "cf-connecting-ip": "198.51.100.50",
    });
    expect(last.headers.get("ratelimit-limit")).toBe("5");
    expect(last.headers.get("retry-after")).toBe("12");
  });

  test("RATE_LIMIT_DISABLED=1 turns the limiter off (BE-18 rollback)", async () => {
    const app = createApp({
      queries: fakeQueries(),
      env: { RATE_LIMIT_DISABLED: "1" },
    });
    const got = await statuses(app, 100, "/api/posts", () => ({
      "cf-connecting-ip": "198.51.100.51",
    }));
    expect(got).not.toContain(429);
  });

  test("settings parsing", () => {
    expect(rateLimitSettingsFromEnv({})).toEqual({
      enabled: true,
      perMinute: 60,
    });
    expect(
      rateLimitSettingsFromEnv({ RATE_LIMIT_DISABLED: "true" }).enabled,
    ).toBe(false);
    expect(rateLimitSettingsFromEnv({ RATE_LIMIT_DISABLED: "0" }).enabled).toBe(
      true,
    );
    expect(
      rateLimitSettingsFromEnv({ RL_READ_PER_MIN: " 120 " }).perMinute,
    ).toBe(120);
    for (const bad of ["0", "-5", "2.5", "abc", "", "1e9"]) {
      expect(rateLimitSettingsFromEnv({ RL_READ_PER_MIN: bad }).perMinute).toBe(
        60,
      );
    }
  });
});

describe("under Bun.serve (the production entry point)", () => {
  test("without proxy headers the socket address is the key", async () => {
    const app = createApp({
      queries: fakeQueries(),
      env: { RL_READ_PER_MIN: "3" },
    });
    const server = Bun.serve({
      fetch: app.fetch,
      port: 0,
      hostname: "127.0.0.1",
    });
    try {
      const got: number[] = [];
      for (let i = 0; i < 4; i++) {
        got.push(
          (await fetch(`http://127.0.0.1:${server.port}/api/posts`)).status,
        );
      }
      expect(got).toEqual([200, 200, 200, 429]);
      const health = await fetch(`http://127.0.0.1:${server.port}/health`);
      expect(health.status).toBe(200);
    } finally {
      await server.stop(true);
    }
  });
});
