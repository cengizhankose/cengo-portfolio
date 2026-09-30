// BE-04 / SEC-06 acceptance: every local entry point refuses a non-local or
// non-dev database before connecting. Hosts use the reserved `.invalid` TLD
// and a closed local port, so nothing here can reach a real server.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";
import { REPO_ROOT } from "./pglite";

const REMOTE_URL =
  "postgres://someuser:not-a-real-secret@db.prod.invalid:5432/portfolio_dev";
const PROD_NAME_URL = "postgres://x:y@127.0.0.1:1/prod";

function run(
  args: string[],
  url: string,
  extraEnv: Record<string, string> = {},
) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    PG_CONNECTION_URL: url,
    ...extraEnv,
  };
  if (!("ALLOW_REMOTE_DB" in extraEnv)) delete env.ALLOW_REMOTE_DB;
  const proc = Bun.spawnSync([process.execPath, ...args], {
    cwd: REPO_ROOT,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: proc.exitCode,
    output: proc.stdout.toString() + proc.stderr.toString(),
  };
}

function expectRefused(result: { code: number | null; output: string }) {
  expect(result.code).not.toBe(0);
  expect(result.output).toContain("Refusing to use database");
  expect(result.output).toContain("ALLOW_REMOTE_DB");
  expect(result.output).not.toContain("db.prod.invalid");
  expect(result.output).not.toContain("not-a-real-secret");
}

describe("local entry points refuse non-local databases", () => {
  test("bun run api (remote host)", () => {
    expectRefused(run(["run", "api"], REMOTE_URL));
  });

  test("bun run db:migrate (remote host and prod-like name)", () => {
    expectRefused(run(["run", "db:migrate"], REMOTE_URL));
    expectRefused(run(["run", "db:migrate"], PROD_NAME_URL));
  });

  // The publish CLI (BE-16 / SEC-29) replaced scripts/insert-blog-post.ts;
  // without --prod it only accepts the local database, even with
  // ALLOW_REMOTE_DB=1 (its production path is --prod + PG_WRITE_CONNECTION_URL).
  test("scripts/content/publish-post.ts without --prod", () => {
    expectRefused(
      run(["scripts/content/publish-post.ts", "--verify"], REMOTE_URL),
    );
    expectRefused(
      run(["scripts/content/publish-post.ts", "--verify"], REMOTE_URL, {
        ALLOW_REMOTE_DB: "1",
      }),
    );
  });

  test("bun run db:seed refuses even with --prod and ALLOW_REMOTE_DB=1", () => {
    const result = run(["scripts/seed-dev.ts", "--prod"], REMOTE_URL, {
      ALLOW_REMOTE_DB: "1",
    });
    expectRefused(result);
    // The refusal must not suggest an override that db:seed ignores (W1 review).
    expect(result.output).toContain("do not apply here");
    expect(result.output).not.toContain("pass --prod or set");
  });
});

test("every local tool that reads PG_CONNECTION_URL calls the guard", async () => {
  const offenders: string[] = [];
  for (const pattern of [
    "drizzle.config.ts",
    "scripts/**/*.ts",
    "src/api/**/*.ts",
  ]) {
    for await (const file of new Glob(pattern).scan({ cwd: REPO_ROOT })) {
      const text = await Bun.file(join(REPO_ROOT, file)).text();
      if (
        text.includes("PG_CONNECTION_URL") &&
        !text.includes("assertNonProdDb")
      )
        offenders.push(file);
    }
  }
  expect(offenders).toEqual([]);
});
