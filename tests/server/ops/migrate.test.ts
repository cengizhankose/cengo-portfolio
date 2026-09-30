// BE-14: migrations run at deploy (src/db/migrate.ts), before the server.
// postgres.js talks over TCP to an in-process PGlite (pglite-wire.ts): no
// Docker, no network. The key runs spawn the CLI exactly as the image starts
// it (exit code + stdout); the other scenarios call its main() in-process.
// Criteria that need the real managed Postgres (lock contention between two
// sessions, the prod row count after the deploy) stay with the owner.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireLock,
  baselineSql,
  DDL_LOCK_TIMEOUT_MS,
  failureFields,
  journal,
  MIGRATION_APPLICATION_NAME,
  MIGRATION_LOCK_KEY,
  MigrationError,
  main,
  migrationUrl,
  runMigrations,
} from "../../../src/db/migrate";
import { captureLogs, REPO_ROOT } from "../helpers";
import { startPgliteWire, type PgliteWire } from "./pglite-wire";

const MIGRATIONS = join(REPO_ROOT, "src/db/migrations");
const JOURNAL_ENTRIES = (
  (await Bun.file(join(MIGRATIONS, "meta/_journal.json")).json()) as {
    entries: unknown[];
  }
).entries.length;
const SQL_0000 = await Bun.file(
  join(MIGRATIONS, "0000_nasty_mentor.sql"),
).text();
const REMOTE_URL =
  "postgres://someuser:not-a-real-secret@db.prod.invalid:5432/portfolio";

type LogLine = Record<string, unknown>;

async function runCli(env: Record<string, string>, args: string[] = []) {
  const proc = Bun.spawn([process.execPath, "src/db/migrate.ts", ...args], {
    cwd: REPO_ROOT,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const lines: LogLine[] = stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as LogLine;
      } catch {
        return { raw: line };
      }
    });
  return { code, output: stdout + stderr, lines };
}

/** The CLI's main() in this process: same code path, no process start-up. */
async function runMain(env: Record<string, string>, args: string[] = []) {
  const { result: code, lines } = await captureLogs(() =>
    main(["bun", "src/db/migrate.ts", ...args], env),
  );
  return { code, lines, output: JSON.stringify(lines) };
}

const line = (lines: LogLine[], msg: string) =>
  lines.find((l) => l.msg === msg);

let wire: PgliteWire;

beforeAll(async () => {
  wire = await startPgliteWire();
});

afterAll(async () => {
  await wire?.close();
});

async function resetDatabase() {
  await wire.db.exec(`
    drop schema if exists drizzle cascade;
    drop schema public cascade;
    create schema public;`);
}

async function scalar<T>(query: string): Promise<T> {
  const { rows } = await wire.db.query<{ v: T }>(query);
  return rows[0].v;
}

const recordedMigrations = () =>
  scalar<number>("select count(*)::int as v from drizzle.__drizzle_migrations");
const advisoryLocks = () =>
  scalar<number>(
    `select count(*)::int as v from pg_locks where locktype = 'advisory' and objid = ${MIGRATION_LOCK_KEY}`,
  );
const hasColumn = (column: string) =>
  scalar<boolean>(
    `select exists (select 1 from information_schema.columns where table_name = 'posts' and column_name = '${column}') as v`,
  );

const localEnv = () => ({
  PG_CONNECTION_URL: wire.url,
  PG_SSL_MODE: "disable",
});

describe("bun src/db/migrate.ts on an empty database", () => {
  beforeAll(resetDatabase);

  test("applies every migration, exit 0, one 'migrations applied' line", async () => {
    const { code, lines, output } = await runCli(localEnv());
    expect(code).toBe(0);
    expect(line(lines, "migrations applied")).toMatchObject({
      level: "info",
      applied: JOURNAL_ENTRIES,
      recorded: JOURNAL_ENTRIES,
      journal: JOURNAL_ENTRIES,
    });
    // Owner criterion 4, locally: recorded rows == `jq '.entries|length' _journal.json`.
    expect(await recordedMigrations()).toBe(JOURNAL_ENTRIES);
    expect(await hasColumn("lang")).toBe(true);
    // Session lock released, connection details never logged.
    expect(await advisoryLocks()).toBe(0);
    expect(output).not.toContain(String(wire.port));
    expect(output).not.toContain("postgres://");
  });

  test("a second run is a no-op: exit 0, applied 0, row count unchanged (criterion 2)", async () => {
    const before = await recordedMigrations();
    const { code, lines } = await runMain(localEnv());
    expect(code).toBe(0);
    expect(line(lines, "migrations applied")).toMatchObject({
      applied: 0,
      recorded: before,
    });
    expect(await recordedMigrations()).toBe(before);
  });

  test("the image's mode (NODE_ENV=production, compose db without TLS) migrates too", async () => {
    const { code, lines } = await runMain({
      ...localEnv(),
      NODE_ENV: "production",
    });
    expect(code).toBe(0);
    expect(line(lines, "migrations applied")).toMatchObject({ applied: 0 });
  });

  test("PG_MIGRATE_URL (DDL role, SEC-14) wins over PG_CONNECTION_URL", async () => {
    // Were PG_CONNECTION_URL used, the local guard would refuse this remote URL.
    const { code, lines } = await runMain({
      PG_CONNECTION_URL: REMOTE_URL,
      PG_MIGRATE_URL: wire.url,
      PG_SSL_MODE: "disable",
    });
    expect(code).toBe(0);
    expect(line(lines, "migrations applied")).toBeDefined();
  });
});

describe("a database built with drizzle-kit push (no migrations table)", () => {
  beforeAll(async () => {
    await resetDatabase();
    await wire.db.exec(SQL_0000);
    await wire.db.exec(`
      insert into posts (slug, title, content, published, created_at)
      values ('canli-yazi', 'Canlı yazı', 'x', true, '2026-01-02 03:04:05');`);
  });

  test("is refused with the baseline SQL; nothing is changed and the server would not start", async () => {
    const { code, lines } = await runCli(localEnv());
    expect(code).toBe(1);
    const failed = line(lines, "migrations failed");
    expect(failed).toMatchObject({ level: "error", errName: "MigrationError" });
    expect(String(failed?.err)).toContain("drizzle-kit push");
    expect(String(failed?.err)).toContain(baselineSql());
    expect(line(lines, "migrations applied")).toBeUndefined();
    expect(
      await scalar<boolean>(
        "select to_regclass('drizzle.__drizzle_migrations') is null as v",
      ),
    ).toBe(true);
    expect(await hasColumn("lang")).toBe(false);
    expect(await advisoryLocks()).toBe(0);
  });

  test("after the owner's baseline the next start applies 0001 and backfills the live post (step 5, criterion 5)", async () => {
    await wire.db.exec(baselineSql());
    const { code, lines } = await runMain(localEnv());
    expect(code).toBe(0);
    expect(line(lines, "migrations applied")).toMatchObject({
      applied: JOURNAL_ENTRIES - 1,
      recorded: JOURNAL_ENTRIES,
    });
    const { rows } = await wire.db.query<{
      lang: string;
      published_at: Date | null;
      created_at: Date;
    }>(
      "select lang, published_at, created_at from posts where slug = 'canli-yazi'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].lang).toBe("tr");
    expect(rows[0].published_at).not.toBeNull();
    expect(rows[0].created_at.toISOString()).toBe("2026-01-02T03:04:05.000Z");
  });
});

describe("a wrong baseline cannot skip migrations silently", () => {
  beforeAll(async () => {
    await resetDatabase();
    await wire.db.exec(SQL_0000);
    // created_at newer than every journal entry: drizzle would skip 0001.
    await wire.db.exec(baselineSql().replace(/, \d+\);$/, ", 9999999999999);"));
  });

  test("exit 1 with the recorded/journal counts", async () => {
    const { code, lines } = await runMain(localEnv());
    expect(code).toBe(1);
    const failed = line(lines, "migrations failed");
    expect(String(failed?.err)).toContain(
      `has 1 rows but the journal has ${JOURNAL_ENTRIES}`,
    );
    expect(await hasColumn("lang")).toBe(false);
  });
});

describe("runMigrations with a custom migrations folder", () => {
  let dir: string;

  async function folder(files: Record<string, string>) {
    const path = await mkdtemp(join(dir, "m-"));
    await mkdir(join(path, "meta"));
    const tags = Object.keys(files);
    await writeFile(
      join(path, "meta/_journal.json"),
      JSON.stringify({
        version: "7",
        dialect: "postgresql",
        entries: tags.map((tag, idx) => ({
          idx,
          version: "7",
          when: 1_700_000_000_000 + idx,
          tag,
          breakpoints: true,
        })),
      }),
    );
    for (const [tag, sql] of Object.entries(files))
      await writeFile(join(path, `${tag}.sql`), sql);
    return path;
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "migrate-test-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(resetDatabase);

  test("migrations run while this session holds the advisory lock, without a statement timeout", async () => {
    const migrationsFolder = await folder({
      "0000_session_probe": `create table session_probe as
        select (select count(*)::int from pg_locks
                where locktype = 'advisory' and objid = ${MIGRATION_LOCK_KEY}) as locks,
               current_setting('statement_timeout') as statement_timeout;`,
    });
    await runMigrations(wire.url, {
      env: { PG_SSL_MODE: "disable" },
      migrationsFolder,
    });
    const { rows } = await wire.db.query<{
      locks: number;
      statement_timeout: string;
    }>("select locks, statement_timeout from session_probe");
    expect(rows[0]).toEqual({ locks: 1, statement_timeout: "0" });
    expect(await advisoryLocks()).toBe(0);
  });

  test("a failing migration rolls back completely and releases the lock", async () => {
    const migrationsFolder = await folder({
      "0000_ok": "create table first_table (id int);",
      "0001_broken":
        "create table second_table (id int);--> statement-breakpoint\nselect * from no_such_table;",
    });
    const error = await runMigrations(wire.url, {
      env: { PG_SSL_MODE: "disable" },
      migrationsFolder,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(failureFields(error)).toMatchObject({ causeCode: "42P01" });
    // One transaction for all pending migrations: nothing half-applied.
    expect(
      await scalar<boolean>("select to_regclass('first_table') is null as v"),
    ).toBe(true);
    expect(await recordedMigrations()).toBe(0);
    expect(await advisoryLocks()).toBe(0);
  });
});

describe("CLI refusals", () => {
  test("no URL -> exit 1", async () => {
    const { code, lines } = await runMain({});
    expect(code).toBe(1);
    expect(String(line(lines, "migrations failed")?.err)).toContain(
      "PG_MIGRATE_URL or PG_CONNECTION_URL must be set",
    );
  });

  test("outside production a remote database is refused by the local guard (BE-04)", async () => {
    const { code, output } = await runCli({ PG_CONNECTION_URL: REMOTE_URL });
    expect(code).toBe(1);
    expect(output).toContain("Refusing to use database");
    expect(output).not.toContain("db.prod.invalid");
    expect(output).not.toContain("not-a-real-secret");
  });

  test("in production a weak sslmode is refused before connecting (SEC-22)", async () => {
    const { code, output } = await runMain({
      NODE_ENV: "production",
      PG_CONNECTION_URL: `${REMOTE_URL}?sslmode=require`,
    });
    expect(code).toBe(1);
    expect(output).toContain("verify-full");
    expect(output).not.toContain("db.prod.invalid");
    expect(output).not.toContain("not-a-real-secret");
  });

  test("--print-baseline prints drizzle's hash and journal time of 0000, no database needed", async () => {
    const { code, output } = await runCli({}, ["--print-baseline"]);
    expect(code).toBe(0);
    const hash = new Bun.CryptoHasher("sha256").update(SQL_0000).digest("hex");
    // The owner's `shasum -a 256 src/db/migrations/0000_nasty_mentor.sql` value.
    expect(output).toContain(`values ('${hash}', 1768345364936);`);
    expect(output.trim()).toBe(baselineSql());
  });
});

describe("connection settings on the wire", () => {
  test("one session named cengo-portfolio-migrate with a DDL lock timeout, not the app's 5 s statement cap", async () => {
    let startup: Buffer | undefined;
    // Records the startup message, then answers with a FATAL ErrorResponse.
    const fields = Buffer.from("SFATAL\0C28000\0Mstartup recorded\0\0");
    const errorResponse = Buffer.alloc(5 + fields.length);
    errorResponse.write("E", 0);
    errorResponse.writeInt32BE(4 + fields.length, 1);
    fields.copy(errorResponse, 5);
    const server = createServer((socket) => {
      socket.once("data", (chunk: Buffer) => {
        startup = chunk;
        socket.end(errorResponse);
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    try {
      const error = await runMigrations(
        `postgres://u:p@127.0.0.1:${port}/portfolio_test`,
        { env: { PG_SSL_MODE: "disable" }, lock: { waitMs: 0 } },
      ).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
    } finally {
      server.close();
    }
    expect(startup).toBeDefined();
    const pairs = startup!.subarray(8).toString("utf8").split("\0");
    const params = new Map<string, string>();
    for (let i = 0; i + 1 < pairs.length; i += 2)
      if (pairs[i]) params.set(pairs[i], pairs[i + 1]);
    expect(params.get("application_name")).toBe(MIGRATION_APPLICATION_NAME);
    expect(params.has("statement_timeout")).toBe(false);
    expect(params.get("lock_timeout")).toBe(String(DDL_LOCK_TIMEOUT_MS));
  });
});

describe("acquireLock", () => {
  const clock = () => {
    let t = 0;
    return {
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    };
  };

  test("free lock: taken at once, no wait message", async () => {
    let waits = 0;
    await acquireLock(async () => true, { onWait: () => waits++, ...clock() });
    expect(waits).toBe(0);
  });

  test("held by another instance: polls, reports the wait once, then takes it", async () => {
    const answers = [false, false, true];
    let waits = 0;
    let attempts = 0;
    await acquireLock(
      async () => {
        attempts++;
        return answers.shift()!;
      },
      { pollMs: 1000, waitMs: 60_000, onWait: () => waits++, ...clock() },
    );
    expect(attempts).toBe(3);
    expect(waits).toBe(1);
  });

  test("never released: MigrationError after the wait budget", async () => {
    const c = clock();
    const error = await acquireLock(async () => false, {
      pollMs: 1000,
      waitMs: 5000,
      ...c,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MigrationError);
    expect(String((error as Error).message)).toContain(
      String(MIGRATION_LOCK_KEY),
    );
    expect(c.now()).toBe(5000);
  });
});

describe("failureFields", () => {
  test("Postgres errors keep their message and SQLSTATE, also as a drizzle cause", () => {
    const pg = Object.assign(new Error('relation "posts" already exists'), {
      name: "PostgresError",
      code: "42P07",
    });
    const wrapped = new Error('Failed query: CREATE TABLE "posts"', {
      cause: pg,
    });
    expect(failureFields(wrapped)).toEqual({
      errName: "Error",
      err: 'Failed query: CREATE TABLE "posts"',
      causeName: "PostgresError",
      causeCode: "42P07",
      cause: 'relation "posts" already exists',
    });
  });

  test("network and TLS errors log only their code (the message names the host)", () => {
    const net = Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432"), {
      code: "ECONNREFUSED",
    });
    const fields = failureFields(net);
    expect(fields).toEqual({ errName: "Error", errCode: "ECONNREFUSED" });
    expect(
      JSON.stringify(failureFields(new Error("x", { cause: net }))),
    ).not.toContain("10.1.2.3");
  });

  test("non-Error values are stringified", () => {
    expect(failureFields("boom")).toEqual({ err: "boom" });
  });
});

describe("helpers", () => {
  test("migrationUrl: PG_MIGRATE_URL, then PG_CONNECTION_URL, blanks ignored", () => {
    expect(migrationUrl({ PG_MIGRATE_URL: "a", PG_CONNECTION_URL: "b" })).toBe(
      "a",
    );
    expect(migrationUrl({ PG_MIGRATE_URL: " ", PG_CONNECTION_URL: "b" })).toBe(
      "b",
    );
    expect(migrationUrl({})).toBeUndefined();
  });

  test("journal() reads the same entries as meta/_journal.json", () => {
    expect(journal()).toHaveLength(JOURNAL_ENTRIES);
    expect(journal()[0].folderMillis).toBe(1768345364936);
  });
});
