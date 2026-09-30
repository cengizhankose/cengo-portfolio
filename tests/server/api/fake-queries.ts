// In-memory stand-in for createPostQueries(db): createApp tests need no database.
import type {
  Post,
  PostQueries,
  PostWithTranslations,
} from "../../../src/db/queries/posts";
import { resolveForLocale } from "../../../src/db/queries/posts";

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

/** Captures console.log lines (the JSON logger's sink) while `fn` runs. */
export async function captureLogs<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; lines: Record<string, unknown>[] }> {
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
