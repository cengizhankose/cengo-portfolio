import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/** Blog post languages (T-12): `en` is the default locale, `tr` lives under `/tr`. */
export const POST_LANGS = ["en", "tr"] as const;
export type PostLang = (typeof POST_LANGS)[number];

/**
 * One pre-rendered Mermaid diagram (PERF-05 / T-05 stage B): the accessible
 * name and one sanitised SVG per theme. Keyed by diagramKey() of the block's
 * source (src/lib/diagram-key.js); the markdown body keeps the source.
 */
export interface PostDiagram {
  label: string;
  light: string;
  dark: string;
}
export type PostDiagrams = Record<string, PostDiagram>;

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
    // PERF-05: the ```mermaid blocks of `content`, drawn at publish time. Null
    // until a post is (re)published with the CLI; readers treat it as none.
    // A separate column, never part of `content` (SEC-03 sanitises the body).
    diagrams: jsonb("diagrams").$type<PostDiagrams>(),
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
