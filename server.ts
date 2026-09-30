// Production entry point (BE-09): one Bun process serves the site and the
// read-only API built by createApp(), and shuts down gracefully (BE-21).
// Configuration errors (missing PG_CONNECTION_URL, unsafe DB TLS in
// production, SEC-22) stop the process before it listens.
import { join } from "node:path";
import { createApp, portFromEnv } from "./src/api/app";
import { readBuildInfo } from "./src/api/build-info";
import { log } from "./src/api/log";
import { createShutdown } from "./src/api/shutdown";
import { closeDb, db, dbSummary } from "./src/db";
import { createPostQueries } from "./src/db/queries/posts";

log(dbSummary.ssl === "require" ? "warn" : "info", "db configured", dbSummary);

// T-06: one query object; the server-side head injection (SEO-01) gets the same instance.
const queries = createPostQueries(db);

let server: ReturnType<typeof Bun.serve> | undefined;

const lifecycle = createShutdown({
  stopServer: async () => {
    await server?.stop(); // refuses new connections, waits for in-flight requests
  },
  closeDb: () => closeDb(5),
  exit: (code) => process.exit(code),
});

export const isShuttingDown = lifecycle.isShuttingDown;

const app = createApp({
  queries,
  serveSpa: true,
  distDir: join(import.meta.dir, "dist"),
  buildInfo: await readBuildInfo(join(import.meta.dir, "build-info.json")),
  isShuttingDown,
});

server = Bun.serve({
  fetch: app.fetch,
  port: portFromEnv(process.env.PORT, 3000),
});
log("info", "server started", { port: server.port });

// Registering the handlers also matters for PID 1 in the container, which
// ignores SIGTERM without one (Dockerfile CMD keeps bun as PID 1).
process.on("SIGTERM", () => void lifecycle.shutdown("SIGTERM"));
process.on("SIGINT", () => void lifecycle.shutdown("SIGINT"));
