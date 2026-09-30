// One JSON line per request (BE-08): ts, level, msg, reqId, method, path,
// status, durMs. `c.req.path` carries no query string; IPs, headers and
// cookies are never logged.
import type { MiddlewareHandler } from "hono";
import { log } from "../log";
import type { AppEnv } from "../types";

const MAX_LOGGED_PATH = 512;

export interface RequestLoggerOptions {
  /** Probe paths (platform health checks) logged at `debug` so they do not flood `info`. */
  quietPaths?: readonly string[];
}

export function requestLogger({
  quietPaths = [],
}: RequestLoggerOptions = {}): MiddlewareHandler<AppEnv> {
  const quiet = new Set(quietPaths);
  return async (c, next) => {
    const start = performance.now();
    let failed = false;
    try {
      await next();
    } catch (error) {
      failed = true; // normally onError turns errors into c.res; log and rethrow otherwise
      throw error;
    } finally {
      log(quiet.has(c.req.path) ? "debug" : "info", "request", {
        reqId: c.get("requestId"),
        method: c.req.method,
        path: c.req.path.slice(0, MAX_LOGGED_PATH),
        status: failed ? 500 : c.res.status,
        durMs: Math.round(performance.now() - start),
      });
    }
  };
}
