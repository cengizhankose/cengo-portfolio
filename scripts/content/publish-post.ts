#!/usr/bin/env bun
// Publish CLI (K-01 = A): the only way a post reaches the database.
// BE-16 (general CLI), SEC-29 (safe defaults, no secret on disk), SEC-15
// (audit trail), SEC-14 (writer role only here).
//
//   bun run content:publish <file.md> [--publish] [--draft] [--dry-run] [--prod]
//                                     [--lang en|tr] [--translation-key <key>]
//   bun run content:publish --verify [--prod]
//
// Publishing, in this order:
//   1. --prod only: the process must not have read .env files, and the file
//      must be tracked by git with no uncommitted change (SEC-15).
//   2. The file is validated with PostInput (SEC-07) and the SEO rules
//      (post-file.ts) before any connection exists; problems go to stderr as
//      `path: message` and the exit code is 1.
//   3. --dry-run prints the validated metadata and stops (no connection).
//   4. Target: without --prod the local-DB guard (localhost *_dev / *_test,
//      K-02) with PG_CONNECTION_URL; with --prod only PG_WRITE_CONNECTION_URL
//      (portfolio_writer, SEC-14) under the production TLS policy (verify-full,
//      SEC-22), whatever NODE_ENV says.
//   5. One atomic upsert on slug. `published` is true only with --publish,
//      so a plain run writes a draft; turning a public post back into a
//      draft needs an explicit --draft (a forgotten --publish never takes a
//      live post down).
//   6. stdout: the result line, the Cloudflare purge list (www only) and, as
//      the last line, one JSON audit line (SEC-15). No output ever contains a
//      connection string.
//
// --verify only reads (PG_CONNECTION_URL, the reader role in production) and
// prints `<slug> ok|drift <fields>|missing|untracked` for content/posts/*.md
// against the posts table; anything but ok exits 1 (SEC-15).
//
// Production runs only inside `outplane env run --app <app> -- bun run
// content:publish ... --prod`, so credentials never touch the disk. The
// package script starts Bun with --no-env-file: a --prod run sees only the
// process environment, never a local .env (whose PG_SSL_MODE=disable or URLs
// must not leak into a production write). A local run restarts itself with
// Bun's normal .env loading.
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { and, eq, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { clientConfig, type DbOptions } from "../../src/db/config";
import { assertNonProdDb } from "../../src/db/guard";
import {
  MAX_POST_INPUT_BYTES,
  postInputConflict,
} from "../../src/db/post-input";
import type { PostsDb } from "../../src/db/queries/posts";
import * as schema from "../../src/db/schema";
import { posts, type PostLang } from "../../src/db/schema";
import type { ClientSsl } from "../../src/db/tls";
import { LOCALE_PREFIX } from "../../src/seo/routes.js";
import { LOCALES, SITE_URL } from "../../src/seo/site.js";
import { fileGitState, runGit, type GitRunner } from "./git";
import {
  buildPublishInput,
  parsePostFile,
  sha256Hex,
  type PublishInput,
} from "./post-file";

type Env = Record<string, string | undefined>;

export const CONTENT_DIR = resolve(import.meta.dir, "../../content/posts");
export const CLI_APPLICATION_NAME = "cengo-portfolio-publish";
export const WRITE_URL_ENV = "PG_WRITE_CONNECTION_URL";
export const READ_URL_ENV = "PG_CONNECTION_URL";

export const USAGE = `Usage:
  bun run content:publish <file.md> [--publish] [--dry-run] [--prod]
                          [--lang en|tr] [--translation-key <key>]
  bun run content:publish --verify [--prod]

  <file.md>              content file: YAML frontmatter + Markdown (content/posts/)
  --publish              make the post public (without it the post is a draft)
  --draft                explicit draft; needed to take a public post down
  --dry-run              validate and print the metadata; never connects
  --lang, --translation-key   override the frontmatter (T-12)
  --verify               compare content/posts/*.md with the database (read only)
  --prod                 production: only inside \`outplane env run --app <app> -- ...\`
                         (writes use ${WRITE_URL_ENV}, --verify uses ${READ_URL_ENV})`;

const LOCAL_DB_HINT =
  "production goes through --prod inside `outplane env run` (ALLOW_REMOTE_DB does not apply here)";

/** Our own refusals: the message is written for the terminal and never holds a URL. */
export class CliError extends Error {
  override name = "CliError";
}

/** Wrong arguments: the message is followed by the usage text. */
export class UsageError extends CliError {
  override name = "UsageError";
}

export interface OpenedDb {
  db: PostsDb;
  close: () => Promise<void>;
}

export type OpenDb = (url: string, options: DbOptions<ClientSsl>) => OpenedDb;

export interface Deps {
  env: Env;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  /** Bun read .env files into `env` (the process was not started with --no-env-file). */
  envFilesLoaded: boolean;
  contentDir: string;
  openDb: OpenDb;
  git: GitRunner;
  now: () => Date;
}

/** postgres.js + drizzle, one connection, CLI application name (BE-13 settings otherwise). */
export const openPostgres: OpenDb = (url, options) => {
  const client = postgres(url, {
    ...options,
    max: 1,
    onnotice: () => {},
    connection: {
      ...options.connection,
      application_name: CLI_APPLICATION_NAME,
    },
  });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
};

const defaultDeps = (): Deps => ({
  env: process.env,
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
  envFilesLoaded: false,
  contentDir: CONTENT_DIR,
  openDb: openPostgres,
  git: runGit,
  now: () => new Date(),
});

// ---------------------------------------------------------------------------
// Arguments

export interface CliArgs {
  file?: string;
  publish: boolean;
  draft: boolean;
  dryRun: boolean;
  prod: boolean;
  verify: boolean;
  help: boolean;
  lang?: string;
  translationKey?: string;
}

export function parseCliArgs(argv: readonly string[]): CliArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        publish: { type: "boolean" },
        draft: { type: "boolean" },
        "dry-run": { type: "boolean" },
        prod: { type: "boolean" },
        verify: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        lang: { type: "string" },
        "translation-key": { type: "string" },
      },
    });
  } catch (error) {
    throw new UsageError(
      error instanceof Error ? error.message : String(error),
    );
  }
  const { values, positionals } = parsed;
  if (positionals.length > 1) {
    throw new UsageError("give exactly one content file");
  }
  if (values.publish && values.draft) {
    throw new UsageError("--publish and --draft contradict each other");
  }
  if (
    values.verify &&
    (positionals.length > 0 ||
      values.publish ||
      values.draft ||
      values["dry-run"] ||
      values.lang !== undefined ||
      values["translation-key"] !== undefined)
  ) {
    throw new UsageError("--verify takes no file and no publish options");
  }
  return {
    file: positionals[0],
    publish: values.publish === true,
    draft: values.draft === true,
    dryRun: values["dry-run"] === true,
    prod: values.prod === true,
    verify: values.verify === true,
    help: values.help === true,
    lang: values.lang,
    translationKey: values["translation-key"],
  };
}

// ---------------------------------------------------------------------------
// Target database

export interface Target {
  url: string;
  /** Database name for the audit line (identifier characters only). */
  database: string;
  prod: boolean;
  options: DbOptions<ClientSsl>;
}

function databaseName(url: string, envName: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    throw new CliError(`${envName} is not a valid URL`);
  }
  let name: string;
  try {
    name = decodeURIComponent(pathname.slice(1));
  } catch {
    name = "";
  }
  return /^[A-Za-z0-9_.-]{1,63}$/.test(name) ? name : "<unprintable>";
}

/**
 * The connection for this run, checked before anything connects:
 * - local: PG_CONNECTION_URL through the local-DB guard (never an override
 *   here); the compose database has no TLS, so PG_SSL_MODE defaults to disable;
 * - --prod: only `envName` (the writer URL for a write, the reader URL for
 *   --verify) and the production TLS policy (SEC-22), regardless of NODE_ENV.
 */
export function selectTarget(
  prod: boolean,
  env: Env,
  envName: string,
  warn: (line: string) => void,
): Target {
  if (prod) {
    const url = env[envName]?.trim();
    if (!url) {
      throw new CliError(
        `${envName} is not set: --prod runs only inside ` +
          "`outplane env run --app <app> -- bun run content:publish ...`",
      );
    }
    const database = databaseName(url, envName);
    const { options } = clientConfig(url, { ...env, NODE_ENV: "production" });
    return { url, database, prod: true, options };
  }
  const url = env[READ_URL_ENV]?.trim() || undefined;
  const { database } = assertNonProdDb(url, {
    allowProd: false,
    hint: LOCAL_DB_HINT,
    warn,
  });
  const { options } = clientConfig(url!, {
    ...env,
    PG_SSL_MODE: env.PG_SSL_MODE?.trim() || "disable",
  });
  return { url: url!, database, prod: false, options };
}

// ---------------------------------------------------------------------------
// Database work (shared with later publish steps, e.g. PERF-05 diagrams)

export interface UpsertResult {
  id: number;
  slug: string;
  lang: PostLang;
  published: boolean;
  action: "inserted" | "updated";
}

export class LanguageConflict extends CliError {}

/**
 * One atomic statement (BE-16 step 6): insert, or update the row with the
 * same slug. published_at is set on the first publication only (BE-19).
 * A slug that already belongs to a post in another language is never
 * rewritten: the update is skipped and a LanguageConflict is thrown.
 */
export async function upsertPost(
  db: PostsDb,
  input: PublishInput,
): Promise<UpsertResult> {
  const fields = {
    title: input.title,
    content: input.content,
    excerpt: input.excerpt ?? null,
    coverImage: input.coverImage ?? null,
    translationKey: input.translationKey ?? null,
    seoTitle: input.seoTitle ?? null,
    published: input.published,
  };
  const rows = await db
    .insert(posts)
    .values({
      ...fields,
      slug: input.slug,
      lang: input.lang,
      publishedAt: input.published ? sql`now()` : null,
    })
    .onConflictDoUpdate({
      target: posts.slug,
      set: {
        ...fields,
        updatedAt: sql`now()`,
        ...(input.published && {
          publishedAt: sql`coalesce(${posts.publishedAt}, now())`,
        }),
      },
      setWhere: eq(posts.lang, input.lang),
    })
    .returning({
      id: posts.id,
      slug: posts.slug,
      lang: posts.lang,
      published: posts.published,
      // xmax is 0 for a freshly inserted row version.
      inserted: sql<boolean>`(xmax = 0)`,
    });
  const [row] = rows;
  if (!row) {
    throw new LanguageConflict(
      `slug "${input.slug}" already belongs to a post in another language; ` +
        "a translation needs its own slug (same translationKey)",
    );
  }
  return {
    id: row.id,
    slug: row.slug,
    lang: row.lang,
    published: row.published,
    action: row.inserted ? "inserted" : "updated",
  };
}

/** Published translations of a post (same translation_key, another row). */
export async function publishedTranslations(
  db: PostsDb,
  post: { id: number; translationKey?: string | null },
): Promise<{ lang: PostLang; slug: string }[]> {
  if (!post.translationKey) return [];
  return db
    .select({ lang: posts.lang, slug: posts.slug })
    .from(posts)
    .where(
      and(
        eq(posts.translationKey, post.translationKey),
        eq(posts.published, true),
        ne(posts.id, post.id),
      ),
    )
    .orderBy(posts.lang);
}

/**
 * SEC-14: true when the connected role can do more than posts DML (table
 * owner, superuser, role/database creation, or CREATE on schema public).
 */
export async function roleIsElevated(db: PostsDb): Promise<boolean> {
  type Row = { elevated: boolean };
  // postgres-js returns the rows, PGlite `{ rows }`.
  const result = (await db.execute(sql`
    select coalesce(
      (select r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolbypassrls
         from pg_roles r where r.rolname = current_user), false)
      or has_schema_privilege('public', 'CREATE')
      or coalesce(
        (select pg_has_role(c.relowner, 'USAGE') from pg_class c
          where c.oid = to_regclass('public.posts')), false) as elevated`)) as
    Row[] | { rows: Row[] };
  const rows = Array.isArray(result) ? result : result.rows;
  return rows[0]?.elevated === true;
}

/** The www URLs to purge in Cloudflare after a write (BE-06 / PERF-06). */
export function purgeUrls(
  post: { slug: string; lang: PostLang },
  translations: readonly { slug: string; lang: PostLang }[],
): string[] {
  const page = (p: { slug: string; lang: PostLang }) =>
    `${LOCALE_PREFIX[p.lang]}/blog/${p.slug}`;
  const locales = LOCALES as readonly PostLang[];
  const lists = [
    "/api/posts",
    ...locales.map((l) => `/api/posts?lang=${l}`),
    ...locales.flatMap((l) =>
      locales
        .filter((o) => o !== l)
        .map((o) => `/api/posts?lang=${l}&missingIn=${o}`),
    ),
  ];
  const paths = [
    page(post),
    ...translations.map(page),
    ...lists,
    `/api/posts/${post.slug}`,
    ...translations.map((t) => `/api/posts/${t.slug}`),
  ];
  return [...new Set(paths)].map((path) => SITE_URL + path);
}

/** A database error for the terminal: SQLSTATE and message, never the URL, host or role. */
export function describeDbError(error: unknown): string {
  for (let e = error, depth = 0; e && depth < 4; depth++) {
    if (!(e instanceof Error)) break;
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") {
      // SQLSTATE (no class starts with E, unlike EPIPE and friends): keep the
      // message, except authorization errors (class 28 names the role).
      if (/^[0-9A-DF-Z][0-9A-Z]{4}$/.test(code)) {
        return code.startsWith("28")
          ? `database error ${code}`
          : `database error ${code}: ${e.message}`;
      }
      // Network and TLS errors often name the host: the code only.
      return `database connection failed (${code})`;
    }
    e = e.cause;
  }
  if (error instanceof CliError) return error.message;
  if (error instanceof Error && !error.message.startsWith("Failed query")) {
    return error.message;
  }
  return "database error";
}

// ---------------------------------------------------------------------------
// Publish

interface AuditLine {
  event: "post_publish";
  action: UpsertResult["action"];
  id: number;
  slug: string;
  lang: PostLang;
  published: boolean;
  commit: string | null;
  dirty: boolean;
  db: string;
  prod: boolean;
  contentSha256: string;
  at: string;
}

async function readContentFile(path: string): Promise<string> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    throw new CliError(`cannot read ${path}`);
  }
  if (size > MAX_POST_INPUT_BYTES) {
    throw new CliError(`${path} is larger than ${MAX_POST_INPUT_BYTES} bytes`);
  }
  return Bun.file(path).text();
}

function refuseEnvFiles(d: Deps): void {
  if (d.envFilesLoaded) {
    throw new CliError(
      "--prod reads only the process environment, never .env files: " +
        "run it as `bun run content:publish` (Bun starts it with --no-env-file) " +
        "inside `outplane env run`",
    );
  }
}

async function publish(args: CliArgs, d: Deps): Promise<number> {
  if (args.prod) refuseEnvFiles(d);
  const path = resolve(args.file!);
  const text = await readContentFile(path);

  // SEC-15: production content is always a committed file.
  const git = fileGitState(path, d.git);
  if (args.prod && (git.commit === null || !git.tracked || git.dirty)) {
    throw new CliError(
      `uncommitted content cannot be written to production: commit ${args.file} ` +
        "first (it must be tracked by git and unchanged since the last commit)",
    );
  }

  const file = parsePostFile(text);
  const input = file.ok
    ? buildPublishInput(file.value, {
        lang: args.lang,
        translationKey: args.translationKey,
        published: args.publish,
      })
    : file;
  if (!input.ok) {
    for (const issue of input.issues)
      d.stderr(`${issue.path}: ${issue.message}`);
    return 1;
  }
  const post = input.value;

  if (args.dryRun) {
    d.stdout(
      [
        "dry run (no database connection)",
        `slug=${post.slug}`,
        `lang=${post.lang}`,
        `translationKey=${post.translationKey ?? "-"}`,
        `title=${JSON.stringify(post.title)}`,
        `seoTitle=${post.seoTitle === undefined ? "-" : JSON.stringify(post.seoTitle)}`,
        `excerpt=${post.excerpt === undefined ? "-" : `${post.excerpt.length} chars`}`,
        `content=${post.content.length} chars`,
        `published=${post.published}`,
      ].join("\n"),
    );
    return 0;
  }

  const target = selectTarget(args.prod, d.env, WRITE_URL_ENV, d.stderr);
  if (args.prod && !git.pushed) {
    d.stderr(
      `warning: commit ${git.commit!.slice(0, 12)} is not on a remote branch yet; push it so the audit trail is shared`,
    );
  }

  const { db, close } = d.openDb(target.url, target.options);
  let result: UpsertResult;
  let translations: { lang: PostLang; slug: string }[];
  try {
    if (target.prod && (await roleIsElevated(db))) {
      d.stderr(
        "warning: this database role can do more than posts DML; use the portfolio_writer role (scripts/sql/least-privilege.sql, SEC-14)",
      );
    }
    const [before] = await db
      .select({ published: posts.published })
      .from(posts)
      .where(eq(posts.slug, post.slug));
    if (before?.published && !post.published && !args.draft) {
      throw new CliError(
        `${post.slug} is public: pass --publish to keep it public, or --draft to take it down`,
      );
    }
    try {
      result = await upsertPost(db, post);
    } catch (error) {
      const conflict = postInputConflict(error);
      if (!conflict) throw error;
      for (const issue of conflict.body.issues ?? [])
        d.stderr(`${issue.path}: ${issue.message}`);
      throw new CliError(
        `conflict: another ${post.lang} post already uses translationKey "${post.translationKey}"`,
      );
    }
    if (before?.published && !result.published) {
      d.stderr(`note: ${post.slug} was public and is a draft now (--draft)`);
    }
    translations = await publishedTranslations(db, {
      id: result.id,
      translationKey: post.translationKey,
    });
  } finally {
    await close().catch(() => {});
  }

  d.stdout(
    `${result.action} id=${result.id} slug=${result.slug} lang=${result.lang} published=${result.published}`,
  );
  if (post.translationKey) {
    const present = new Set(translations.map((t) => t.lang));
    for (const lang of LOCALES as readonly PostLang[]) {
      if (lang !== result.lang && !present.has(lang)) {
        d.stdout(
          `no ${lang} translation yet; language switcher falls back to /blog`,
        );
      }
    }
  }
  d.stdout(
    "cache (CLAUDE.md): after 60 s GET each URL once with an extra cb=<n> query parameter, wait 5 s, then purge these in Cloudflare (www):",
  );
  for (const url of purgeUrls(result, translations)) d.stdout(`  ${url}`);

  const audit: AuditLine = {
    event: "post_publish",
    action: result.action,
    id: result.id,
    slug: result.slug,
    lang: result.lang,
    published: result.published,
    commit: git.commit,
    dirty: git.commit === null ? true : !git.tracked || git.dirty,
    db: target.database,
    prod: target.prod,
    contentSha256: sha256Hex(post.content).slice(0, 12),
    at: d.now().toISOString(),
  };
  d.stdout(JSON.stringify(audit));
  return 0;
}

// ---------------------------------------------------------------------------
// Verify (SEC-15)

const COMPARED_FIELDS = [
  "title",
  "content",
  "excerpt",
  "coverImage",
  "lang",
  "translationKey",
  "seoTitle",
] as const;
type ComparedField = (typeof COMPARED_FIELDS)[number];
type Comparable = Record<ComparedField, string | null>;

const comparable = (
  post: Partial<Record<ComparedField, unknown>>,
): Comparable =>
  Object.fromEntries(
    COMPARED_FIELDS.map((field) => [
      field,
      field === "content"
        ? sha256Hex(String(post.content ?? ""))
        : ((post[field] as string | null | undefined) ?? null),
    ]),
  ) as Comparable;

export type VerifyStatus =
  | { slug: string; status: "ok" | "missing" | "untracked" }
  | { slug: string; status: "drift"; fields: ComparedField[] };

/** Pure comparison of repository posts with database rows, sorted by slug. */
export function comparePosts(
  files: readonly (Partial<Record<ComparedField, unknown>> & {
    slug: string;
  })[],
  rows: readonly (Partial<Record<ComparedField, unknown>> & { slug: string })[],
): VerifyStatus[] {
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const out: VerifyStatus[] = [];
  for (const file of files) {
    const row = bySlug.get(file.slug);
    bySlug.delete(file.slug);
    if (!row) {
      out.push({ slug: file.slug, status: "missing" });
      continue;
    }
    const a = comparable(file);
    const b = comparable(row);
    const fields = COMPARED_FIELDS.filter((field) => a[field] !== b[field]);
    out.push(
      fields.length > 0
        ? { slug: file.slug, status: "drift", fields }
        : { slug: file.slug, status: "ok" },
    );
  }
  for (const slug of bySlug.keys()) out.push({ slug, status: "untracked" });
  return out.sort((x, y) => (x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0));
}

async function verify(args: CliArgs, d: Deps): Promise<number> {
  if (args.prod) refuseEnvFiles(d);

  let names: string[];
  try {
    names = (await readdir(d.contentDir))
      .filter((n) => n.endsWith(".md"))
      .sort();
  } catch {
    throw new CliError("cannot read the content directory (content/posts)");
  }
  let valid = true;
  const files: PublishInput[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const parsed = parsePostFile(
      await readContentFile(join(d.contentDir, name)),
    );
    const input = parsed.ok
      ? buildPublishInput(parsed.value, { published: false })
      : parsed;
    if (!input.ok) {
      valid = false;
      d.stdout(`${name} invalid`);
      for (const issue of input.issues)
        d.stderr(`${name}: ${issue.path}: ${issue.message}`);
      continue;
    }
    if (seen.has(input.value.slug)) {
      valid = false;
      d.stdout(`${name} invalid`);
      d.stderr(`${name}: slug: "${input.value.slug}" is used by another file`);
      continue;
    }
    seen.add(input.value.slug);
    files.push(input.value);
  }

  const target = selectTarget(args.prod, d.env, READ_URL_ENV, d.stderr);
  const { db, close } = d.openDb(target.url, target.options);
  let rows: (Partial<Record<ComparedField, unknown>> & { slug: string })[];
  try {
    rows = await db
      .select({
        slug: posts.slug,
        title: posts.title,
        content: posts.content,
        excerpt: posts.excerpt,
        coverImage: posts.coverImage,
        lang: posts.lang,
        translationKey: posts.translationKey,
        seoTitle: posts.seoTitle,
      })
      .from(posts);
  } finally {
    await close().catch(() => {});
  }

  const statuses = comparePosts(files, rows);
  for (const s of statuses) {
    d.stdout(
      s.status === "drift"
        ? `${s.slug} drift ${s.fields.join(",")}`
        : `${s.slug} ${s.status}`,
    );
  }
  return valid && statuses.every((s) => s.status === "ok") ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Entry

export async function main(
  argv: readonly string[],
  deps: Partial<Deps> = {},
): Promise<number> {
  const d: Deps = { ...defaultDeps(), ...deps };
  try {
    const args = parseCliArgs(argv);
    if (args.help) {
      d.stdout(USAGE);
      return 0;
    }
    if (args.verify) return await verify(args, d);
    if (!args.file) {
      d.stderr(USAGE);
      return 1;
    }
    return await publish(args, d);
  } catch (error) {
    d.stderr(`error: ${describeDbError(error)}`);
    if (error instanceof UsageError) d.stderr(USAGE);
    return 1;
  }
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const envFilesDisabled = process.execArgv.includes("--no-env-file");
  if (envFilesDisabled && !argv.includes("--prod")) {
    // Local run: start again with Bun's .env loading (the local DB URL, K-02).
    const child = Bun.spawn([process.execPath, import.meta.path, ...argv], {
      stdio: ["inherit", "inherit", "inherit"],
      env: process.env,
    });
    process.exit(await child.exited);
  }
  process.exit(await main(argv, { envFilesLoaded: !envFilesDisabled }));
}
