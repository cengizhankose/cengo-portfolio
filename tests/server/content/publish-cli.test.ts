// SEC-29 / BE-16 (K-01 = A): the publish CLI. Most scenarios run main() in
// this process against an in-process PGlite with the production schema; the
// process-level runs start the CLI the way `bun run content:publish` does
// (bun --no-env-file) and talk to PGlite over the Postgres wire protocol.
// Nothing here can reach a real database: remote hosts use the reserved
// `.invalid` / `example.com` names and are refused before any connection.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Glob } from "bun";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../../../src/db/schema";
import { posts } from "../../../src/db/schema";
import { createPostQueries } from "../../../src/db/queries/posts";
import { createPostsRouter } from "../../../src/api/routes/posts";
import {
  parseCliArgs,
  purgeUrls,
  USAGE,
  type Deps,
} from "../../../scripts/content/publish-post";
import type { GitRunner } from "../../../scripts/content/git";
import { MIGRATIONS } from "../db/pglite";
import { startPgliteWire, type PgliteWire } from "../ops/pglite-wire";
import {
  gitRepo,
  HAS_GIT,
  LOCAL_URL,
  pgliteOpenDb,
  postFile,
  REMOTE_URL,
  REPO_ROOT,
  runCli,
  runMain,
  tempDir,
  SETUP_TIMEOUT_MS,
} from "./helpers";

const SLUG = "sec29-test";
const HEAD = "a".repeat(40);

/** git as seen for a committed, unchanged file (pushed). */
const cleanGit: GitRunner = (args) => {
  if (args[0] === "rev-parse") return { code: 0, stdout: `${HEAD}\n` };
  if (args[0] === "branch") return { code: 0, stdout: "  origin/main\n" };
  return { code: 0, stdout: "" };
};

let client: PGlite;
let dir: string;
let cleanupDir: () => Promise<unknown>;
let opened: string[];

const db = () => drizzle(client, { schema });
const api = () =>
  new Hono().route("/api/posts", createPostsRouter(createPostQueries(db())));
const rowsFor = (slug: string) =>
  db().select().from(posts).where(eq(posts.slug, slug));
const count = async () =>
  (
    await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(posts)
  )[0].n;

async function writePost(name: string, text: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, text);
  return path;
}

/** main() against PGlite, local mode (the guard accepts LOCAL_URL). */
const local = (argv: string[], deps: Partial<Deps> = {}) =>
  runMain(argv, {
    env: { PG_CONNECTION_URL: LOCAL_URL },
    openDb: pgliteOpenDb(client, opened),
    git: cleanGit,
    ...deps,
  });

const noUrlInOutput = (result: { stdout: string; stderr: string }) => {
  expect(result.stdout + result.stderr).not.toContain("postgres://");
  expect(result.stdout + result.stderr).not.toContain("not-a-real-secret");
};

beforeAll(async () => {
  ({ dir, cleanup: cleanupDir } = await tempDir());
  client = new PGlite();
  await migrate(drizzle(client, { schema }), { migrationsFolder: MIGRATIONS });
}, SETUP_TIMEOUT_MS);
afterAll(async () => {
  await client.close();
  await cleanupDir();
});

beforeEach(async () => {
  await client.exec("truncate posts restart identity");
  opened = [];
});

describe("arguments (SEC-29 step 1)", () => {
  test("no arguments -> usage on stderr, exit 1", async () => {
    const result = await runMain([]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });

  test("--help -> usage on stdout, exit 0", async () => {
    const result = await runMain(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(USAGE);
  });

  test.each([
    [["--frobnicate", "a.md"]],
    [["a.md", "b.md"]],
    [["a.md", "--publish", "--draft"]],
    [["--verify", "a.md"]],
    [["--verify", "--publish"]],
    [["a.md", "--lang"]],
  ])("%p -> exit 1 with usage, nothing opened", async (argv) => {
    const result = await local(argv);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Usage:");
    expect(opened).toEqual([]);
  });

  test("defaults: draft, local, no dry run", () => {
    expect(parseCliArgs(["x.md"])).toEqual({
      file: "x.md",
      publish: false,
      draft: false,
      dryRun: false,
      prod: false,
      verify: false,
      help: false,
      lang: undefined,
      translationKey: undefined,
    });
  });
});

describe("local publish (SEC-29 criteria 3-4, BE-16 criteria 2-3)", () => {
  test("default run writes a draft: published=f and the API answers 404 (SEC-08)", async () => {
    const file = await writePost("draft.md", postFile({ slug: SLUG }));
    const result = await local([file]);
    expect(result.code).toBe(0);
    expect(result.out[0]).toMatch(
      new RegExp(`^inserted id=\\d+ slug=${SLUG} lang=en published=false$`),
    );
    const [row] = await rowsFor(SLUG);
    expect(row.published).toBe(false);
    expect(row.publishedAt).toBeNull();
    expect((await api().request(`/api/posts/${SLUG}`)).status).toBe(404);
    noUrlInOutput(result);
  });

  test("--publish: published=t, API 200; a second run updates the same row", async () => {
    const file = await writePost("live.md", postFile({ slug: SLUG }));
    const first = await local([file, "--publish"]);
    expect(first.code).toBe(0);
    expect(first.out[0]).toStartWith("inserted ");
    expect(first.out[0]).toEndWith("published=true");
    const [row] = await rowsFor(SLUG);
    expect(row.published).toBe(true);
    expect(row.publishedAt).toBeInstanceOf(Date);
    expect((await api().request(`/api/posts/${SLUG}`)).status).toBe(200);

    const second = await local([file, "--publish"]);
    expect(second.code).toBe(0);
    expect(second.out[0]).toStartWith(`updated id=${row.id} `);
    expect(await count()).toBe(1);
    // BE-19: published_at is the first publication and stays.
    const [again] = await rowsFor(SLUG);
    expect(again.publishedAt?.getTime()).toBe(row.publishedAt?.getTime());
    expect(again.updatedAt.getTime()).toBeGreaterThanOrEqual(
      row.updatedAt.getTime(),
    );
    noUrlInOutput(first);
    noUrlInOutput(second);
  });

  test("editing the file updates every field", async () => {
    const path = await writePost(
      "edit.md",
      postFile({ slug: SLUG, excerpt: "first", seoTitle: "Seo one" }),
    );
    await local([path, "--publish"]);
    await writePost(
      "edit.md",
      postFile(
        { slug: SLUG, title: "New title", excerpt: undefined },
        "New body",
      ),
    );
    const result = await local([path, "--publish"]);
    expect(result.code).toBe(0);
    const [row] = await rowsFor(SLUG);
    expect(row).toMatchObject({
      title: "New title",
      content: "New body",
      excerpt: null,
      seoTitle: null,
      published: true,
    });
  });

  test("a public post is never taken down by a forgotten --publish; --draft does it (BE-16 criterion 3)", async () => {
    const path = await writePost("down.md", postFile({ slug: SLUG }));
    await local([path, "--publish"]);
    const [live] = await rowsFor(SLUG);

    const forgotten = await local([path]);
    expect(forgotten.code).toBe(1);
    expect(forgotten.stderr).toContain("--draft");
    expect((await rowsFor(SLUG))[0]).toEqual(live);

    const down = await local([path, "--draft"]);
    expect(down.code).toBe(0);
    expect(down.stderr).toContain("draft now");
    const [row] = await rowsFor(SLUG);
    expect(row.published).toBe(false);
    expect(row.publishedAt?.getTime()).toBe(live.publishedAt?.getTime()); // first publication kept
    expect((await api().request(`/api/posts/${SLUG}`)).status).toBe(404);
  });

  test("--dry-run prints the metadata and never connects (BE-16 criterion 4)", async () => {
    const file = await writePost("dry.md", postFile({ slug: SLUG }));
    const result = await local([file, "--dry-run", "--publish"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`slug=${SLUG}`);
    expect(result.stdout).toContain("lang=en");
    expect(result.stdout).toContain("content=22 chars");
    expect(opened).toEqual([]);
    expect(await count()).toBe(0);
  });

  test("invalid file: exit 1, `path: message` on stderr, no connection (SEC-07 step 3)", async () => {
    const file = await writePost(
      "bad.md",
      postFile({ slug: SLUG, title: undefined, lang: undefined, id: 5 }),
    );
    const result = await local([file, "--publish"]);
    expect(result.code).toBe(1);
    for (const field of ["title", "lang", "id"]) {
      expect(result.err.some((line) => line.startsWith(field))).toBe(true);
    }
    expect(opened).toEqual([]);
    expect(await count()).toBe(0);
  });

  test("missing file and oversized file -> exit 1", async () => {
    expect((await local([join(dir, "nope.md")])).code).toBe(1);
    const big = await writePost("big.md", postFile({}, "x".repeat(600 * 1024)));
    const result = await local([big]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("larger than");
    expect(opened).toEqual([]);
  });

  test("a slug owned by another language is never rewritten", async () => {
    const tr = await writePost("tr.md", postFile({ slug: SLUG, lang: "tr" }));
    await local([tr, "--publish"]);
    const en = await writePost(
      "en.md",
      postFile({ slug: SLUG, lang: "en", title: "EN" }),
    );
    const result = await local([en, "--publish"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("another language");
    const [row] = await rowsFor(SLUG);
    expect(row).toMatchObject({ lang: "tr", title: "Publish CLI test" });
  });

  test("purge list: www only, the post's language path, the list variants and the API path", async () => {
    const file = await writePost(
      "purge.md",
      postFile({ slug: SLUG, lang: "tr" }),
    );
    const result = await local([file, "--publish"]);
    const urls = result.out
      .filter((l) => l.startsWith("  https://"))
      .map((l) => l.trim());
    expect(urls).toEqual(purgeUrls({ slug: SLUG, lang: "tr" }, []));
    expect(urls).toContain(`https://www.cengizhankose.com/tr/blog/${SLUG}`);
    expect(urls).toContain(
      "https://www.cengizhankose.com/api/posts?lang=tr&missingIn=en",
    );
    expect(urls).toContain(`https://www.cengizhankose.com/api/posts/${SLUG}`);
    expect(
      urls.every((u) => u.startsWith("https://www.cengizhankose.com/")),
    ).toBe(true);
  });
});

describe("T-12 translations (BE-16 criterion 6)", () => {
  test("--lang en --translation-key links the EN post to the published TR post", async () => {
    const trFile = await writePost(
      "k.tr.md",
      postFile({ slug: "merhaba-k", lang: "tr", translationKey: "greeting" }),
    );
    const trRun = await local([trFile, "--publish"]);
    expect(trRun.stdout).toContain(
      "no en translation yet; language switcher falls back to /blog",
    );

    const enFile = await writePost(
      "k.en.md",
      postFile({ slug: "hello-k", lang: "tr" }),
    );
    const enRun = await local([
      enFile,
      "--publish",
      "--lang",
      "en",
      "--translation-key",
      "greeting",
    ]);
    expect(enRun.code).toBe(0);
    expect(enRun.stdout).not.toContain("translation yet");
    const [row] = await rowsFor("hello-k");
    expect(row).toMatchObject({ lang: "en", translationKey: "greeting" });
    // Both language paths go into the purge list.
    expect(enRun.stdout).toContain(
      "https://www.cengizhankose.com/blog/hello-k",
    );
    expect(enRun.stdout).toContain(
      "https://www.cengizhankose.com/tr/blog/merhaba-k",
    );

    const res = await api().request("/api/posts/hello-k");
    const body = (await res.json()) as { translations: { lang: string }[] };
    expect(body.translations[0].lang).toBe("tr");
  });

  test("a second EN file with the same key and another slug -> exit 1, row count unchanged", async () => {
    const one = await writePost(
      "one.md",
      postFile({ slug: "first-en", translationKey: "k1" }),
    );
    await local([one]);
    const before = await count();
    const two = await writePost(
      "two.md",
      postFile({ slug: "second-en", translationKey: "k1" }),
    );
    const result = await local([two]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("translationKey");
    expect(await count()).toBe(before);
  });
});

describe("target selection (SEC-06 guard, SEC-14 writer, SEC-22 TLS)", () => {
  let file: string;
  beforeEach(async () => {
    file = await writePost("target.md", postFile({ slug: SLUG }));
  });

  test("without --prod a non-local database is refused before connecting (BE-16 criterion 5)", async () => {
    for (const url of [REMOTE_URL, "postgres://x@127.0.0.1:1/prod"]) {
      const result = await local([file], {
        env: { PG_CONNECTION_URL: url, ALLOW_REMOTE_DB: "1" },
      });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Refusing to use database");
      noUrlInOutput(result);
    }
    expect(opened).toEqual([]);
  });

  test("--prod without PG_WRITE_CONNECTION_URL -> exit 1 naming it, no connection (SEC-29 criterion 2)", async () => {
    for (const value of [undefined, "", "  "]) {
      const result = await local([file, "--prod"], {
        env: { PG_CONNECTION_URL: LOCAL_URL, PG_WRITE_CONNECTION_URL: value },
      });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("PG_WRITE_CONNECTION_URL");
    }
    expect(opened).toEqual([]);
  });

  test("--prod with sslmode=require -> exit 1 with verify-full, whatever NODE_ENV says (SEC-22)", async () => {
    for (const NODE_ENV of ["production", "development", undefined]) {
      const result = await local([file, "--prod"], {
        env: {
          NODE_ENV,
          PG_WRITE_CONNECTION_URL: `${REMOTE_URL}?sslmode=require`,
        },
      });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("verify-full");
      noUrlInOutput(result);
    }
    expect(opened).toEqual([]);
  });

  test("--prod refuses plaintext (a local .env's PG_SSL_MODE=disable) to a remote host", async () => {
    const result = await local([file, "--prod"], {
      env: { PG_WRITE_CONNECTION_URL: REMOTE_URL, PG_SSL_MODE: "disable" },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("PG_SSL_MODE=disable");
    expect(opened).toEqual([]);
  });

  test("--prod when Bun loaded .env files -> exit 1 before anything else", async () => {
    const result = await local([file, "--prod"], {
      envFilesLoaded: true,
      env: { PG_WRITE_CONNECTION_URL: `${REMOTE_URL}?sslmode=verify-full` },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(".env");
    expect(opened).toEqual([]);
  });

  test("--prod writes only through the writer URL with verifying TLS; audit line says prod", async () => {
    const writer =
      "postgres://portfolio_writer:x@db.example.com:5432/portfolio?sslmode=verify-full";
    const seen: { url: string; ssl: unknown }[] = [];
    const openDb: Deps["openDb"] = (url, options) => {
      seen.push({ url, ssl: options.ssl });
      return pgliteOpenDb(client)(url, options);
    };
    const result = await runMain([file, "--prod", "--publish"], {
      env: { PG_CONNECTION_URL: LOCAL_URL, PG_WRITE_CONNECTION_URL: writer },
      openDb,
      git: cleanGit,
    });
    expect(result.code).toBe(0);
    expect(seen).toEqual([{ url: writer, ssl: { rejectUnauthorized: true } }]);
    // PGlite runs as a superuser: the SEC-14 warning fires.
    expect(result.stderr).toContain("more than posts DML");
    const audit = JSON.parse(result.out.at(-1)!);
    expect(audit).toMatchObject({
      prod: true,
      db: "portfolio",
      commit: HEAD,
      dirty: false,
    });
    noUrlInOutput(result);
  });
});

describe("process level (bun --no-env-file, as `bun run content:publish`)", () => {
  let wire: PgliteWire;
  let work: { dir: string; cleanup: () => Promise<unknown> };

  beforeAll(async () => {
    const pg = new PGlite();
    await migrate(drizzle(pg, { schema }), { migrationsFolder: MIGRATIONS });
    wire = await startPgliteWire(pg);
    work = await tempDir("publish-proc-");
  }, SETUP_TIMEOUT_MS);
  afterAll(async () => {
    await wire.close();
    await work.cleanup();
  });

  const localEnv = () => ({
    PG_CONNECTION_URL: wire.url,
    PG_SSL_MODE: "disable",
  });

  test("no arguments -> usage and exit 1 (SEC-29 criterion 2)", async () => {
    const result = await runCli([], {}, work.dir);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });

  test(
    "draft, then --publish, then again: real postgres.js over the wire (SEC-29 criteria 3-4)",
    async () => {
      const file = join(work.dir, `${SLUG}.en.md`);
      await writeFile(file, postFile({ slug: SLUG }));
      const pgDb = drizzle(wire.db, { schema });
      const app = new Hono().route(
        "/api/posts",
        createPostsRouter(createPostQueries(pgDb)),
      );
      const published = async () =>
        (await pgDb.select().from(posts).where(eq(posts.slug, SLUG))).map(
          (r) => r.published,
        );

      const draft = await runCli([file], localEnv(), work.dir);
      expect(draft.code).toBe(0);
      expect(await published()).toEqual([false]);
      expect((await app.request(`/api/posts/${SLUG}`)).status).toBe(404);

      const live = await runCli([file, "--publish"], localEnv(), work.dir);
      expect(live.code).toBe(0);
      expect(await published()).toEqual([true]);
      expect((await app.request(`/api/posts/${SLUG}`)).status).toBe(200);

      const again = await runCli([file, "--publish"], localEnv(), work.dir);
      expect(again.code).toBe(0);
      expect(again.stdout).toStartWith("updated ");
      expect(await published()).toEqual([true]);

      for (const run of [draft, live, again]) {
        expect(run.stderr).toBe("");
        noUrlInOutput(run);
      }
    },
    SETUP_TIMEOUT_MS,
  );

  test(
    "a local run reads .env (it restarts with Bun's .env loading)",
    async () => {
      const envDir = await tempDir("publish-envfile-");
      try {
        await writeFile(
          join(envDir.dir, ".env"),
          `PG_CONNECTION_URL=${REMOTE_URL}\n`,
        );
        const file = join(envDir.dir, "post.md");
        await writeFile(file, postFile({ slug: SLUG }));
        // The .env URL is read, and the guard refuses it.
        const result = await runCli([file], {}, envDir.dir);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("Refusing to use database");
        noUrlInOutput(result);
      } finally {
        await envDir.cleanup();
      }
    },
    SETUP_TIMEOUT_MS,
  );

  test("--prod started without --no-env-file is refused", async () => {
    const proc = Bun.spawnSync(
      [
        process.execPath,
        join(REPO_ROOT, "scripts/content/publish-post.ts"),
        "x.md",
        "--prod",
      ],
      {
        cwd: work.dir,
        env: { PATH: process.env.PATH ?? "" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(proc.exitCode).toBe(1);
    expect(proc.stderr.toString()).toContain("--no-env-file");
  });

  describe.skipIf(!HAS_GIT)("with a committed content file", () => {
    let repo: Awaited<ReturnType<typeof gitRepo>>;
    const name = `${SLUG}.en.md`;
    beforeAll(async () => {
      repo = await gitRepo({ [name]: postFile({ slug: SLUG }) });
    }, SETUP_TIMEOUT_MS);
    afterAll(async () => {
      await repo.cleanup();
    });

    test("PG_WRITE_CONNECTION_URL= ... --prod -> exit 1, stderr names it (SEC-29 criterion 2)", async () => {
      const result = await runCli(
        [name, "--prod"],
        { PG_WRITE_CONNECTION_URL: "", PG_CONNECTION_URL: wire.url },
        repo.dir,
      );
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("PG_WRITE_CONNECTION_URL");
      noUrlInOutput(result);
    });

    test("--prod ignores a .env next to the file: its writer URL and PG_SSL_MODE=disable do not exist for the run", async () => {
      await writeFile(
        join(repo.dir, ".env"),
        `PG_WRITE_CONNECTION_URL=${REMOTE_URL}?sslmode=verify-full\nPG_SSL_MODE=disable\n`,
      );
      try {
        const result = await runCli([name, "--prod"], {}, repo.dir);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("PG_WRITE_CONNECTION_URL is not set");
        noUrlInOutput(result);
      } finally {
        await rm(join(repo.dir, ".env"));
      }
    });

    test("NODE_ENV=production + sslmode=require -> non-zero with verify-full, no credentials (SEC-22 CLI criterion)", async () => {
      const result = await runCli(
        [name, "--prod"],
        {
          NODE_ENV: "production",
          PG_WRITE_CONNECTION_URL:
            "postgres://u:p@db.example.com/x?sslmode=require",
        },
        repo.dir,
      );
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("verify-full");
      expect(result.stdout + result.stderr).not.toContain("u:p@");
      expect(result.stdout + result.stderr).not.toContain("db.example.com");
    });
  });
});

describe("repository hygiene (SEC-29 criterion 1, BE-16 criterion 1)", () => {
  test("the old raw-SQL script is gone and nothing in scripts/ has a home path or API key", async () => {
    expect(existsSync(join(REPO_ROOT, "scripts/insert-blog-post.ts"))).toBe(
      false,
    );
    const hits: string[] = [];
    for await (const file of new Glob("scripts/**/*.{ts,js,sql}").scan({
      cwd: REPO_ROOT,
    })) {
      if (
        /\/Users\/|BLOG_API_KEY/.test(
          await Bun.file(join(REPO_ROOT, file)).text(),
        )
      )
        hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  test("the publish CLI has no one-off checks and no internal-notes cut (BE-16 step 9)", async () => {
    for await (const file of new Glob("scripts/content/**").scan({
      cwd: REPO_ROOT,
    })) {
      const text = await Bun.file(join(REPO_ROOT, file)).text();
      expect(text).not.toMatch(/mermaid|FEEDBACK/i);
    }
  });

  test("the CLI writes only through Drizzle (no raw postgres template SQL writes)", async () => {
    const source = await Bun.file(
      join(REPO_ROOT, "scripts/content/publish-post.ts"),
    ).text();
    expect(source).not.toMatch(/\bsql`\s*(insert|update|delete)\b/i);
    expect(source).toContain(".onConflictDoUpdate(");
  });

  test("package.json: content:publish starts Bun without .env loading", async () => {
    const pkg = (await Bun.file(join(REPO_ROOT, "package.json")).json()) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["content:publish"]).toBe(
      "bun --no-env-file scripts/content/publish-post.ts",
    );
  });
});
