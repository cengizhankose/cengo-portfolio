// Production entry point (BE-09): one Bun process serves the site and the
// read-only API built by createApp(), and shuts down gracefully (BE-21).
// Configuration errors (missing PG_CONNECTION_URL, unsafe DB TLS in
// production, SEC-22) stop the process before it listens.
import { join } from "node:path";
import { createApp, portFromEnv } from "./src/api/app";
import { createRequestStatsFromEnv } from "./src/server/requestStats";
import { readBuildInfo } from "./src/api/build-info";
import { driverError, serverPostQueries, warmPostCache } from "./src/api/cache";
import { errorFields, log } from "./src/api/log";
import { createShutdown } from "./src/api/shutdown";
import { closeDb, db, dbSummary } from "./src/db";
import { createPostQueries } from "./src/db/queries/posts";

log(dbSummary.ssl === "require" ? "warn" : "info", "db configured", dbSummary);

// T-06: one query object; the server-side head injection (SEO-01) gets the
// same instance. BE-06 / PERF-06: the cached wrapper, so the API, the page
// shell's post lookup and later SEO-01 read the same in-process cache.
const { queries, cached } = serverPostQueries(createPostQueries(db));

let server: ReturnType<typeof Bun.serve> | undefined;
// Startup cache warm-up (below); settles, never rejects.
let warmUp: Promise<void> = Promise.resolve();

// ANL-13: daily request aggregates; null unless REQUEST_STATS_ENABLED=1.
const requestStats = createRequestStatsFromEnv();

const lifecycle = createShutdown({
  stopServer: async () => {
    await server?.stop(); // refuses new connections, waits for in-flight requests
    await requestStats?.close("shutdown"); // writes the last counts (bounded)
  },
  closeDb: async () => {
    // postgres.js end() waits its whole timeout for a connection that is
    // still opening: let the warm-up queries settle first (they fail fast
    // when the database refuses, so a SIGTERM right after start stays quick).
    await warmUp;
    await closeDb(5);
  },
  exit: (code) => process.exit(code),
});

export const isShuttingDown = lifecycle.isShuttingDown;

const app = createApp({
  queries,
  serveSpa: true,
  distDir: join(import.meta.dir, "dist"),
  buildInfo: await readBuildInfo(join(import.meta.dir, "build-info.json")),
  isShuttingDown,
  requestStats,
});

server = Bun.serve({
  fetch: app.fetch,
  port: portFromEnv(process.env.PORT, 3000),
});
log("info", "server started", { port: server.port, postCache: cached });

// PERF-06 step 6: fill the cache for every list view and listed post in the
// background, so the first visitor after a deploy does not wait for the
// database. A failure only means the cache fills on demand.
if (cached) {
  warmUp = warmPostCache(queries).then(
    (summary) => log("info", "post cache warmed", summary),
    (error) =>
      log("warn", "post cache warm-up failed", errorFields(driverError(error))),
  );
}

// Registering the handlers also matters for PID 1 in the container, which
// ignores SIGTERM without one (Dockerfile CMD keeps bun as PID 1).
process.on("SIGTERM", () => void lifecycle.shutdown("SIGTERM"));
process.on("SIGINT", () => void lifecycle.shutdown("SIGINT"));
