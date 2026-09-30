// SEC-14 (K-01 = A, T-13): least-privilege roles. scripts/sql/*.sql run
// against PGlite (Postgres 18) with the production schema; the roles are
// switched with SET ROLE, which is what a login as that role would get.
// Creating the roles on the real instance, running the files there and the
// Out Plane env are owner steps.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../../src/db/schema";
import { runMigrations } from "../../../src/db/migrate";
import { roleIsElevated } from "../../../scripts/content/publish-post";
import { inCheckout } from "../helpers";
import { MIGRATIONS } from "../db/pglite";
import { startPgliteWire, type PgliteWire } from "../ops/pglite-wire";
import {
  LOCAL_URL,
  pgliteOpenDb,
  postFile,
  REPO_ROOT,
  runMain,
  tempDir,
} from "./helpers";

const LEAST_PRIVILEGE = await Bun.file(
  join(REPO_ROOT, "scripts/sql/least-privilege.sql"),
).text();
const UMAMI_ISOLATION = await Bun.file(
  join(REPO_ROOT, "scripts/sql/umami-isolation.sql"),
).text();
const ROLES = ["portfolio_reader", "portfolio_writer", "umami"];

let client: PGlite;

/** One row of a query as the given role (then back to the superuser). */
async function asRole<T>(
  role: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  if (role) await client.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await client.exec("reset role");
  }
}

const one = async (query: string) =>
  (await client.query<Record<string, unknown>>(query)).rows[0];

const errorOf = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error("expected an error");
};

beforeAll(async () => {
  client = new PGlite();
  await migrate(drizzle(client, { schema }), { migrationsFolder: MIGRATIONS });
  // Owner step 2 (roles exist before the file runs); LOGIN like on the instance.
  for (const role of ROLES) await client.exec(`create role ${role} login`);
  await client.exec("create database umami owner umami");
  await client.exec(LEAST_PRIVILEGE);
  await client.exec(UMAMI_ISOLATION);
});
afterAll(async () => {
  await client.close();
});

describe("scripts/sql/least-privilege.sql (SEC-14 criteria 1-3)", () => {
  test("reader: SELECT t, INSERT f, DELETE f", async () => {
    expect(
      await one(`select has_table_privilege('portfolio_reader','public.posts','SELECT') s,
                        has_table_privilege('portfolio_reader','public.posts','INSERT') i,
                        has_table_privilege('portfolio_reader','public.posts','DELETE') d`),
    ).toEqual({ s: true, i: false, d: false });
  });

  test("writer: INSERT t, CREATE on the database f, CREATE on schema public f", async () => {
    expect(
      await one(`select has_table_privilege('portfolio_writer','public.posts','INSERT') i,
                        has_database_privilege('portfolio_writer', current_database(), 'CREATE') dbc,
                        has_schema_privilege('portfolio_writer', 'public', 'CREATE') sc`),
    ).toEqual({ i: true, dbc: false, sc: false });
  });

  test("no role memberships and no elevated attributes", async () => {
    const members = await client.query(`
      select r.rolname, g.rolname from pg_auth_members m
        join pg_roles r on r.oid = m.member join pg_roles g on g.oid = m.roleid
       where r.rolname in ('portfolio_reader','portfolio_writer','umami')`);
    expect(members.rows).toEqual([]);
    const attributes = await client.query<{ elevated: boolean }>(`
      select rolsuper or rolcreaterole or rolcreatedb or rolbypassrls as elevated
        from pg_roles where rolname in ('portfolio_reader','portfolio_writer','umami')`);
    expect(attributes.rows).toEqual([
      { elevated: false },
      { elevated: false },
      { elevated: false },
    ]);
  });

  test("the reader can read but an INSERT is `permission denied`", async () => {
    await asRole("portfolio_reader", async () => {
      await client.query("select count(*) from posts");
      const error = await errorOf(() =>
        client.query(
          "insert into posts (slug, lang, title, content) values ('x-y', 'en', 't', 'c')",
        ),
      );
      expect(error.code).toBe("42501");
      expect(error.message).toContain("permission denied");
    });
  });

  test("the writer can do posts DML but no DDL and no TRUNCATE", async () => {
    await asRole("portfolio_writer", async () => {
      await client.query(
        "insert into posts (slug, lang, title, content) values ('w-row', 'en', 't', 'c')",
      );
      await client.query("update posts set title = 'u' where slug = 'w-row'");
      await client.query("delete from posts where slug = 'w-row'");
      for (const statement of [
        "create table evil (a int)",
        "truncate posts",
        "alter table posts add column x int",
        "drop table posts",
      ]) {
        expect((await errorOf(() => client.query(statement))).code).toBe(
          "42501",
        );
      }
    });
  });

  test("the file can run again (idempotent) and leaves the same privileges", async () => {
    await client.exec(LEAST_PRIVILEGE);
    expect(
      await one(`select has_table_privilege('portfolio_reader','public.posts','SELECT') s,
                        has_table_privilege('portfolio_writer','public.posts','UPDATE') u`),
    ).toEqual({ s: true, u: true });
  });

  test("an extra grant from the platform is removed by the next run", async () => {
    await client.exec("grant all on posts to portfolio_reader");
    await client.exec(LEAST_PRIVILEGE);
    expect(
      await one(
        `select has_table_privilege('portfolio_reader','public.posts','INSERT') i`,
      ),
    ).toEqual({ i: false });
  });

  test("the SQL files hold no passwords, URLs or hosts", () => {
    for (const text of [LEAST_PRIVILEGE, UMAMI_ISOLATION]) {
      expect(text).not.toMatch(/PASSWORD\s+'|postgres(ql)?:\/\/|\.outplane\./i);
    }
  });
});

describe("the roles are enough for their jobs", () => {
  test("the writer role publishes with the CLI (insert, update, translations) and is not flagged", async () => {
    const { dir, cleanup } = await tempDir();
    try {
      const tr = join(dir, "tr.md");
      const en = join(dir, "en.md");
      await Bun.write(
        tr,
        postFile({ slug: "role-tr", lang: "tr", translationKey: "role" }),
      );
      await Bun.write(
        en,
        postFile({ slug: "role-en", lang: "en", translationKey: "role" }),
      );
      await asRole("portfolio_writer", async () => {
        const db = drizzle(client, { schema });
        expect(await roleIsElevated(db)).toBe(false);
        for (const argv of [
          [tr, "--publish"],
          [en, "--publish"],
          [en, "--publish"],
        ]) {
          const result = await runMain(argv, {
            env: { PG_CONNECTION_URL: LOCAL_URL },
            openDb: pgliteOpenDb(client),
            git: () => null,
          });
          expect(result.stderr).toBe("");
          expect(result.code).toBe(0);
        }
      });
      await asRole("portfolio_reader", async () => {
        const verify = await runMain(["--verify"], {
          env: { PG_CONNECTION_URL: LOCAL_URL },
          contentDir: dir,
          openDb: pgliteOpenDb(client),
        });
        expect(verify.out).toEqual(["role-en ok", "role-tr ok"]);
        expect(verify.code).toBe(0);
      });
      // The superuser (the owner's situation) is flagged.
      expect(await roleIsElevated(drizzle(client, { schema }))).toBe(true);
    } finally {
      await client.exec("delete from posts where slug like 'role-%'");
      await cleanup();
    }
  });
});

describe("scripts/sql/umami-isolation.sql (SEC-14 criterion 6, T-13)", () => {
  test("umami cannot connect to the portfolio database; portfolio roles cannot connect to umami", async () => {
    expect(
      await one(`select has_database_privilege('umami', current_database(), 'CONNECT') a,
                        has_database_privilege('portfolio_reader', 'umami', 'CONNECT') b,
                        has_database_privilege('portfolio_writer', 'umami', 'CONNECT') c`),
    ).toEqual({ a: false, b: false, c: false });
  });

  test("the owners keep their own database", async () => {
    expect(
      await one(`select has_database_privilege('umami', 'umami', 'CONNECT') u`),
    ).toEqual({ u: true });
  });
});

describe("runtime reads only (SEC-14 criteria 4-5)", () => {
  let wire: PgliteWire;
  beforeAll(async () => {
    const pg = new PGlite();
    await migrate(drizzle(pg, { schema }), { migrationsFolder: MIGRATIONS });
    await pg.exec(
      "create role portfolio_reader login; create role portfolio_writer login;",
    );
    await pg.exec(LEAST_PRIVILEGE);
    wire = await startPgliteWire(pg);
  });
  afterAll(async () => {
    await wire.close();
  });

  // Async: the wire server lives in this process and must keep answering.
  const spawnBun = async (code: string, env: Record<string, string>) => {
    const proc = Bun.spawn([process.execPath, "-e", code], {
      cwd: REPO_ROOT,
      env: { PATH: process.env.PATH ?? "", ...env },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exit, out, err] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    return { code: exit, out: out.trim(), err };
  };

  test("src/db/index.ts: an INSERT through dbRead as the reader -> permission denied", async () => {
    await wire.db.exec("set role portfolio_reader");
    try {
      const result = await spawnBun(
        `const { dbRead, closeDb } = await import('./src/db/index.ts');
         const { posts } = await import('./src/db/schema');
         try {
           await dbRead.insert(posts).values({ slug: 'x-y', lang: 'en', title: 't', content: 'c' });
           console.log('inserted');
         } catch (e) { console.log(e.cause?.code ?? e.code, String(e.cause?.message ?? e.message)); }
         await closeDb(1);`,
        { PG_CONNECTION_URL: wire.url, PG_SSL_MODE: "disable" },
      );
      expect(result.out).toBe("42501 permission denied for table posts");
    } finally {
      await wire.db.exec("reset role");
    }
  });

  test("src/db/index.ts: every session starts read-only; db is the same read-only handle", async () => {
    const result = await spawnBun(
      `const m = await import('./src/db/index.ts');
       console.log(m.readClient.options.connection.default_transaction_read_only, m.db === m.dbRead, m.client === m.readClient);`,
      {
        PG_CONNECTION_URL: "postgres://u@127.0.0.1:1/portfolio_test",
        PG_SSL_MODE: "disable",
      },
    );
    expect(result.out).toBe("true true true");
  });

  test("the runtime never reads the writer URL (server.ts, src/**)", async () => {
    const hits: string[] = [];
    for (const pattern of ["server.ts", "src/**/*.{ts,tsx,js,jsx}"]) {
      for await (const file of new Glob(pattern).scan({ cwd: REPO_ROOT })) {
        if (
          (await Bun.file(join(REPO_ROOT, file)).text()).includes(
            "PG_WRITE_CONNECTION_URL",
          )
        )
          hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });

  test("migrations cannot run as the reader: PG_MIGRATE_URL is needed on every production start", async () => {
    // drizzle's migrator always runs CREATE SCHEMA IF NOT EXISTS drizzle, and
    // Postgres checks the CREATE privilege first (owner step for SEC-14).
    await runMigrations(wire.url, { env: { PG_SSL_MODE: "disable" } });
    await wire.db.exec("set role portfolio_reader");
    try {
      const error = await errorOf(() =>
        runMigrations(wire.url, { env: { PG_SSL_MODE: "disable" } }),
      );
      const cause = (error as { cause?: { code?: string } }).cause;
      expect(cause?.code ?? error.code).toBe("42501");
    } finally {
      await wire.db.exec("reset role");
    }
  });
});

describe("configuration (SEC-14 step 4)", () => {
  const spawnConfig = (env: Record<string, string>) => {
    const proc = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        "const m = await import('./drizzle.config.ts'); console.log(m.default.dbCredentials.url)",
      ],
      {
        cwd: REPO_ROOT,
        env: { PATH: process.env.PATH ?? "", ...env },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    return {
      code: proc.exitCode,
      out: proc.stdout.toString().trim(),
      err: proc.stderr.toString(),
    };
  };

  test("drizzle.config uses PG_MIGRATE_URL first, then PG_CONNECTION_URL", () => {
    const migrateUrl = "postgres://owner@localhost:5432/portfolio_dev";
    const readerUrl = "postgres://reader@localhost:5432/portfolio_dev";
    expect(
      spawnConfig({ PG_MIGRATE_URL: migrateUrl, PG_CONNECTION_URL: readerUrl })
        .out,
    ).toBe(migrateUrl);
    expect(
      spawnConfig({ PG_MIGRATE_URL: " ", PG_CONNECTION_URL: readerUrl }).out,
    ).toBe(readerUrl);
  });

  test("drizzle.config guards PG_MIGRATE_URL like any local tool", () => {
    const result = spawnConfig({
      PG_MIGRATE_URL:
        "postgres://owner:not-a-real-secret@db.prod.invalid:5432/portfolio",
      PG_CONNECTION_URL: "postgres://reader@localhost:5432/portfolio_dev",
    });
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("Refusing to use database");
    expect(result.err).not.toContain("not-a-real-secret");
  });

  // T-13: the Umami session secret lives only in the Out Plane env of the umami app.
  test.skipIf(!inCheckout(".git") || Bun.which("git") === null)(
    "no Umami secret name anywhere in the repository outside claudedocs",
    () => {
      const name = ["APP", "SECRET"].join("_");
      const proc = Bun.spawnSync(
        ["git", "grep", "-n", name, "--", ".", ":!claudedocs"],
        {
          cwd: REPO_ROOT,
          stdout: "pipe",
        },
      );
      expect(proc.stdout.toString()).toBe("");
    },
  );
});
