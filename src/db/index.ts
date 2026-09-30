// Process-wide database client. Imported only by entry points (server.ts,
// src/api/index.ts); everything else receives `db` or a query object.
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

/** postgres.js pool; lazy, so nothing connects until the first query. */
export const client = postgres(connectionString, options);

/**
 * The runtime only reads (K-01 = A), so the read client is the one client.
 * SEC-14 (W5) splits read and write roles; callers that only read use this name.
 */
export const readClient = client;

export const db = drizzle(client, { schema });

/** Pool size and TLS mode for the startup log line (no URL). */
export const dbSummary = summary;

/** Graceful shutdown (BE-21): lets in-flight queries finish for up to `timeoutS` seconds. */
export const closeDb = (timeoutS = 5): Promise<void> =>
  client.end({ timeout: timeoutS });
