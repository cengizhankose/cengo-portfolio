// Shared helpers for the server test layer (BE-17, T-02): `bun test` +
// `app.request`, no port and no database. createApp() takes an injected query
// object (T-06), so these fakes stand in for createPostQueries(db).
import { afterAll, beforeAll } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  Post,
  PostQueries,
  PostWithTranslations,
} from "../../src/db/queries/posts";
import { resolveForLocale } from "../../src/db/queries/posts";

export const REPO_ROOT = join(import.meta.dir, "../..");
/** Mini Vite build output used by every site-handler test (T-11). */
export const FIXTURE_DIST = join(REPO_ROOT, "tests/server/fixtures/dist");

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const SAMPLE_POST: PostWithTranslations = {
  id: 1,
  slug: "hello-world",
  title: "Hello",
  content: "body",
  excerpt: null,
  coverImage: null,
  published: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  publishedAt: new Date("2026-01-01T00:00:00Z"),
  lang: "en",
  translationKey: "hello-world",
  seoTitle: null,
  translations: [{ lang: "tr", slug: "merhaba-dunya" }],
};

/** In-memory stand-in for createPostQueries(db): one published EN post with a TR translation. */
export function fakeQueries(overrides: Partial<PostQueries> = {}): PostQueries {
  const { translations: _t, ...listItem } = SAMPLE_POST;
  return {
    listPublishedPosts: async () => [listItem as Post],
    getPublishedPostBySlug: async (slug) =>
      slug === SAMPLE_POST.slug ? SAMPLE_POST : null,
    getPostForLocale: async (slug, locale) =>
      resolveForLocale(slug === SAMPLE_POST.slug ? SAMPLE_POST : null, locale),
    ping: async () => {},
    ...overrides,
  };
}

/**
 * Wraps every method of `base` and records the method names called, for
 * "the query object is never called" assertions (write routes, rejected slugs).
 */
export function spyQueries(base: PostQueries = fakeQueries()): {
  queries: PostQueries;
  calls: string[];
} {
  const calls: string[] = [];
  const queries = Object.fromEntries(
    Object.entries(base).map(([name, method]) => [
      name,
      (...args: unknown[]) => {
        calls.push(name);
        return (method as (...a: unknown[]) => unknown)(...args);
      },
    ]),
  ) as PostQueries;
  return { queries, calls };
}

/** Every query rejects, as with a database that is down. */
export function failingQueries(
  error: Error = new Error("connect ECONNREFUSED"),
): PostQueries {
  const fail = async (): Promise<never> => {
    throw error;
  };
  return {
    listPublishedPosts: fail,
    getPublishedPostBySlug: fail,
    getPostForLocale: fail,
    ping: fail,
  };
}

/** Captures console.log lines (the JSON logger's sink) while `fn` runs. */
export async function captureLogs<T>(
  fn: () => T | Promise<T>,
): Promise<{ result: Awaited<T>; lines: Record<string, unknown>[] }> {
  const original = console.log;
  const lines: Record<string, unknown>[] = [];
  console.log = (...args: unknown[]) => {
    try {
      lines.push(JSON.parse(String(args[0])));
    } catch {
      lines.push({ raw: args.map(String).join(" ") });
    }
  };
  try {
    return { result: await fn(), lines };
  } finally {
    console.log = original;
  }
}

/**
 * Drops console.log output (the request log) for the rest of the calling test
 * file. For files that only assert on responses; log content is tested with
 * captureLogs.
 */
export function silenceLogs(): void {
  const original = console.log;
  beforeAll(() => {
    console.log = () => {};
  });
  afterAll(() => {
    console.log = original;
  });
}

/**
 * True when `path` (repo-relative) is in this checkout. The Docker build
 * context leaves out Dockerfile*, docker-compose*, root *.md and .git
 * (.dockerignore), so repository-hygiene tests that read those files run
 * locally and in CI, and are skipped inside the image's test gate.
 */
export function inCheckout(path: string): boolean {
  return existsSync(join(REPO_ROOT, path));
}
