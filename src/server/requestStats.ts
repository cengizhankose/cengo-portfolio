// Historical request baseline (ANL-13): daily request aggregates in Postgres.
//
// The platform keeps its request log for about a day, so trends ("compared with
// last month") need a table of our own. This module counts every request that
// reaches the origin in memory, by
//
//   UTC day x host group x path group x status class x country x bot flag
//
// and adds the counts to `request_daily_stats` (src/db/schema/requestStats.ts)
// once a minute and when the process shuts down.
//
// What is never kept: the IP, the user agent (only the one-bit bot flag it
// yields), the query string, the full path. Every dimension is a small closed
// set, so the table grows by at most a few hundred rows a day:
//   host        www | apex | outplane | other
//   path_group  page | asset | api | meta | probe | other (classifyPath, ANL-05)
//               | health (/health and /ready, so platform probes do not
//               drown the "other" group)
//   status      2xx | 3xx | 4xx | 5xx
//   country     two characters from Cloudflare's CF-IPCountry ('XX' unknown),
//               trusted only on the Cloudflare hosts like CF-Connecting-IP
//
// Failure policy: the database is never on the request path. record() only
// touches a Map. A failed flush keeps the counts (at most `maxKeys` distinct
// rows; beyond that new keys are dropped and counted) and logs one
// structured line; the next flush retries. One flush runs at a time.
//
// Write access: the runtime's own client is read-only (SEC-14), so the writer
// is a separate pool of one connection from PG_STATS_URL, a role that may
// write this table and nothing else (scripts/sql/least-privilege.sql).
// REQUEST_STATS_ENABLED=1 turns the whole thing on; unset, nothing is
// registered and nothing connects.
import { lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { MiddlewareHandler } from "hono";
import postgres from "postgres";
import { errorFields, log } from "../api/log";
import {
  APEX_HOST,
  CANONICAL_HOST,
  CLOUDFLARE_HOSTS,
  normalizeHost,
} from "../api/middleware/canonical-host";
import { clientConfig } from "../db/config";
import { assertNonProdDb, prodOverrideRequested } from "../db/guard";
import { requestDailyStats } from "../db/schema/requestStats";
import { classifyPath } from "../lib/analytics/pageType.js";

type Env = Record<string, string | undefined>;

export const FLUSH_INTERVAL_MS = 60_000;
export const MAX_KEYS = 5000;
export const RETENTION_DAYS = 400;
export const FLUSH_CHUNK_ROWS = 500;
export const CLOSE_TIMEOUT_MS = 5000;
export const STATS_APPLICATION_NAME = "cengo-portfolio-stats";

export const HOST_GROUPS = ["www", "apex", "outplane", "other"] as const;
export type HostGroup = (typeof HOST_GROUPS)[number];
export const UNKNOWN_COUNTRY = "XX";
const PLATFORM_HOST_SUFFIX = ".outplane.app";
/** Path group of the platform probes (the paths come from createApp, which owns them). */
export const HEALTH_GROUP = "health";

// ---------------------------------------------------------------------------
// Dimensions (pure)
// ---------------------------------------------------------------------------

/** www | apex | outplane | other, from the Host header (port and case ignored). */
export function hostGroup(rawHost: string | undefined): HostGroup {
  const host = normalizeHost(rawHost ?? "");
  if (host === CANONICAL_HOST) return "www";
  if (host === APEX_HOST) return "apex";
  if (
    host.endsWith(PLATFORM_HOST_SUFFIX) &&
    host.length > PLATFORM_HOST_SUFFIX.length
  ) {
    return "outplane";
  }
  return "other";
}

/** 404 -> '4xx'. Anything outside 100-599 counts as '5xx' (a broken response). */
export function statusClass(status: number): string {
  const hundreds = Math.floor(status / 100);
  return hundreds >= 1 && hundreds <= 5 ? `${hundreds}xx` : "5xx";
}

/**
 * Two-character country from CF-IPCountry, upper-case; 'XX' when the header is
 * missing or malformed, or when the request did not come through Cloudflare
 * (any host but www/apex), where a client could send anything.
 */
export function countryOf(header: string | undefined, host: HostGroup): string {
  if (host !== "www" && host !== "apex") return UNKNOWN_COUNTRY;
  const value = header?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{2}$/.test(value) ? value : UNKNOWN_COUNTRY;
}

const BOT_UA =
  /bot|crawl|spider|slurp|scrap|headless|lighthouse|pingdom|gtmetrix|monitor|uptime|preview|externalhit|embedly|curl\/|wget|python|go-http|java\/|okhttp|libwww|httpclient|axios|node-fetch|undici|postman/i;

/** Coarse bot flag from the user agent; an empty or missing one counts as a bot. */
export function isBotUserAgent(userAgent: string | undefined): boolean {
  const ua = userAgent?.trim() ?? "";
  return ua === "" || BOT_UA.test(ua);
}

/** classifyPath() (ANL-05); the middleware adds `health` for the probe paths. */
export function requestPathGroup(pathname: string): string {
  return classifyPath(pathname);
}

const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDay(date);
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

/** One request as the middleware sees it. */
export interface RequestObservation {
  /** The Host header, raw. */
  host: string | undefined;
  /** The URL path without query or hash. */
  path: string;
  /** Overrides the group derived from `path` (the platform probes). */
  pathGroup?: string;
  status: number;
  /** The CF-IPCountry header, raw. */
  country?: string;
  /** The User-Agent header, raw; only the bot flag is kept. */
  userAgent?: string;
  /** Time the origin took to produce the response. */
  ms: number;
}

/** A row of request_daily_stats. */
export interface StatsRow {
  day: string;
  host: string;
  pathGroup: string;
  statusClass: string;
  country: string;
  isBot: boolean;
  requests: number;
  originMsSum: number;
}

/** Where flushed rows go. The Postgres sink adds to existing rows. */
export interface StatsSink {
  /** Adds `rows` to the stored counts (upsert that sums). */
  upsert(rows: readonly StatsRow[]): Promise<void>;
  /** Deletes every row with `day` earlier than `before` (YYYY-MM-DD). */
  purge(before: string): Promise<void>;
  /** Releases the connection (shutdown). */
  close?(): Promise<void>;
}

export interface RequestStatsOptions {
  sink: StatsSink;
  now?: () => Date;
  maxKeys?: number;
  flushIntervalMs?: number;
  retentionDays?: number;
  chunkRows?: number;
  closeTimeoutMs?: number;
}

export interface FlushResult {
  ok: boolean;
  /** Rows written by this flush. */
  rows: number;
  /** Requests those rows carried. */
  requests: number;
}

export interface RequestStats {
  record(observation: RequestObservation): void;
  /** Writes the buffer; concurrent calls share one run. Never rejects. */
  flush(reason?: string): Promise<FlushResult>;
  /** Starts the periodic flush (unref'd timer). */
  start(): void;
  /** Stops the timer, flushes once more (bounded wait) and closes the sink. */
  close(reason?: string): Promise<void>;
  /** The buffered rows, for tests and diagnostics (never leaves the process). */
  snapshot(): StatsRow[];
  /** New keys refused because the buffer was full, since the start. */
  dropped(): number;
}

interface Cell {
  row: StatsRow;
  /** Fractional milliseconds; rounded when the row is written. */
  ms: number;
}

const keyOf = (r: Omit<StatsRow, "requests" | "originMsSum">): string =>
  [r.day, r.host, r.pathGroup, r.statusClass, r.country, r.isBot ? 1 : 0].join(
    "|",
  );

export function createRequestStats({
  sink,
  now = () => new Date(),
  maxKeys = MAX_KEYS,
  flushIntervalMs = FLUSH_INTERVAL_MS,
  retentionDays = RETENTION_DAYS,
  chunkRows = FLUSH_CHUNK_ROWS,
  closeTimeoutMs = CLOSE_TIMEOUT_MS,
}: RequestStatsOptions): RequestStats {
  let buffer = new Map<string, Cell>();
  let inflight: Promise<FlushResult> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastPurgeDay = "";
  let dropped = 0;
  let closed = false;

  function add(cell: Cell): void {
    const key = keyOf(cell.row);
    const existing = buffer.get(key);
    if (existing) {
      existing.row.requests += cell.row.requests;
      existing.ms += cell.ms;
    } else if (buffer.size < maxKeys) {
      buffer.set(key, cell);
    } else {
      dropped += cell.row.requests;
    }
  }

  function record(o: RequestObservation): void {
    if (closed) return;
    const host = hostGroup(o.host);
    add({
      row: {
        day: utcDay(now()),
        host,
        pathGroup: o.pathGroup ?? requestPathGroup(o.path),
        statusClass: statusClass(o.status),
        country: countryOf(o.country, host),
        isBot: isBotUserAgent(o.userAgent),
        requests: 1,
        originMsSum: 0,
      },
      ms: Number.isFinite(o.ms) && o.ms > 0 ? o.ms : 0,
    });
  }

  async function run(reason: string): Promise<FlushResult> {
    const today = utcDay(now());
    const purgeDue = lastPurgeDay !== today;
    if (buffer.size === 0 && !purgeDue)
      return { ok: true, rows: 0, requests: 0 };

    // Swap first: requests arriving during the write go to the new buffer.
    const taken = [...buffer.values()];
    buffer = new Map();
    const rows: StatsRow[] = taken.map((c) => ({
      ...c.row,
      originMsSum: Math.round(c.ms),
    }));
    const requests = rows.reduce((n, r) => n + r.requests, 0);

    let written = 0;
    let ok = true;
    for (let i = 0; i < rows.length; i += chunkRows) {
      try {
        await sink.upsert(rows.slice(i, i + chunkRows));
        written = Math.min(rows.length, i + chunkRows);
      } catch (error) {
        ok = false;
        // Put back what was not written: this chunk and every later one.
        for (const cell of taken.slice(i)) add(cell);
        log("error", "request_stats flush failed", {
          reason,
          rows: rows.length - i,
          buffered: buffer.size,
          dropped,
          ...errorFields(error),
        });
        break;
      }
    }

    if (purgeDue && ok) {
      try {
        await sink.purge(addDays(today, -retentionDays));
        lastPurgeDay = today;
      } catch (error) {
        log("warn", "request_stats purge failed", errorFields(error));
      }
    }

    const writtenRequests = rows
      .slice(0, written)
      .reduce((n, r) => n + r.requests, 0);
    if (ok) {
      // Shutdown is the line the deploy check looks for; the minute timer is quiet.
      log(reason === "interval" ? "debug" : "info", "request_stats flush", {
        reason,
        rows: written,
        requests: writtenRequests,
        dropped,
      });
    }
    return { ok, rows: written, requests: ok ? requests : writtenRequests };
  }

  function flush(reason = "interval"): Promise<FlushResult> {
    if (inflight) return inflight;
    const current = run(reason)
      .catch((error): FlushResult => {
        log("error", "request_stats flush failed", {
          reason,
          ...errorFields(error),
        });
        return { ok: false, rows: 0, requests: 0 };
      })
      .finally(() => {
        if (inflight === current) inflight = undefined;
      });
    inflight = current;
    return current;
  }

  return {
    record,
    flush,
    snapshot: () =>
      [...buffer.values()].map((c) => ({
        ...c.row,
        originMsSum: Math.round(c.ms),
      })),
    dropped: () => dropped,
    start() {
      if (timer || closed) return;
      timer = setInterval(() => void flush("interval"), flushIntervalMs);
      (timer as { unref?: () => void }).unref?.();
    },
    async close(reason = "shutdown") {
      if (closed) return;
      if (timer) clearInterval(timer);
      timer = undefined;
      // A flush in progress must finish first, then one more for what
      // arrived meanwhile; both bounded so shutdown never hangs on the DB.
      const final = (async () => {
        if (inflight) await inflight;
        await flush(reason);
      })();
      let cutoff: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<"timeout">((resolve) => {
        cutoff = setTimeout(() => resolve("timeout"), closeTimeoutMs);
      });
      const outcome = await Promise.race([final.then(() => "done"), timedOut]);
      clearTimeout(cutoff);
      closed = true;
      if (outcome === "timeout") {
        log("warn", "request_stats flush timed out", {
          reason,
          afterMs: closeTimeoutMs,
          buffered: buffer.size,
        });
      }
      await sink.close?.().catch(() => {});
    },
  };
}

// ---------------------------------------------------------------------------
// Hono middleware
// ---------------------------------------------------------------------------

/**
 * Counts every response, whatever produced it (site, API, redirect, 404,
 * error envelope). `healthPaths` (the platform probes) count under
 * `health`, not `other`. The count is taken after the handler chain, so the
 * status is the final one; `ms` is the origin time up to the response being
 * ready (the body may still stream).
 */
export function requestStatsMiddleware(
  stats: Pick<RequestStats, "record">,
  { healthPaths = [] }: { healthPaths?: readonly string[] } = {},
): MiddlewareHandler {
  const health = new Set(healthPaths);
  return async (c, next) => {
    const started = performance.now();
    try {
      await next();
    } finally {
      try {
        stats.record({
          host: c.req.header("host"),
          path: c.req.path,
          pathGroup: health.has(c.req.path) ? HEALTH_GROUP : undefined,
          status: c.res.status,
          country: c.req.header("cf-ipcountry"),
          userAgent: c.req.header("user-agent"),
          ms: performance.now() - started,
        });
      } catch {
        // Statistics must never break a response.
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Postgres sink and environment wiring
// ---------------------------------------------------------------------------

// Any drizzle Postgres database (postgres-js in production, PGlite in tests).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatsDb = PgDatabase<any, any, any>;

/** The sink over a drizzle database; `close` releases the underlying client. */
export function createPgSink(
  db: StatsDb,
  close?: () => Promise<void>,
): StatsSink {
  const t = requestDailyStats;
  return {
    async upsert(rows) {
      if (rows.length === 0) return;
      await db
        .insert(t)
        .values([...rows])
        .onConflictDoUpdate({
          target: [
            t.day,
            t.host,
            t.pathGroup,
            t.statusClass,
            t.country,
            t.isBot,
          ],
          set: {
            requests: sql`${t.requests} + excluded.requests`,
            originMsSum: sql`${t.originMsSum} + excluded.origin_ms_sum`,
          },
        });
    },
    async purge(before) {
      await db.delete(t).where(lt(t.day, before));
    },
    close,
  };
}

/** REQUEST_STATS_ENABLED=1 (exactly), nothing else counts as on. */
export function requestStatsEnabled(env: Env = process.env): boolean {
  return env.REQUEST_STATS_ENABLED?.trim() === "1";
}

/**
 * The started aggregator for this environment, or null when it is off or
 * cannot be set up (a missing or refused PG_STATS_URL logs and disables it;
 * the site keeps serving). The pool is lazy: nothing connects until the
 * first flush.
 *
 * Outside production the local-DB guard applies, as for every local tool
 * (BE-04): a dev server never writes statistics into a remote database.
 */
export function createRequestStatsFromEnv(
  env: Env = process.env,
): RequestStats | null {
  if (!requestStatsEnabled(env)) return null;
  const url = env.PG_STATS_URL?.trim();
  if (!url) {
    log("warn", "request_stats disabled: PG_STATS_URL is not set");
    return null;
  }
  try {
    if (env.NODE_ENV !== "production") {
      assertNonProdDb(url, {
        allowProd: prodOverrideRequested(process.argv, env),
      });
    }
    const { options, summary } = clientConfig(url, env);
    const client = postgres(url, {
      ...options,
      max: 1,
      connection: {
        ...options.connection,
        application_name: STATS_APPLICATION_NAME,
      },
    });
    const stats = createRequestStats({
      sink: createPgSink(drizzle(client), () => client.end({ timeout: 3 })),
    });
    stats.start();
    log("info", "request_stats enabled", {
      flushIntervalMs: FLUSH_INTERVAL_MS,
      ssl: summary.ssl,
    });
    return stats;
  } catch (error) {
    log("error", "request_stats disabled: setup failed", errorFields(error));
    return null;
  }
}
