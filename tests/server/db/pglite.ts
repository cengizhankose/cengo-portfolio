// In-process Postgres for server tests (no Docker, no network): PGlite with the
// real migration files applied, so queries run against the production schema.
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../../src/db/schema";

export const REPO_ROOT = join(import.meta.dir, "../../..");
const MIGRATIONS = join(REPO_ROOT, "src/db/migrations");

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, client, close: () => client.close() };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];
