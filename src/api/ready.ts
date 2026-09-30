// Readiness (BE-20): `/health` stays a constant liveness answer; `/ready`
// asks the portfolio database (`select 1`, 2 s budget in queries.ping) and
// reports build metadata. It measures only this app's database, never Umami
// (T-13). 503 once a graceful shutdown has started (BE-21).
import type { Handler } from "hono";
import type { PostQueries } from "../db/queries/posts";
import type { BuildInfo } from "./build-info";
import { errorFields, log } from "./log";
import type { AppEnv } from "./types";

const NO_STORE = { "Cache-Control": "no-store" };

export interface ReadyOptions {
  queries: Pick<PostQueries, "ping">;
  buildInfo: BuildInfo;
  isShuttingDown: () => boolean;
}

export function readyHandler({
  queries,
  buildInfo,
  isShuttingDown,
}: ReadyOptions): Handler<AppEnv> {
  return async (c) => {
    if (isShuttingDown()) {
      return c.json(
        { status: "not_ready", db: "skipped", reason: "shutting_down" },
        503,
        NO_STORE,
      );
    }
    try {
      await queries.ping();
    } catch (error) {
      log("warn", "ready check failed", {
        reqId: c.get("requestId"),
        ...errorFields(error),
      });
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
