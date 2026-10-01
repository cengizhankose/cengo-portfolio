// Readiness (BE-20): `/health` stays a constant liveness answer; `/ready`
// asks the portfolio database (`select 1`, 2 s budget in queries.ping) and
// reports build metadata. It measures only this app's database, never Umami
// (T-13). 503 once a graceful shutdown has started (BE-21).
//
// /ready is anonymous, so the ping is single-flight and its answer is kept for
// a short time: any number of concurrent requests share one `select 1`, and a
// flood cannot take more than one pool connection per window. A failure is
// kept for the same window, never longer, so recovery shows within it.
import type { Handler } from "hono";
import type { PostQueries } from "../db/queries/posts";
import type { BuildInfo } from "./build-info";
import { errorFields, log } from "./log";
import type { AppEnv } from "./types";

const NO_STORE = { "Cache-Control": "no-store" };

/** How long a finished ping (ok or failed) answers further /ready calls. */
export const READY_CACHE_TTL_MS = 1500;

export interface ReadyOptions {
  queries: Pick<PostQueries, "ping">;
  buildInfo: BuildInfo;
  isShuttingDown: () => boolean;
  /** Window a ping result is reused for; 0 turns the cache off. */
  cacheTtlMs?: number;
  /** Clock, for tests. */
  now?: () => number;
}

export function readyHandler({
  queries,
  buildInfo,
  isShuttingDown,
  cacheTtlMs = READY_CACHE_TTL_MS,
  now = Date.now,
}: ReadyOptions): Handler<AppEnv> {
  let inflight: Promise<boolean> | null = null;
  let last: { ok: boolean; at: number } | null = null;

  // true = the database answered. One ping at a time; the first caller's
  // request id goes on the failure log line.
  const databaseUp = (reqId: string | undefined): Promise<boolean> => {
    if (last && now() - last.at < cacheTtlMs) return Promise.resolve(last.ok);
    if (inflight) return inflight;
    inflight = (async () => {
      let ok = true;
      try {
        await queries.ping();
      } catch (error) {
        ok = false;
        log("warn", "ready check failed", { reqId, ...errorFields(error) });
      }
      last = { ok, at: now() };
      return ok;
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  };

  return async (c) => {
    if (isShuttingDown()) {
      return c.json(
        { status: "not_ready", db: "skipped", reason: "shutting_down" },
        503,
        NO_STORE,
      );
    }
    if (!(await databaseUp(c.get("requestId")))) {
      return c.json({ status: "not_ready", db: "error" }, 503, NO_STORE);
    }
    return c.json(
      {
        status: "ready",
        db: "ok",
        commit: buildInfo.commit,
        buildTime: buildInfo.buildTime,
        uptimeS: Math.round(process.uptime()),
      },
      200,
      NO_STORE,
    );
  };
}
