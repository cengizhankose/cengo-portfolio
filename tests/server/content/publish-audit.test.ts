// SEC-15 (K-01 = A): the audit trail of production writes is the git history
// of content/posts/ plus one JSON line per write, and `--verify` finds any
// difference between the repository and the database (a write that bypassed
// the CLI shows up there).
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../../src/db/schema";
import { posts } from "../../../src/db/schema";
import { comparePosts, type Deps } from "../../../scripts/content/publish-post";
import {
  fileGitState,
  runGit,
  type GitRunner,
} from "../../../scripts/content/git";
import { sha256Hex } from "../../../scripts/content/post-file";
import { MIGRATIONS } from "../db/pglite";
import { startPgliteWire, type PgliteWire } from "../ops/pglite-wire";
import {
  connectionCounter,
  git,
  gitRepo,
  HAS_GIT,
  LOCAL_URL,
  pgliteOpenDb,
  postFile,
  REMOTE_URL,
  runCli,
  runMain,
  tempDir,
} from "./helpers";

const AUDIT_KEYS = [
  "event",
  "action",
  "id",
  "slug",
  "lang",
  "published",
  "commit",
  "dirty",
  "db",
  "prod",
  "contentSha256",
  "at",
].sort();

let client: PGlite;
let opened: string[];
const db = () => drizzle(client, { schema });

beforeAll(async () => {
  client = new PGlite();
  await migrate(drizzle(client, { schema }), { migrationsFolder: MIGRATIONS });
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  await client.exec("truncate posts restart identity");
  opened = [];
});

const local = (argv: string[], deps: Partial<Deps> = {}) =>
  runMain(argv, {
    env: { PG_CONNECTION_URL: LOCAL_URL },
    openDb: pgliteOpenDb(client, opened),
    ...deps,
  });

describe("fileGitState", () => {
  const fake =
    (
      answers: Record<string, { code: number; stdout: string } | null>,
    ): GitRunner =>
    (args) =>
      answers[args[0]] ?? { code: 0, stdout: "" };

  test("no git binary or no repository -> no commit, treated as dirty", () => {
    expect(fileGitState("/x/post.md", () => null)).toEqual({
      commit: null,
      tracked: false,
      dirty: true,
      pushed: false,
    });
    expect(
      fileGitState(
        "/x/post.md",
        fake({ "rev-parse": { code: 128, stdout: "" } }),
      ).commit,
    ).toBeNull();
  });

  test("untracked, modified and clean files", () => {
    const head = { code: 0, stdout: `${"b".repeat(40)}\n` };
    expect(
      fileGitState(
        "/x/p.md",
        fake({ "rev-parse": head, "ls-files": { code: 1, stdout: "" } }),
      ).tracked,
    ).toBe(false);
    expect(
      fileGitState(
        "/x/p.md",
        fake({ "rev-parse": head, status: { code: 0, stdout: " M p.md\n" } }),
      ).dirty,
    ).toBe(true);
    expect(fileGitState("/x/p.md", fake({ "rev-parse": head }))).toEqual({
      commit: "b".repeat(40),
      tracked: true,
      dirty: false,
      pushed: false,
    });
  });
});

describe.skipIf(!HAS_GIT)(
  "--prod needs a committed, unchanged file (SEC-15 criterion 1)",
  () => {
    let repo: Awaited<ReturnType<typeof gitRepo>>;
    let counter: ReturnType<typeof connectionCounter>;
    const name = "audit-post.en.md";
    const writerEnv = () => ({
      // A would-be production writer: the counter proves no connection is made.
      PG_WRITE_CONNECTION_URL: `postgres://w@127.0.0.1:${counter.port}/portfolio?sslmode=verify-full`,
    });

    beforeAll(async () => {
      repo = await gitRepo({ [name]: postFile({ slug: "audit-post" }) });
      counter = connectionCounter();
    });
    afterAll(async () => {
      counter.stop();
      await repo.cleanup();
    });

    test("uncommitted change -> exit 1 before connecting, stderr says commit", async () => {
      await appendFile(join(repo.dir, name), "\nextra line\n");
      try {
        const result = await runCli(
          [name, "--prod", "--publish"],
          writerEnv(),
          repo.dir,
        );
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("commit");
        expect(result.stderr).not.toContain("postgres://");
      } finally {
        git(["checkout", "--", name], repo.dir);
      }
      expect(counter.connections).toBe(0);
    });

    test("staged but not committed -> refused as well", async () => {
      await appendFile(join(repo.dir, name), "\nstaged\n");
      git(["add", name], repo.dir);
      try {
        const result = await runMain([join(repo.dir, name), "--prod"], {
          env: writerEnv(),
          openDb: pgliteOpenDb(client, opened),
        });
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("commit");
      } finally {
        git(["reset", "-q", "--hard"], repo.dir);
      }
      expect(opened).toEqual([]);
    });

    test("untracked file -> refused", async () => {
      await writeFile(join(repo.dir, "new.md"), postFile({ slug: "new-post" }));
      const result = await runCli(["new.md", "--prod"], writerEnv(), repo.dir);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("commit");
      expect(counter.connections).toBe(0);
    });

    test("committed file passes the git check; the audit line carries HEAD", async () => {
      const result = await runMain(
        [join(repo.dir, name), "--prod", "--publish"],
        {
          env: {
            PG_WRITE_CONNECTION_URL:
              "postgres://portfolio_writer:x@db.example.com/portfolio?sslmode=verify-full",
          },
          openDb: pgliteOpenDb(client, opened),
        },
      );
      expect(result.code).toBe(0);
      const audit = JSON.parse(result.out.at(-1)!);
      expect(audit.commit).toBe(repo.head);
      expect(audit.dirty).toBe(false);
      // Not pushed anywhere (no remote): a warning, not a refusal.
      expect(result.stderr).toContain("not on a remote branch");
    });
  },
);

describe("audit line (SEC-15 criterion 2)", () => {
  test.skipIf(!HAS_GIT)(
    "local publish from a repository: last stdout line is the JSON event with a 40-hex commit",
    async () => {
      const repo = await gitRepo({ "a.en.md": postFile({ slug: "audit-a" }) });
      try {
        const result = await local([join(repo.dir, "a.en.md"), "--publish"], {
          git: runGit,
          now: () => new Date("2026-09-30T12:00:00.000Z"),
        });
        expect(result.code).toBe(0);
        const last = JSON.parse(result.out.at(-1)!);
        expect(last.event).toBe("post_publish");
        expect(last.commit).toMatch(/^[0-9a-f]{40}$/);
        expect(last.commit).toBe(repo.head);
        expect(last).toHaveProperty("slug", "audit-a");
        expect(Object.keys(last).sort()).toEqual(AUDIT_KEYS);
        const [row] = await db()
          .select()
          .from(posts)
          .where(eq(posts.slug, "audit-a"));
        expect(last).toMatchObject({
          action: "inserted",
          id: row.id,
          published: true,
          dirty: false,
          db: "portfolio_test",
          prod: false,
          contentSha256: sha256Hex(row.content).slice(0, 12),
          at: "2026-09-30T12:00:00.000Z",
        });
        expect(result.stdout + result.stderr).not.toContain("postgres://");
      } finally {
        await repo.cleanup();
      }
    },
  );

  test("outside a repository the line still comes, with commit null and dirty true", async () => {
    const { dir, cleanup } = await tempDir();
    try {
      await writeFile(join(dir, "p.md"), postFile({ slug: "no-repo" }));
      const result = await local([join(dir, "p.md")], { git: () => null });
      expect(result.code).toBe(0);
      expect(JSON.parse(result.out.at(-1)!)).toMatchObject({
        event: "post_publish",
        commit: null,
        dirty: true,
        published: false,
      });
    } finally {
      await cleanup();
    }
  });

  test("the audit line has no URL, host, user or password fields", async () => {
    const { dir, cleanup } = await tempDir();
    try {
      await writeFile(join(dir, "p.md"), postFile({ slug: "no-url" }));
      const result = await local([join(dir, "p.md")], {
        env: {
          PG_CONNECTION_URL:
            "postgres://secretuser:secretpass@localhost:5432/portfolio_dev",
        },
        git: () => null,
      });
      expect(result.code).toBe(0);
      const line = result.out.at(-1)!;
      expect(line).not.toMatch(/secretuser|secretpass|localhost|postgres:/);
      expect(Object.keys(JSON.parse(line)).sort()).toEqual(AUDIT_KEYS);
    } finally {
      await cleanup();
    }
  });
});

describe("--verify (SEC-15 criterion 3)", () => {
  let content: { dir: string; cleanup: () => Promise<unknown> };

  beforeAll(async () => {
    content = await tempDir("verify-content-");
  });
  afterAll(async () => {
    await content.cleanup();
  });

  async function setUp(files: Record<string, string>) {
    const dir = join(content.dir, crypto.randomUUID());
    await mkdir(dir);
    for (const [name, text] of Object.entries(files)) {
      await writeFile(join(dir, name), text);
      const published = await local([join(dir, name), "--publish"], {
        git: () => null,
      });
      expect(published.code).toBe(0);
    }
    return dir;
  }

  const verify = (contentDir: string, deps: Partial<Deps> = {}) =>
    local(["--verify"], { contentDir, ...deps });

  test("every file published from the repository -> all ok, exit 0", async () => {
    const dir = await setUp({
      "one.en.md": postFile({ slug: "verify-one" }),
      "two.tr.md": postFile({
        slug: "verify-two",
        lang: "tr",
        excerpt: "Özet",
      }),
    });
    const result = await verify(dir);
    expect(result.code).toBe(0);
    expect(result.out).toEqual(["verify-one ok", "verify-two ok"]);
    expect(result.stderr).toBe("");
  });

  test("content changed in the database -> drift, exit 1", async () => {
    const dir = await setUp({ "one.en.md": postFile({ slug: "verify-one" }) });
    await db()
      .update(posts)
      .set({ content: "tampered" })
      .where(eq(posts.slug, "verify-one"));
    const result = await verify(dir);
    expect(result.code).toBe(1);
    expect(result.out).toEqual(["verify-one drift content"]);
  });

  test("other fields are compared too (title, excerpt, seoTitle, translationKey)", async () => {
    const dir = await setUp({ "one.en.md": postFile({ slug: "verify-one" }) });
    await db()
      .update(posts)
      .set({ title: "Spam", seoTitle: "Spam", translationKey: "spam" })
      .where(eq(posts.slug, "verify-one"));
    const result = await verify(dir);
    expect(result.code).toBe(1);
    expect(result.out).toEqual([
      "verify-one drift title,translationKey,seoTitle",
    ]);
  });

  test("a row with no content file (written outside the CLI) -> untracked, exit 1", async () => {
    const dir = await setUp({ "one.en.md": postFile({ slug: "verify-one" }) });
    await db().insert(posts).values({
      slug: "injected-spam",
      lang: "en",
      title: "Buy now",
      content: "spam",
      published: true,
    });
    const result = await verify(dir);
    expect(result.code).toBe(1);
    expect(result.out).toEqual(["injected-spam untracked", "verify-one ok"]);
  });

  test("a content file with no row -> missing, exit 1", async () => {
    const dir = await setUp({});
    await writeFile(join(dir, "later.en.md"), postFile({ slug: "not-yet" }));
    const result = await verify(dir);
    expect(result.code).toBe(1);
    expect(result.out).toEqual(["not-yet missing"]);
  });

  test("an invalid content file fails verify", async () => {
    const dir = await setUp({});
    await writeFile(join(dir, "broken.md"), postFile({ title: undefined }));
    const result = await verify(dir);
    expect(result.code).toBe(1);
    expect(result.out[0]).toBe("broken.md invalid");
    expect(result.stderr).toContain("title");
  });

  test("--verify --prod reads with PG_CONNECTION_URL (the reader), never the writer URL", async () => {
    const dir = await setUp({ "one.en.md": postFile({ slug: "verify-one" }) });
    const reader =
      "postgres://portfolio_reader:x@db.example.com/portfolio?sslmode=verify-full";
    // Without --prod the guard refuses the remote reader.
    const result = await verify(dir, {
      env: { PG_CONNECTION_URL: reader, PG_WRITE_CONNECTION_URL: REMOTE_URL },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Refusing to use database");
    const prod = await runMain(["--verify", "--prod"], {
      env: { PG_CONNECTION_URL: reader, PG_WRITE_CONNECTION_URL: REMOTE_URL },
      contentDir: dir,
      openDb: pgliteOpenDb(client, opened),
    });
    expect(prod.code).toBe(0);
    expect(prod.out).toEqual(["verify-one ok"]);
    expect(opened.at(-1)).toBe(reader);
  });

  test("--verify --prod without PG_CONNECTION_URL -> exit 1 naming it", async () => {
    const result = await runMain(["--verify", "--prod"], {
      env: {},
      contentDir: await setUp({}),
      openDb: pgliteOpenDb(client, opened),
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("PG_CONNECTION_URL");
  });
});

describe("--verify over the wire (the CLI process, real postgres.js)", () => {
  let wire: PgliteWire;
  let work: { dir: string; cleanup: () => Promise<unknown> };
  beforeAll(async () => {
    const pg = new PGlite();
    await migrate(drizzle(pg, { schema }), { migrationsFolder: MIGRATIONS });
    wire = await startPgliteWire(pg);
    work = await tempDir("verify-proc-");
  });
  afterAll(async () => {
    await wire.close();
    await work.cleanup();
  });

  test("ok after publishing, drift after a manual change", async () => {
    const env = { PG_CONNECTION_URL: wire.url, PG_SSL_MODE: "disable" };
    const file = join(work.dir, "wire.en.md");
    await writeFile(file, postFile({ slug: "wire-post" }));
    expect((await runCli([file, "--publish"], env, work.dir)).code).toBe(0);
    // --verify reads content/posts of the repository; point a copy of main()
    // at the temp directory instead by running in-process over the same wire.
    const inProcess = (await import("../../../scripts/content/publish-post"))
      .main;
    const out: string[] = [];
    const code = await inProcess(["--verify"], {
      env,
      contentDir: work.dir,
      stdout: (l) => out.push(l),
      stderr: () => {},
    });
    expect(code).toBe(0);
    expect(out).toEqual(["wire-post ok"]);
    await wire.db.query(
      "update posts set content = 'x' where slug = 'wire-post'",
    );
    const drift: string[] = [];
    expect(
      await inProcess(["--verify"], {
        env,
        contentDir: work.dir,
        stdout: (l) => drift.push(l),
        stderr: () => {},
      }),
    ).toBe(1);
    expect(drift).toEqual(["wire-post drift content"]);
  });
});

test("comparePosts: statuses sorted by slug, null and undefined are the same", () => {
  expect(
    comparePosts(
      [
        { slug: "b", title: "T", content: "c", excerpt: undefined },
        { slug: "a", title: "T", content: "c" },
      ],
      [
        { slug: "a", title: "T", content: "c", excerpt: null, seoTitle: null },
        { slug: "b", title: "T", content: "changed", excerpt: null },
        { slug: "c", title: "T", content: "c" },
      ],
    ),
  ).toEqual([
    { slug: "a", status: "ok" },
    { slug: "b", status: "drift", fields: ["content"] },
    { slug: "c", status: "untracked" },
  ]);
});
