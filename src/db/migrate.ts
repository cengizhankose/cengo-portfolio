// Migrations at deploy time (BE-14). The production image starts with
//   sh -c "bun run src/db/migrate.ts && exec bun run server.ts"
// so the server never runs against a schema it does not expect: a failed
// migration exits 1, the new release never becomes ready and the previous
// one keeps serving. Nobody migrates production from a laptop.
//
// - drizzle's postgres-js migrator applies src/db/migrations in journal order
//   and records them in drizzle.__drizzle_migrations; a second run is a no-op.
// - A session advisory lock serialises concurrent starts (two instances of a
//   rolling or doubled deploy, BE-29): the second waits, then has nothing to do.
// - A database built with `drizzle-kit push` (posts table, no or an empty
//   migrations table) is refused with the baseline SQL, instead of
//   crash-looping on CREATE TABLE "posts" (BE-14 step 4).
// - After migrating, the recorded count must reach the journal length; a
//   baseline with the wrong created_at would otherwise skip migrations silently.
//
// Connection: PG_MIGRATE_URL (a role allowed to run DDL, SEC-14), else
// PG_CONNECTION_URL; a direct session, not a transaction pooler (the lock and
// the session settings are per session). TLS follows the server's policy
// (clientConfig: verify-full in production, SEC-22). Outside production the
// local-DB guard applies (BE-04): `bun run db:migrate` touches only localhost
// *_dev / *_test databases unless --prod or ALLOW_REMOTE_DB=1 is given.
// Log lines are JSON (BE-08) and never contain the URL, the host or credentials.
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { join } from "node:path";
import postgres from "postgres";
import { log } from "../api/log";
import { clientConfig } from "./config";
import { assertNonProdDb, prodOverrideRequested } from "./guard";

type Env = Record<string, string | undefined>;

export const MIGRATIONS_FOLDER = join(import.meta.dir, "migrations");
/** Advisory lock key shared by every instance of this app (any constant works, it only has to be the same). */
export const MIGRATION_LOCK_KEY = 7263001;
/** How long a starting instance waits for another one's migration run. */
export const LOCK_WAIT_MS = 5 * 60_000;
export const LOCK_POLL_MS = 1000;
/** DDL waits at most this long for a table lock, so it never queues reads behind it for long. */
export const DDL_LOCK_TIMEOUT_MS = 15_000;
export const MIGRATION_APPLICATION_NAME = "cengo-portfolio-migrate";

/** Our own failures: their messages are written for the log and carry no connection details. */
export class MigrationError extends Error {
  override name = "MigrationError";
}

/** The URL migrations use: PG_MIGRATE_URL first (DDL role), then PG_CONNECTION_URL. */
export function migrationUrl(env: Env = process.env): string | undefined {
  return (
    env.PG_MIGRATE_URL?.trim() || env.PG_CONNECTION_URL?.trim() || undefined
  );
}

export function journal(migrationsFolder = MIGRATIONS_FOLDER): MigrationMeta[] {
  return readMigrationFiles({ migrationsFolder });
}

/**
 * One-off SQL that marks the first migration as applied on a database whose
 * schema was created with `drizzle-kit push` (BE-14 step 4). The hash is
 * drizzle's own (sha256 of the SQL file), created_at the journal's `when`.
 */
export function baselineSql(migrationsFolder = MIGRATIONS_FOLDER): string {
  const [first] = journal(migrationsFolder);
  if (!first) throw new MigrationError("no migrations found");
  return [
    "create schema if not exists drizzle;",
    "create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint);",
    `insert into drizzle.__drizzle_migrations (hash, created_at) values ('${first.hash}', ${first.folderMillis});`,
  ].join("\n");
}

export interface LockWaitOptions {
  waitMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<unknown>;
  now?: () => number;
  /** Called once, when the first attempt finds the lock taken. */
  onWait?: () => void;
}

/** Polls `tryLock` until it succeeds; throws once `waitMs` has passed. */
export async function acquireLock(
  tryLock: () => Promise<boolean>,
  {
    waitMs = LOCK_WAIT_MS,
    pollMs = LOCK_POLL_MS,
    sleep = (ms) => Bun.sleep(ms),
    now = Date.now,
    onWait,
  }: LockWaitOptions = {},
): Promise<void> {
  const deadline = now() + waitMs;
  let waited = false;
  while (!(await tryLock())) {
    if (!waited) {
      waited = true;
      onWait?.();
    }
    if (now() >= deadline) {
      throw new MigrationError(
        `migration lock ${MIGRATION_LOCK_KEY} still held after ${Math.round(waitMs / 1000)} s; ` +
          "another instance may be stuck mid-migration",
      );
    }
    await sleep(pollMs);
  }
}

/**
 * Fields for the failure log line, for the error and its cause (drizzle wraps
 * driver errors as "Failed query: ..." with the real error as `cause`).
 * Messages are kept for Postgres errors and code-less errors (ours, the guard,
 * the TLS policy); network and TLS errors carry a code and often name the
 * host in their message, so only their code is logged. So are Postgres
 * authorization errors (SQLSTATE class 28), whose message names the role.
 */
export function failureFields(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { err: String(error) };
  const describe = (e: Error, key: "err" | "cause") => {
    const code = (e as { code?: unknown }).code;
    const hasCode = typeof code === "string";
    const keepMessage =
      !hasCode || (e.name === "PostgresError" && !code.startsWith("28"));
    return {
      [`${key}Name`]: e.name,
      ...(hasCode ? { [`${key}Code`]: code } : {}),
      ...(keepMessage ? { [key]: e.message } : {}),
    };
  };
  return {
    ...describe(error, "err"),
    ...(error.cause instanceof Error ? describe(error.cause, "cause") : {}),
  };
}

export interface MigrationResult {
  /** Migrations recorded by this run. */
  applied: number;
  /** Rows in drizzle.__drizzle_migrations afterwards. */
  recorded: number;
  /** Entries in this build's journal. */
  journal: number;
  durMs: number;
}

export interface RunOptions {
  env?: Env;
  migrationsFolder?: string;
  lock?: LockWaitOptions;
}

/**
 * Applies pending migrations under the advisory lock. Throws on any problem;
 * the caller exits non-zero so the server does not start.
 */
export async function runMigrations(
  url: string,
  {
    env = process.env,
    migrationsFolder = MIGRATIONS_FOLDER,
    lock = {},
  }: RunOptions = {},
): Promise<MigrationResult> {
  const started = performance.now();
  const entries = journal(migrationsFolder).length;
  // Throws on an unsafe TLS setup in production before connecting (SEC-22).
  const { options } = clientConfig(url, env);
  // One connection: the advisory lock is held by the session that migrates.
  // Only application_name goes in the startup message; the app's 5 s
  // statement cap (BE-13) stays out, it is not for DDL.
  const sql = postgres(url, {
    ...options,
    max: 1,
    idle_timeout: 0,
    max_lifetime: null,
    onnotice: () => {},
    connection: { application_name: MIGRATION_APPLICATION_NAME },
  });

  let locked = false;
  try {
    // Session settings as SETs, not startup parameters: postgres.js drops a
    // falsy (0) startup parameter, and a pooler may reject unknown ones. No
    // statement timeout; a table lock is waited for at most 15 s, so DDL never
    // queues reads behind it for long.
    await sql`select set_config('statement_timeout', '0', false),
                     set_config('lock_timeout', ${`${DDL_LOCK_TIMEOUT_MS}ms`}, false)`;
    await acquireLock(
      async () => {
        const [row] = await sql<{ locked: boolean }[]>`
          select pg_try_advisory_lock(${MIGRATION_LOCK_KEY}::bigint) as locked`;
        return row.locked;
      },
      {
        onWait: () => log("info", "waiting for migration lock"),
        ...lock,
      },
    );
    locked = true;

    const [state] = await sql<{ journal: boolean; posts: boolean }[]>`
      select to_regclass('drizzle.__drizzle_migrations') is not null as journal,
             to_regclass('public.posts') is not null as posts`;
    const count = async () => {
      const [row] = await sql<{ n: number }[]>`
        select count(*)::int as n from drizzle.__drizzle_migrations`;
      return row.n;
    };
    const before = state.journal ? await count() : 0;
    // An empty migrations table next to posts is a half-done baseline: drizzle
    // would run 0000 and fail on CREATE TABLE "posts" without this hint.
    if (state.posts && before === 0) {
      throw new MigrationError(
        `posts exists but drizzle.__drizzle_migrations ${state.journal ? "is empty" : "does not exist"} ` +
          "(schema built with drizzle-kit push); " +
          "run this baseline once as the owner, then deploy again:\n" +
          baselineSql(migrationsFolder),
      );
    }

    await migrate(drizzle(sql), { migrationsFolder });
    const recorded = await count();

    if (recorded < entries) {
      throw new MigrationError(
        `drizzle.__drizzle_migrations has ${recorded} rows but the journal has ${entries}: ` +
          "a baseline row with a created_at newer than a pending migration makes drizzle skip it",
      );
    }
    if (recorded > entries) {
      // An older image against a newer schema (rollback): migrations are
      // expand/contract, so the old code still runs.
      log("warn", "database has migrations this build does not know", {
        recorded,
        journal: entries,
      });
    }
    return {
      applied: recorded - before,
      recorded,
      journal: entries,
      durMs: Math.round(performance.now() - started),
    };
  } finally {
    // Never let cleanup mask the real error; closing the session releases the
    // lock anyway.
    if (locked)
      await sql`select pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint)`.catch(
        () => {},
      );
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

/** CLI: `bun run src/db/migrate.ts` (the image's start command, and `bun run db:migrate`). */
export async function main(
  argv: readonly string[] = process.argv,
  env: Env = process.env,
): Promise<number> {
  if (argv.includes("--print-baseline")) {
    console.log(baselineSql());
    return 0;
  }
  try {
    const url = migrationUrl(env);
    if (!url) {
      throw new MigrationError(
        "PG_MIGRATE_URL or PG_CONNECTION_URL must be set",
      );
    }
    // In the image NODE_ENV=production and the TLS policy protects the
    // connection; locally only the dev/test database is allowed (BE-04).
    if (env.NODE_ENV !== "production")
      assertNonProdDb(url, { allowProd: prodOverrideRequested(argv, env) });
    const result = await runMigrations(url, { env });
    log("info", "migrations applied", { ...result });
    return 0;
  } catch (error) {
    log("error", "migrations failed", failureFields(error));
    return 1;
  }
}

if (import.meta.main) process.exit(await main());
