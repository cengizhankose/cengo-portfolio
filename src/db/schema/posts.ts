import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/** Blog post languages (T-12): `en` is the default locale, `tr` lives under `/tr`. */
export const POST_LANGS = ["en", "tr"] as const;
export type PostLang = (typeof POST_LANGS)[number];

export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    excerpt: text("excerpt"),
    coverImage: text("cover_image"),
    published: boolean("published").notNull().default(false),
    // timestamptz (BE-19): instants no longer depend on the DB session time zone.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // First publication instant: SEO datePublished and the date shown to readers.
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // T-12: language of this post; rows sharing a translation_key translate each other.
    lang: text("lang", { enum: POST_LANGS }).notNull(),
    translationKey: text("translation_key"),
    // SEO-10: optional <title> override; null falls back to `title`.
    seoTitle: text("seo_title"),
  },
  (t) => [
    // Per-language list (BE-19 / T-12): WHERE lang = ? AND published ORDER BY created_at DESC.
    index("posts_lang_published_created_at_idx").on(
      t.lang,
      t.published,
      t.createdAt.desc().nullsFirst(),
    ),
    // Language-less list (PERF-22): WHERE published ORDER BY created_at DESC.
    index("posts_published_created_at_idx")
      .on(t.createdAt.desc().nullsFirst())
      .where(sql`${t.published} = true`),
    unique("posts_translation_key_lang_unique").on(t.translationKey, t.lang),
    check("posts_lang_check", sql`${t.lang} in ('en', 'tr')`),
  ],
);
