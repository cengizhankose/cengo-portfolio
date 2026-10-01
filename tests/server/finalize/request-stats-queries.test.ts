// ANL-13: the weekly queries of tracking-plan.md section 16.2 run against the
// real request_daily_stats schema (PGlite, every migration applied) and return
// what they say they return.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createStrictTestDb, REPO_ROOT } from "../db/pglite";

const PLAN = readFileSync(
  join(REPO_ROOT, "claudedocs/analytics/tracking-plan.md"),
  "utf8",
);

/** The ```sql statements of section 16.2, split at the semicolons. */
function weeklyQueries(): string[] {
  const start = PLAN.indexOf("### 16.2");
  const end = PLAN.indexOf("\n## ", start);
  const section = PLAN.slice(start, end === -1 ? undefined : end);
  const block = /```sql\n([\s\S]*?)```/.exec(section);
  if (!block) throw new Error("no sql block in section 16.2");
  return block[1]
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

describe("tracking-plan 16.2 weekly queries", () => {
  let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;
  const queries = weeklyQueries();

  beforeAll(async () => {
    ctx = await createStrictTestDb();
    await ctx.client.exec(`
      insert into request_daily_stats (day, host, path_group, status_class, country, is_bot, requests, origin_ms_sum) values
        (current_date - 1, 'www', 'page',  '2xx', 'TR', false, 100, 1000),
        (current_date - 1, 'www', 'page',  '2xx', 'TR', true,   20,  200),
        (current_date - 1, 'www', 'probe', '4xx', 'XX', true,   80,  100),
        (current_date - 1, 'www', 'page',  '5xx', 'TR', false,   3,   30),
        (current_date - 2, 'apex', 'page', '3xx', 'DE', false,   7,   70),
        (current_date - 30, 'www', 'page', '2xx', 'TR', false, 999,    0)`);
  });
  afterAll(async () => {
    await ctx.close();
  });

  test("four queries: probe share, 5xx, hosts, page requests", () => {
    expect(queries).toHaveLength(4);
  });

  test("probe share is the probe requests over all requests of the last 7 days", async () => {
    const { rows } = await ctx.client.query<{ probe_share: number }>(
      queries[0],
    );
    expect(rows[0].probe_share).toBeCloseTo(80 / 210, 6);
  });

  test("5xx per day", async () => {
    const { rows } = await ctx.client.query<{ errors_5xx: string | number }>(
      queries[1],
    );
    expect(rows.map((r) => Number(r.errors_5xx))).toEqual([3]);
  });

  test("host distribution, largest first, old rows left out", async () => {
    const { rows } = await ctx.client.query<{
      host: string;
      requests: string | number;
    }>(queries[2]);
    expect(rows.map((r) => [r.host, Number(r.requests)])).toEqual([
      ["www", 203],
      ["apex", 7],
    ]);
  });

  test("page requests per day, human and bot apart", async () => {
    const { rows } = await ctx.client.query<{
      is_bot: boolean;
      page_requests: string | number;
    }>(queries[3]);
    expect(rows.map((r) => [r.is_bot, Number(r.page_requests)])).toEqual([
      [false, 7], // two days ago (apex)
      [false, 103], // yesterday: 100 + 3
      [true, 20],
    ]);
  });
});
