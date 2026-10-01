import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

/**
 * Daily request aggregates (ANL-13): one row per UTC day x host group x path
 * group x status class x country x bot flag, written by src/server/
 * requestStats.ts. It exists because the platform keeps its request log for
 * about a day; this is the historical baseline for trend questions.
 *
 * Privacy by shape: there is no IP, user-agent, query string or full path
 * column. `host` is one of www | apex | outplane | other, `path_group` one of
 * the classifyPath() kinds (src/lib/analytics/pageType.js) plus `health`,
 * `status_class` is `2xx`..`5xx`, `country` the two-letter Cloudflare code
 * ('XX' when unknown), `is_bot` a coarse flag derived from the user agent at
 * request time (the user agent itself is never stored).
 *
 * The table lives in the portfolio database, never in Umami's (T-13). The
 * runtime's read-only role cannot write to it: the writer is the separate
 * PG_STATS_URL role (scripts/sql/least-privilege.sql, SEC-14).
 */
export const requestDailyStats = pgTable(
  "request_daily_stats",
  {
    day: date("day", { mode: "string" }).notNull(),
    host: text("host").notNull(),
    pathGroup: text("path_group").notNull(),
    statusClass: text("status_class").notNull(),
    country: text("country").notNull(),
    isBot: boolean("is_bot").notNull().default(false),
    requests: integer("requests").notNull().default(0),
    originMsSum: bigint("origin_ms_sum", { mode: "number" })
      .notNull()
      .default(0),
  },
  (t) => [
    primaryKey({
      name: "request_daily_stats_pk",
      columns: [t.day, t.host, t.pathGroup, t.statusClass, t.country, t.isBot],
    }),
    check("request_daily_stats_requests_check", sql`${t.requests} >= 0`),
    check(
      "request_daily_stats_origin_ms_sum_check",
      sql`${t.originMsSum} >= 0`,
    ),
  ],
);
