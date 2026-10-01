// ANL-13: migration 0003 creates request_daily_stats with no personal columns.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS, createStrictTestDb } from "../db/pglite";

const file = readdirSync(MIGRATIONS).find((f) =>
  /^\d{4}_request_daily_stats\.sql$/.test(f),
);

describe("request_daily_stats migration", () => {
  test("the file exists, creates the table and has no IP or user-agent column", async () => {
    expect(file).toBeDefined();
    const text = await Bun.file(join(MIGRATIONS, file!)).text();
    expect(text).toContain('CREATE TABLE "request_daily_stats"');
    // Plan criterion: grep -Eic '"(client_)?ip"|user_agent' -> 0
    expect(text.match(/"(client_)?ip"|user_agent/gi)).toBeNull();
    expect(text).not.toMatch(/\b(path|url|query|referrer)\b/i);
  });

  test("it is the next entry of the journal", async () => {
    const journal = (await Bun.file(
      join(MIGRATIONS, "meta/_journal.json"),
    ).json()) as { entries: { idx: number; tag: string; when: number }[] };
    const entry = journal.entries.find(
      (e) => e.tag === file!.replace(".sql", ""),
    );
    expect(entry).toBeDefined();
    const previous = journal.entries.find((e) => e.idx === entry!.idx - 1);
    expect(entry!.when).toBeGreaterThan(previous!.when);
  });

  describe("on the migrated schema (PGlite)", () => {
    let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;
    beforeAll(async () => {
      ctx = await createStrictTestDb();
    });
    afterAll(async () => {
      await ctx.close();
    });

    test("columns, types and the composite primary key", async () => {
      const { rows } = await ctx.client.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `select column_name, data_type, is_nullable from information_schema.columns
          where table_name = 'request_daily_stats' order by ordinal_position`,
      );
      expect(rows.map((r) => [r.column_name, r.data_type])).toEqual([
        ["day", "date"],
        ["host", "text"],
        ["path_group", "text"],
        ["status_class", "text"],
        ["country", "text"],
        ["is_bot", "boolean"],
        ["requests", "integer"],
        ["origin_ms_sum", "bigint"],
      ]);
      expect(rows.every((r) => r.is_nullable === "NO")).toBe(true);
      const pk = await ctx.client.query<{ column_name: string }>(
        `select a.attname as column_name
           from pg_index i
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
          where i.indrelid = 'request_daily_stats'::regclass and i.indisprimary
          order by array_position(i.indkey::int2[], a.attnum)`,
      );
      expect(pk.rows.map((r) => r.column_name)).toEqual([
        "day",
        "host",
        "path_group",
        "status_class",
        "country",
        "is_bot",
      ]);
    });

    test("negative counts are refused", async () => {
      let message = "";
      try {
        await ctx.client.exec(
          `insert into request_daily_stats (day, host, path_group, status_class, country, requests)
           values ('2026-10-01','www','page','2xx','TR',-1)`,
        );
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain("request_daily_stats_requests_check");
    });
  });
});
