// In-process Postgres for server tests (no Docker, no network): PGlite with the
// real migration files applied, so queries run against the production schema.
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../../src/db/schema";

export const REPO_ROOT = join(import.meta.dir, "../../..");
export const MIGRATIONS = join(REPO_ROOT, "src/db/migrations");

/** Exactly the production schema (every migration, nothing added). Use this in new tests. */
export async function createStrictTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, client, close: () => client.close() };
}

/**
 * Production schema plus a test-only `DEFAULT 'tr'` on posts.lang.
 *
 * TEMPORARY compatibility for tests written before migration 0001 made `lang`
 * mandatory (tests/server/security/posts-read.test.ts and
 * write-surface.test.ts insert posts without `lang`; they are outside the
 * W2-BE-app-factory file scope). Handoff: add `lang` to those inserts, then
 * make this an alias of createStrictTestDb. Production has no default: a post
 * without a language is rejected (BE-19 / T-12).
 */
export async function createTestDb() {
  const ctx = await createStrictTestDb();
  await ctx.client.exec(`ALTER TABLE "posts" ALTER COLUMN "lang" SET DEFAULT 'tr'`);
  return ctx;
}

export type TestDb = Awaited<ReturnType<typeof createStrictTestDb>>["db"];
