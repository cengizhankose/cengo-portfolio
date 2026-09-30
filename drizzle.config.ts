import { defineConfig } from "drizzle-kit";
import { assertNonProdDb } from "./src/db/guard";

// drizzle-kit is a local tool. `generate` / `check` only diff the schema
// against the migration files and never connect; every other command
// (migrate, studio, push, pull) talks to the database and must pass the
// local-DB guard (BE-04 / SEC-06). Production migrations run only at deploy
// (src/db/migrate.ts in the image start command, BE-14), never from a laptop.
//
// URL (SEC-14): PG_MIGRATE_URL (a role allowed to run DDL, i.e. the table
// owner; a direct session, not a pooler) first, then PG_CONNECTION_URL, the
// same order as src/db/migrate.ts. In production PG_CONNECTION_URL is the
// SELECT-only reader role, which cannot migrate.
const url =
  process.env.PG_MIGRATE_URL?.trim() ||
  process.env.PG_CONNECTION_URL?.trim() ||
  undefined;
const offline =
  process.argv.includes("generate") || process.argv.includes("check");
if (!offline) assertNonProdDb(url);

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: url!,
  },
});
