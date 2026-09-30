import { defineConfig } from "drizzle-kit";
import { assertNonProdDb } from "./src/db/guard";

// `generate` / `check` only diff the schema against the migration files and
// never connect; every other drizzle-kit command (migrate, studio, push, pull)
// talks to the database and must pass the local-DB guard (BE-04 / SEC-06).
// Production migrations: `outplane env run --app <app> -- env ALLOW_REMOTE_DB=1 bun run db:migrate`.
const offline =
  process.argv.includes("generate") || process.argv.includes("check");
if (!offline) assertNonProdDb(process.env.PG_CONNECTION_URL);

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.PG_CONNECTION_URL!,
  },
});
