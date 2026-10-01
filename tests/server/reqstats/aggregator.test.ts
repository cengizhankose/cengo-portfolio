// ANL-13: the in-memory aggregator and its flush, against the real migrated
// schema on in-process PGlite (no Docker, no network).
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { sql } from "drizzle-orm";
import {
  createPgSink,
  createRequestStats,
  type RequestObservation,
  type StatsRow,
  type StatsSink,
} from "../../../src/server/requestStats";
import { captureLogs, silenceLogs } from "../helpers";
import { createStrictTestDb } from "../db/pglite";

silenceLogs();

const obs = (over: Partial<RequestObservation> = {}): RequestObservation => ({
  host: "www.cengizhankose.com",
  path: "/about",
  status: 200,
  country: "TR",
  userAgent: "Mozilla/5.0 Safari/605.1.15",
  ms: 10,
  ...over,
});

type Stored = {
  day: string;
  host: string;
  path_group: string;
  status_class: string;
  country: string;
  is_bot: boolean;
  requests: number;
  origin_ms_sum: string;
};

describe("aggregation (memory only)", () => {
  const sink: StatsSink = { upsert: async () => {}, purge: async () => {} };
  const fixed = () => new Date("2026-10-01T12:00:00Z");

  test("3 records with the same key are one row with requests = 3", () => {
    const stats = createRequestStats({ sink, now: fixed });
    for (let i = 0; i < 3; i++) stats.record(obs());
    const rows = stats.snapshot();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      day: "2026-10-01",
      host: "www",
      pathGroup: "page",
      statusClass: "2xx",
      country: "TR",
      isBot: false,
      requests: 3,
      originMsSum: 30,
    });
  });

  test("status 404 -> '4xx'; missing cf-ipcountry -> 'XX'", () => {
    const stats = createRequestStats({ sink, now: fixed });
    stats.record(obs({ status: 404, country: undefined }));
    expect(stats.snapshot()[0]).toMatchObject({
      statusClass: "4xx",
      country: "XX",
    });
  });

  test("different day, host, group, status, country or bot flag are different rows", () => {
    let t = new Date("2026-10-01T23:59:59Z");
    const stats = createRequestStats({ sink, now: () => t });
    stats.record(obs());
    stats.record(obs({ host: "cengizhankose.com" }));
    stats.record(obs({ path: "/wp-login.php" }));
    stats.record(obs({ status: 500 }));
    stats.record(obs({ country: "DE" }));
    stats.record(obs({ userAgent: "Googlebot/2.1" }));
    t = new Date("2026-10-02T00:00:01Z"); // UTC midnight passes
    stats.record(obs());
    expect(stats.snapshot()).toHaveLength(7);
    expect(new Set(stats.snapshot().map((r) => r.day))).toEqual(
      new Set(["2026-10-01", "2026-10-02"]),
    );
  });

  test("rows carry no path, query, IP or user agent", () => {
    const stats = createRequestStats({ sink, now: fixed });
    stats.record(
      obs({ path: "/blog/very-secret-slug", userAgent: "UniqueUA/9.9.9" }),
    );
    const json = JSON.stringify(stats.snapshot());
    expect(json).not.toContain("secret-slug");
    expect(json).not.toContain("UniqueUA");
    expect(Object.keys(stats.snapshot()[0]).sort()).toEqual(
      [
        "country",
        "day",
        "host",
        "isBot",
        "originMsSum",
        "pathGroup",
        "requests",
        "statusClass",
      ].sort(),
    );
  });

  test("bad durations count as 0 ms", () => {
    const stats = createRequestStats({ sink, now: fixed });
    stats.record(obs({ ms: Number.NaN }));
    stats.record(obs({ ms: -5 }));
    expect(stats.snapshot()[0]).toMatchObject({ requests: 2, originMsSum: 0 });
  });

  test("maxKeys: new keys beyond the cap are dropped and counted, existing keys keep counting", () => {
    const stats = createRequestStats({ sink, now: fixed, maxKeys: 2 });
    stats.record(obs({ status: 200 }));
    stats.record(obs({ status: 404 }));
    stats.record(obs({ status: 500 })); // third key: dropped
    stats.record(obs({ status: 200 })); // existing key
    expect(stats.snapshot()).toHaveLength(2);
    expect(stats.dropped()).toBe(1);
    expect(
      stats.snapshot().find((r) => r.statusClass === "2xx")?.requests,
    ).toBe(2);
  });

  test("hot path stays cheap: 20k records in well under a second", () => {
    const stats = createRequestStats({ sink, now: fixed });
    const started = performance.now();
    for (let i = 0; i < 20_000; i++) {
      stats.record(obs({ path: i % 3 ? "/about" : "/assets/a.js" }));
    }
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("flush into Postgres (PGlite, real migrations)", () => {
  let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;
  let now = new Date("2026-10-01T12:00:00Z");
  const clock = () => now;

  beforeAll(async () => {
    ctx = await createStrictTestDb();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    now = new Date("2026-10-01T12:00:00Z");
    await ctx.client.exec("delete from request_daily_stats");
  });

  const stored = async () =>
    (
      await ctx.client.query<Stored>(
        `select day::text as day, host, path_group, status_class, country, is_bot,
                requests, origin_ms_sum::text as origin_ms_sum
           from request_daily_stats order by day, host, path_group, status_class, country, is_bot`,
      )
    ).rows;

  test("flush writes the aggregate; a second flush adds to the same row", async () => {
    const stats = createRequestStats({
      sink: createPgSink(ctx.db),
      now: clock,
    });
    for (let i = 0; i < 3; i++) stats.record(obs({ ms: 4 }));
    stats.record(obs({ status: 404, ms: 1 }));
    const first = await stats.flush("test");
    expect(first).toEqual({ ok: true, rows: 2, requests: 4 });
    expect(stats.snapshot()).toHaveLength(0);
    expect(await stored()).toEqual([
      {
        day: "2026-10-01",
        host: "www",
        path_group: "page",
        status_class: "2xx",
        country: "TR",
        is_bot: false,
        requests: 3,
        origin_ms_sum: "12",
      },
      {
        day: "2026-10-01",
        host: "www",
        path_group: "page",
        status_class: "4xx",
        country: "TR",
        is_bot: false,
        requests: 1,
        origin_ms_sum: "1",
      },
    ]);

    stats.record(obs({ ms: 6 }));
    stats.record(obs({ ms: 6 }));
    await stats.flush("test");
    const rows = await stored();
    expect(rows.find((r) => r.status_class === "2xx")).toMatchObject({
      requests: 5,
      origin_ms_sum: "24",
    });
    const total = await ctx.client.query<{ n: number }>(
      "select sum(requests)::int as n from request_daily_stats",
    );
    expect(total.rows[0].n).toBe(6);
  });

  test("an empty buffer writes nothing", async () => {
    const stats = createRequestStats({
      sink: createPgSink(ctx.db),
      now: clock,
    });
    await stats.flush("test"); // consumes the first-of-the-day purge
    expect(await stats.flush("test")).toEqual({
      ok: true,
      rows: 0,
      requests: 0,
    });
    expect(await stored()).toEqual([]);
  });

  test("requests that arrive during a flush are kept for the next one", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = createPgSink(ctx.db);
    const stats = createRequestStats({
      sink: {
        ...inner,
        upsert: async (rows) => {
          await gate;
          await inner.upsert(rows);
        },
      },
      now: clock,
    });
    stats.record(obs());
    const flushing = stats.flush("test");
    stats.record(obs()); // lands in the new buffer
    expect(stats.snapshot()[0].requests).toBe(1);
    release();
    await flushing;
    await stats.flush("test");
    expect((await stored())[0].requests).toBe(2);
  });

  test("one flush at a time: concurrent calls share the run", async () => {
    let calls = 0;
    const inner = createPgSink(ctx.db);
    const stats = createRequestStats({
      sink: {
        ...inner,
        upsert: async (rows) => {
          calls++;
          await new Promise((r) => setTimeout(r, 20));
          await inner.upsert(rows);
        },
      },
      now: clock,
    });
    stats.record(obs());
    const [a, b, c] = await Promise.all([
      stats.flush(),
      stats.flush(),
      stats.flush(),
    ]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect((await stored())[0].requests).toBe(1);
  });

  test("a failing database keeps the counts and logs a structured error; the next flush writes them", async () => {
    let failing = true;
    const inner = createPgSink(ctx.db);
    const stats = createRequestStats({
      sink: {
        ...inner,
        upsert: async (rows) => {
          if (failing)
            throw Object.assign(new Error("connection lost"), {
              code: "ECONNRESET",
            });
          await inner.upsert(rows);
        },
      },
      now: clock,
    });
    stats.record(obs({ ms: 5 }));
    stats.record(obs({ status: 404, ms: 5 }));
    const { result, lines } = await captureLogs(() => stats.flush("interval"));
    expect(result.ok).toBe(false);
    expect(stats.snapshot().reduce((n, r) => n + r.requests, 0)).toBe(2);
    const error = lines.find((l) => l.msg === "request_stats flush failed");
    expect(error).toMatchObject({
      level: "error",
      reason: "interval",
      errCode: "ECONNRESET",
      buffered: 2,
    });

    stats.record(obs({ ms: 5 })); // arrives while the DB is down
    failing = false;
    expect((await stats.flush("interval")).ok).toBe(true);
    const rows = await stored();
    expect(rows.reduce((n, r) => n + r.requests, 0)).toBe(3);
    expect(rows.find((r) => r.status_class === "2xx")).toMatchObject({
      requests: 2,
      origin_ms_sum: "10",
    });
  });

  test("a failure in a later chunk keeps only the unwritten rows (no double count)", async () => {
    let attempt = 0;
    const inner = createPgSink(ctx.db);
    const stats = createRequestStats({
      sink: {
        ...inner,
        upsert: async (rows) => {
          attempt++;
          if (attempt === 2) throw new Error("boom");
          await inner.upsert(rows);
        },
      },
      now: clock,
      chunkRows: 1,
    });
    stats.record(obs({ status: 200 }));
    stats.record(obs({ status: 404 }));
    stats.record(obs({ status: 500 }));
    expect((await stats.flush()).ok).toBe(false);
    expect(await stored()).toHaveLength(1);
    expect(stats.snapshot()).toHaveLength(2);
    expect((await stats.flush()).ok).toBe(true);
    const rows = await stored();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.requests === 1)).toBe(true);
  });

  test("once a day the flush deletes rows older than 400 days", async () => {
    await ctx.client.exec(`
      insert into request_daily_stats (day, host, path_group, status_class, country, is_bot, requests)
      values ('2025-08-26','www','page','2xx','TR',false,5),   -- 401 days before 2026-10-01
             ('2025-08-27','www','page','2xx','TR',false,7),   -- 400 days: kept
             ('2026-09-30','www','page','2xx','TR',false,9)`);
    const stats = createRequestStats({
      sink: createPgSink(ctx.db),
      now: clock,
    });
    stats.record(obs());
    await stats.flush();
    expect((await stored()).map((r) => r.day)).toEqual([
      "2025-08-27",
      "2026-09-30",
      "2026-10-01",
    ]);

    // Same day again: no second purge (an old row inserted now survives)...
    await ctx.client.exec(`insert into request_daily_stats
      (day, host, path_group, status_class, country, is_bot, requests)
      values ('2020-01-01','www','page','2xx','TR',false,1)`);
    stats.record(obs());
    await stats.flush();
    expect((await stored()).map((r) => r.day)).toContain("2020-01-01");

    // ...the next UTC day purges again.
    now = new Date("2026-10-02T00:30:00Z");
    stats.record(obs());
    await stats.flush();
    expect((await stored()).map((r) => r.day)).not.toContain("2020-01-01");
  });

  test("a purge failure is a warning, not a failed flush", async () => {
    const inner = createPgSink(ctx.db);
    const stats = createRequestStats({
      sink: {
        ...inner,
        purge: async () => {
          throw new Error("no delete grant");
        },
      },
      now: clock,
    });
    stats.record(obs());
    const { result, lines } = await captureLogs(() => stats.flush());
    expect(result.ok).toBe(true);
    expect(
      lines.find((l) => l.msg === "request_stats purge failed"),
    ).toMatchObject({ level: "warn" });
    expect((await stored())[0].requests).toBe(1);
  });

  test("close() writes the rest and logs the shutdown flush; later records are ignored", async () => {
    let closedSink = false;
    const stats = createRequestStats({
      sink: createPgSink(ctx.db, async () => {
        closedSink = true;
      }),
      now: clock,
    });
    stats.start();
    stats.record(obs());
    stats.record(obs());
    const { lines } = await captureLogs(() => stats.close());
    expect((await stored())[0].requests).toBe(2);
    expect(closedSink).toBe(true);
    const flush = lines.find(
      (l) => l.msg === "request_stats flush" && l.reason === "shutdown",
    );
    expect(flush).toMatchObject({ level: "info", rows: 1, requests: 2 });
    stats.record(obs());
    expect(stats.snapshot()).toHaveLength(0);
    await stats.close(); // idempotent
  });

  test("close() waits for a flush in progress and does not lose what arrived meanwhile", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = createPgSink(ctx.db);
    let first = true;
    const stats = createRequestStats({
      sink: {
        ...inner,
        upsert: async (rows) => {
          if (first) {
            first = false;
            await gate;
          }
          await inner.upsert(rows);
        },
      },
      now: clock,
    });
    stats.record(obs());
    void stats.flush();
    stats.record(obs());
    const closing = stats.close();
    release();
    await closing;
    expect((await stored())[0].requests).toBe(2);
  });

  test("close() gives up on a hung database after closeTimeoutMs and still resolves", async () => {
    const stats = createRequestStats({
      sink: {
        upsert: () => new Promise(() => {}),
        purge: async () => {},
      },
      now: clock,
      closeTimeoutMs: 30,
    });
    stats.record(obs());
    const { lines } = await captureLogs(() => stats.close());
    expect(
      lines.find((l) => l.msg === "request_stats flush timed out"),
    ).toBeDefined();
  });

  test("the periodic timer flushes (and is unref'd)", async () => {
    const stats = createRequestStats({
      sink: createPgSink(ctx.db),
      now: clock,
      flushIntervalMs: 15,
    });
    stats.start();
    stats.start(); // second start is a no-op
    stats.record(obs());
    await new Promise((r) => setTimeout(r, 120));
    await stats.close();
    expect((await stored())[0].requests).toBe(1);
  });

  test("rows written by the sink match the StatsRow shape", async () => {
    const rows: StatsRow[] = [
      {
        day: "2026-10-01",
        host: "www",
        pathGroup: "page",
        statusClass: "2xx",
        country: "TR",
        isBot: true,
        requests: 2,
        originMsSum: 7,
      },
    ];
    await createPgSink(ctx.db).upsert(rows);
    await createPgSink(ctx.db).upsert(rows);
    expect((await stored())[0]).toMatchObject({
      is_bot: true,
      requests: 4,
      origin_ms_sum: "14",
    });
    await ctx.db.execute(sql`select 1`);
  });
});
