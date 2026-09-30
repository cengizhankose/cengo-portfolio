// Shared helpers for the publish CLI tests (BE-16, SEC-29, SEC-15, SEC-14):
// content files, throw-away git repositories, the CLI in-process (main) and
// as a process (bun --no-env-file, as `bun run content:publish` starts it).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import * as schema from "../../../src/db/schema";
import { REPO_ROOT } from "../helpers";
import { main, type Deps } from "../../../scripts/content/publish-post";

export { REPO_ROOT };
export const CLI = join(REPO_ROOT, "scripts/content/publish-post.ts");
/** A URL the local guard accepts; nothing listens there (port 1). */
export const LOCAL_URL = "postgres://postgres@127.0.0.1:1/portfolio_test";
export const REMOTE_URL =
  "postgres://someuser:not-a-real-secret@db.prod.invalid:5432/portfolio";

/** PGlite start + migrations can take seconds on a loaded machine or in the image gate. */
export const SETUP_TIMEOUT_MS = 30_000;

/** git is not part of the Docker test gate (alpine image, no .git): those tests skip there. */
export const HAS_GIT = Bun.which("git") !== null;

export interface PostFields {
  slug?: string;
  lang?: string;
  title?: string;
  seoTitle?: string;
  excerpt?: string;
  coverImage?: string;
  translationKey?: string;
  [key: string]: unknown;
}

/** A content file; `undefined` fields are left out, strings are JSON-quoted YAML. */
export function postFile(
  fields: PostFields = {},
  body = "## Heading\n\nBody text.",
): string {
  const all: PostFields = {
    slug: "sec29-test",
    lang: "en",
    title: "Publish CLI test",
    ...fields,
  };
  const lines = Object.entries(all)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}

/** A temporary directory, removed by the returned cleanup. */
export async function tempDir(prefix = "publish-cli-") {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

export function git(args: string[], cwd: string): string {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: cwd,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.invalid",
    },
  });
  if (proc.exitCode !== 0)
    throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
  return proc.stdout.toString().trim();
}

/** A fresh repository with `files` committed; returns its directory and HEAD. */
export async function gitRepo(files: Record<string, string>) {
  const { dir, cleanup } = await tempDir("publish-repo-");
  git(["init", "-q", "-b", "main"], dir);
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(dir, name), text);
  }
  git(["add", "."], dir);
  git(["commit", "-q", "-m", "content"], dir);
  return { dir, head: git(["rev-parse", "HEAD"], dir), cleanup };
}

/** Drizzle over an in-process PGlite, in the shape the CLI's openDb returns. */
export function pgliteOpenDb(client: PGlite, calls: string[] = []) {
  const openDb: Deps["openDb"] = (url) => {
    calls.push(url);
    return { db: drizzle(client, { schema }), close: async () => {} };
  };
  return openDb;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  out: string[];
  err: string[];
}

/** main() in this process with captured output; env is exactly what is given. */
export async function runMain(
  argv: string[],
  deps: Partial<Deps> & { env?: Record<string, string | undefined> } = {},
): Promise<RunResult> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, {
    env: {},
    envFilesLoaded: false,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    ...deps,
  });
  return {
    code,
    out,
    err,
    stdout: out.join("\n"),
    stderr: err.join("\n"),
  };
}

/** The CLI as `bun run content:publish` starts it (--no-env-file), in `cwd`, with only `env`. */
export async function runCli(
  args: string[],
  env: Record<string, string>,
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, "--no-env-file", CLI, ...args], {
    cwd,
    env: { PATH: process.env.PATH ?? "", HOME: cwd, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

/** A TCP server that counts connections and never answers: proves "no connection attempted". */
export function connectionCounter() {
  let connections = 0;
  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open() {
        connections++;
      },
      data() {},
    },
  });
  return {
    port: server.port,
    get connections() {
      return connections;
    },
    stop: () => server.stop(true),
  };
}
