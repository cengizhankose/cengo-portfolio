#!/usr/bin/env bun
// Seed the local development database (K-02 = A; BE-04 / SEC-06).
//
//   bun run db:seed                -> 3 published sample posts + 1 draft (slug: taslak-ornek)
//   bun run db:seed -- --from-live -> also copies the PUBLISHED posts from the public,
//                                     unauthenticated API (no production credentials)
//
// Idempotent: rows are inserted with ON CONFLICT (slug) DO NOTHING.
// This script only ever writes to a local *_dev / *_test database: neither
// --prod nor ALLOW_REMOTE_DB=1 lifts that for seeding.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";
import { posts } from "../src/db/schema";
import { assertNonProdDb } from "../src/db/guard";
import type { PostsDb } from "../src/db/queries/posts";

export type NewPost = typeof posts.$inferInsert;

export const DRAFT_SLUG = "taslak-ornek";
export const LIVE_POSTS_URL = "https://www.cengizhankose.com/api/posts";
const MAX_LIVE_RESPONSE_BYTES = 5 * 1024 * 1024;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Obvious development fixtures: they never leave the local database.
export const DEV_SEED_POSTS: NewPost[] = [
  {
    slug: "dev-seed-markdown-sampler",
    title: "Dev seed: Markdown sampler",
    excerpt:
      "Local development fixture covering headings, lists, code and a table.",
    content: [
      "## Headings and lists",
      "",
      "This post exists only in the local development database.",
      "",
      "- first item",
      "- second item with `inline code`",
      "",
      "```ts",
      "const greeting: string = 'hello'",
      "```",
      "",
      "| Column | Value |",
      "| ------ | ----- |",
      "| a      | 1     |",
    ].join("\n"),
    published: true,
    createdAt: new Date("2026-01-03T09:00:00Z"),
    updatedAt: new Date("2026-01-03T09:00:00Z"),
  },
  {
    slug: "dev-seed-mermaid-diagram",
    title: "Dev seed: Mermaid diagram",
    excerpt: "Local development fixture with one Mermaid flowchart.",
    content: [
      "A single diagram to exercise the Mermaid renderer locally.",
      "",
      "```mermaid",
      "flowchart LR",
      "  A[Draft] --> B{Review}",
      "  B -->|ok| C[Publish]",
      "  B -->|changes| A",
      "```",
    ].join("\n"),
    published: true,
    createdAt: new Date("2026-01-02T09:00:00Z"),
    updatedAt: new Date("2026-01-02T09:00:00Z"),
  },
  {
    slug: "dev-seed-long-read",
    title: "Dev seed: Long read",
    excerpt:
      "Local development fixture with several paragraphs for layout checks.",
    content: Array.from(
      { length: 8 },
      (_, i) =>
        `Paragraph ${i + 1}. Placeholder text for checking line length, spacing and ` +
        "reading progress in the local blog layout. It carries no real content.",
    ).join("\n\n"),
    published: true,
    createdAt: new Date("2026-01-01T09:00:00Z"),
    updatedAt: new Date("2026-01-01T09:00:00Z"),
  },
  {
    slug: DRAFT_SLUG,
    title: "Dev seed: unpublished draft",
    excerpt: "Must never be returned by the public API (BE-03 / SEC-08).",
    content: "This draft exists to prove that unpublished posts stay hidden.",
    published: false,
    createdAt: new Date("2026-01-04T09:00:00Z"),
    updatedAt: new Date("2026-01-04T09:00:00Z"),
  },
];

/** Inserts rows, keeping any existing slug untouched. Returns the number inserted. */
export async function seedDevPosts(
  db: PostsDb,
  rows: NewPost[] = DEV_SEED_POSTS,
): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(posts)
    .values(rows)
    .onConflictDoNothing({ target: posts.slug })
    .returning({ slug: posts.slug });
  return inserted.length;
}

function optionalString(
  value: unknown,
  field: string,
  index: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string")
    throw new Error(`Live post #${index}: "${field}" must be a string`);
  return value;
}

function optionalDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Validates the public list response and maps it to insertable, published rows. */
export function parseLivePosts(data: unknown): NewPost[] {
  if (!Array.isArray(data))
    throw new Error("Unexpected live response: expected an array of posts");
  return data.map((item, index) => {
    if (typeof item !== "object" || item === null)
      throw new Error(`Live post #${index}: not an object`);
    const { slug, title, content, excerpt, coverImage, createdAt, updatedAt } =
      item as Record<string, unknown>;
    if (typeof slug !== "string" || slug.length > 200 || !SLUG.test(slug)) {
      throw new Error(`Live post #${index}: invalid slug`);
    }
    if (typeof title !== "string" || title.length === 0)
      throw new Error(`Live post #${index}: invalid title`);
    if (typeof content !== "string")
      throw new Error(`Live post #${index}: invalid content`);
    return {
      slug,
      title,
      content,
      excerpt: optionalString(excerpt, "excerpt", index),
      coverImage: optionalString(coverImage, "coverImage", index),
      published: true,
      createdAt: optionalDate(createdAt),
      updatedAt: optionalDate(updatedAt),
    };
  });
}

/** Reads the published posts from the public API (read-only, no credentials). */
export async function fetchLivePosts(
  fetchImpl: typeof fetch = fetch,
): Promise<NewPost[]> {
  const res = await fetchImpl(LIVE_POSTS_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GET ${LIVE_POSTS_URL} returned ${res.status}`);
  const body = await res.text();
  if (body.length > MAX_LIVE_RESPONSE_BYTES)
    throw new Error("Live response is unexpectedly large");
  return parseLivePosts(JSON.parse(body));
}

async function main() {
  const url = process.env.PG_CONNECTION_URL;
  // Seeding writes fixture data: never allowed outside a local dev database.
  const { database } = assertNonProdDb(url, { allowProd: false });
  const client = postgres(url!, { max: 1 });
  const db = drizzle(client, { schema });
  try {
    const sample = await seedDevPosts(db);
    console.log(
      `[seed] ${database}: ${sample} sample post(s) inserted, existing slugs kept`,
    );
    if (process.argv.includes("--from-live")) {
      const live = await fetchLivePosts();
      const copied = await seedDevPosts(db, live);
      console.log(
        `[seed] ${database}: ${copied} of ${live.length} published post(s) copied from ${LIVE_POSTS_URL}`,
      );
    }
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`[seed] ${(error as Error).message}`);
    process.exit(1);
  });
}
