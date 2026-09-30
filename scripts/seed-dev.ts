#!/usr/bin/env bun
// Seed the local development database (K-02 = A; BE-04 / SEC-06; T-12 for BE-19).
//
//   bun run db:seed                -> EN/TR translation pair (hello-world <-> merhaba-dunya),
//                                     one TR post without translation (sadece-turkce)
//                                     and one TR draft (taslak-ornek)
//   bun run db:seed -- --from-live -> also copies the PUBLISHED posts from the public,
//                                     unauthenticated API (no production credentials)
//
// Idempotent: rows are inserted with ON CONFLICT (slug) DO NOTHING.
// This script only ever writes to a local *_dev / *_test database: neither
// --prod nor ALLOW_REMOTE_DB=1 lifts that for seeding.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";
import { POST_LANGS, posts, type PostLang } from "../src/db/schema";
import { assertNonProdDb } from "../src/db/guard";
import type { PostsDb } from "../src/db/queries/posts";

export type NewPost = typeof posts.$inferInsert;

export const DRAFT_SLUG = "taslak-ornek";
export const TRANSLATION_KEY = "hello-world";
export const LIVE_POSTS_URL = "https://www.cengizhankose.com/api/posts";
export const SEED_REFUSAL_HINT =
  "db:seed never writes to a remote database; --prod and ALLOW_REMOTE_DB=1 do not apply here";
const MAX_LIVE_RESPONSE_BYTES = 5 * 1024 * 1024;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const at = (iso: string) => new Date(iso);

// Obvious development fixtures: they never leave the local database.
export const DEV_SEED_POSTS: NewPost[] = [
  {
    slug: "hello-world",
    lang: "en",
    translationKey: TRANSLATION_KEY,
    title: "Dev seed: Hello world (Markdown sampler)",
    excerpt:
      "Local development fixture covering headings, lists, code and a table. Translated as merhaba-dunya.",
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
    createdAt: at("2026-01-03T09:00:00Z"),
    updatedAt: at("2026-01-03T09:00:00Z"),
    publishedAt: at("2026-01-03T09:00:00Z"),
  },
  {
    slug: "merhaba-dunya",
    lang: "tr",
    translationKey: TRANSLATION_KEY,
    title: "Dev seed: Merhaba dünya (Markdown örnekleri)",
    excerpt:
      "Yerel geliştirme verisi: başlık, liste, kod ve tablo. İngilizcesi hello-world.",
    content: [
      "## Başlıklar ve listeler",
      "",
      "Bu yazı yalnız yerel geliştirme veritabanında bulunur.",
      "",
      "- birinci madde",
      "- `satır içi kod` içeren ikinci madde",
      "",
      "```ts",
      "const selam: string = 'merhaba'",
      "```",
      "",
      "| Sütun | Değer |",
      "| ----- | ----- |",
      "| a     | 1     |",
    ].join("\n"),
    published: true,
    createdAt: at("2026-01-02T09:00:00Z"),
    updatedAt: at("2026-01-02T09:00:00Z"),
    publishedAt: at("2026-01-02T09:00:00Z"),
  },
  {
    slug: "sadece-turkce",
    lang: "tr",
    translationKey: null,
    title: "Dev seed: Yalnız Türkçe (Mermaid ve uzun metin)",
    excerpt:
      "Çevirisi olmayan yerel geliştirme verisi: bir Mermaid diyagramı ve birkaç paragraf.",
    content: [
      "Mermaid çizicisini yerelde denemek için tek bir diyagram.",
      "",
      "```mermaid",
      "flowchart LR",
      "  A[Taslak] --> B{İnceleme}",
      "  B -->|tamam| C[Yayın]",
      "  B -->|değişiklik| A",
      "```",
      "",
      ...Array.from(
        { length: 6 },
        (_, i) =>
          `Paragraf ${i + 1}. Satır uzunluğu, boşluk ve okuma ilerlemesini denemek için ` +
          "yer tutucu metin. Gerçek içerik taşımaz.",
      ).flatMap((p) => [p, ""]),
    ]
      .join("\n")
      .trimEnd(),
    published: true,
    createdAt: at("2026-01-01T09:00:00Z"),
    updatedAt: at("2026-01-01T09:00:00Z"),
    publishedAt: at("2026-01-01T09:00:00Z"),
  },
  {
    slug: DRAFT_SLUG,
    lang: "tr",
    translationKey: null,
    title: "Dev seed: yayınlanmamış taslak",
    excerpt: "Must never be returned by the public API (BE-03 / SEC-08).",
    content: "This draft exists to prove that unpublished posts stay hidden.",
    published: false,
    createdAt: at("2026-01-04T09:00:00Z"),
    updatedAt: at("2026-01-04T09:00:00Z"),
    publishedAt: null,
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

// T-12: the live posts that predate `lang` are Turkish (the 0001 backfill).
function liveLang(value: unknown, index: number): PostLang {
  if (value === undefined || value === null) return "tr";
  if (typeof value === "string" && (POST_LANGS as readonly string[]).includes(value))
    return value as PostLang;
  throw new Error(`Live post #${index}: invalid lang`);
}

/** Validates the public list response and maps it to insertable, published rows. */
export function parseLivePosts(data: unknown): NewPost[] {
  if (!Array.isArray(data))
    throw new Error("Unexpected live response: expected an array of posts");
  return data.map((item, index) => {
    if (typeof item !== "object" || item === null)
      throw new Error(`Live post #${index}: not an object`);
    const {
      slug,
      title,
      content,
      excerpt,
      coverImage,
      createdAt,
      updatedAt,
      publishedAt,
      lang,
      translationKey,
      seoTitle,
    } = item as Record<string, unknown>;
    if (typeof slug !== "string" || slug.length > 200 || !SLUG.test(slug)) {
      throw new Error(`Live post #${index}: invalid slug`);
    }
    if (typeof title !== "string" || title.length === 0)
      throw new Error(`Live post #${index}: invalid title`);
    if (typeof content !== "string")
      throw new Error(`Live post #${index}: invalid content`);
    const key = optionalString(translationKey, "translationKey", index);
    if (key !== null && (key.length > 200 || !SLUG.test(key)))
      throw new Error(`Live post #${index}: invalid translationKey`);
    const created = optionalDate(createdAt);
    return {
      slug,
      title,
      content,
      excerpt: optionalString(excerpt, "excerpt", index),
      coverImage: optionalString(coverImage, "coverImage", index),
      seoTitle: optionalString(seoTitle, "seoTitle", index),
      lang: liveLang(lang, index),
      translationKey: key,
      published: true,
      createdAt: created,
      updatedAt: optionalDate(updatedAt),
      publishedAt: optionalDate(publishedAt) ?? created ?? null,
    };
  });
}

/** Reads at most `maxBytes` of the body; a larger (or larger-declared) body is refused. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const tooLarge = () => new Error("Live response is unexpectedly large");
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Reads the published posts from the public API (read-only, no credentials). */
export async function fetchLivePosts(
  fetchImpl: typeof fetch = fetch,
  maxBytes: number = MAX_LIVE_RESPONSE_BYTES,
): Promise<NewPost[]> {
  const res = await fetchImpl(LIVE_POSTS_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GET ${LIVE_POSTS_URL} returned ${res.status}`);
  return parseLivePosts(JSON.parse(await readCapped(res, maxBytes)));
}

async function main() {
  const url = process.env.PG_CONNECTION_URL;
  // Seeding writes fixture data: never allowed outside a local dev database.
  const { database } = assertNonProdDb(url, {
    allowProd: false,
    hint: SEED_REFUSAL_HINT,
  });
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
