// Local development API (`bun run api`, BE-09 / SEC-12): the same createApp()
// as production, without the site, listening on the loopback interface only.
// No CORS: the browser calls /api on the Vite origin and Vite proxies it here
// (vite.config.js), so there is no cross-origin request to allow.
import { createApp, portFromEnv } from "./app";
import { errorFields, log } from "./log";
import { assertNonProdDb } from "../db/guard";

const HOSTNAME = "127.0.0.1";

// Refuse a non-local database before the DB module is loaded (BE-04 / SEC-06).
try {
  assertNonProdDb();
} catch (error) {
  log("error", "api refused to start", errorFields(error));
  process.exit(1);
}

try {
  const { db, dbSummary } = await import("../db");
  const { createPostQueries } = await import("../db/queries/posts");
  const app = createApp({ queries: createPostQueries(db), serveSpa: false });
  const server = Bun.serve({
    fetch: app.fetch,
    hostname: HOSTNAME,
    port: portFromEnv(process.env.PORT, 3001),
  });
  log("info", "db configured", dbSummary);
  log("info", "api started", { hostname: HOSTNAME, port: server.port });
} catch (error) {
  log("error", "api failed to start", errorFields(error));
  process.exit(1);
}
