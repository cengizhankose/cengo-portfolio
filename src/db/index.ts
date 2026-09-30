// Process-wide database client of the runtime. Imported only by entry points
// (server.ts, src/api/index.ts); everything else receives `db` or a query object.
//
// SEC-14 (K-01 = A): the runtime only reads. Its one client connects with
// PG_CONNECTION_URL, which in production is the SELECT-only
// `portfolio_reader` role (scripts/sql/least-privilege.sql), and every session
// starts with default_transaction_read_only, so a write fails even where the
// role's grants are not in place yet. There is no write client here: the
// writer role belongs to the publish CLI (scripts/content/publish-post.ts)
// and the owner role to migrations (PG_MIGRATE_URL, src/db/migrate.ts).
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { clientConfig } from "./config";

const connectionString = process.env.PG_CONNECTION_URL;

if (!connectionString) {
  throw new Error("PG_CONNECTION_URL environment variable is not set");
}

// Throws on an unsafe TLS setup in production before any connection exists (SEC-22).
const { options, summary } = clientConfig(connectionString);

/** postgres.js pool with read-only sessions; lazy, so nothing connects until the first query. */
export const readClient = postgres(connectionString, {
  ...options,
  connection: { ...options.connection, default_transaction_read_only: true },
});

/** Drizzle over the read-only client: the runtime's only database handle. */
export const dbRead = drizzle(readClient, { schema });

/** @deprecated The same read-only pool as `readClient`. */
export const client = readClient;

/** @deprecated The same read-only handle as `dbRead`; server.ts and src/api/index.ts still import this name. */
export const db = dbRead;

/** Pool size and TLS mode for the startup log line (no URL). */
export const dbSummary = summary;

/** Graceful shutdown (BE-21): lets in-flight queries finish for up to `timeoutS` seconds. */
export const closeDb = (timeoutS = 5): Promise<void> =>
  readClient.end({ timeout: timeoutS });
