// Shared fixtures for the SEO-01 server layer tests (tests/server/ssr):
// posts, query fakes, sites over the fixture dist and small HTML readers.
import { Hono } from "hono";
import type {
  PostQueries,
  PostWithTranslations,
} from "../../../src/db/queries/posts";
import { resolveForLocale } from "../../../src/db/queries/posts";
import { mountSite, type MountSiteOptions } from "../../../src/server/static";
import type { RenderPage } from "../../../src/server/ssr";
import { FIXTURE_DIST } from "../helpers";
// @ts-expect-error: a .jsx module without declarations. Bun compiles the JSX
// and ignores the stylesheet imports, so the tests draw the real pages.
import { render as renderApp } from "../../../src/entry-server.jsx";

export { FIXTURE_DIST };

/** The real server render (src/entry-server.jsx) straight from source (PERF-03). */
export const render: RenderPage = renderApp;

/** Three headings (one h2, two h3), a list, a table, a footnote and a diagram. */
export const POST_MARKDOWN = `Intro paragraph with **bold** text and a [link](https://example.com/page).

## First section

Some words here.[^1]

### A detail

- one
- two

### Another detail

| a | b |
| - | - |
| 1 | 2 |

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

[^1]: The footnote.
`;

export function makePost(
  overrides: Partial<PostWithTranslations> = {},
): PostWithTranslations {
  return {
    id: 1,
    slug: "hello-world",
    title: "Hello world",
    content: POST_MARKDOWN,
    excerpt: "A short excerpt of the post.",
    coverImage: null,
    published: true,
    createdAt: new Date("2026-09-30T10:00:00Z"),
    updatedAt: new Date("2026-09-30T10:00:00Z"),
    publishedAt: new Date("2026-09-30T10:00:00Z"),
    lang: "en",
    translationKey: "hello",
    seoTitle: null,
    translations: [{ lang: "tr", slug: "merhaba-dunya" }],
    ...overrides,
  };
}

export const EN_POST = makePost();
export const TR_POST = makePost({
  id: 2,
  slug: "merhaba-dunya",
  title: "Merhaba dünya",
  excerpt: "Yazının kısa özeti.",
  lang: "tr",
  translations: [{ lang: "en", slug: "hello-world" }],
});
export const TR_ONLY_POST = makePost({
  id: 3,
  slug: "sadece-turkce",
  title: "Sadece Türkçe",
  excerpt: "Çevirisi olmayan yazı.",
  lang: "tr",
  translationKey: null,
  translations: [],
  createdAt: new Date("2026-09-29T10:00:00Z"),
  updatedAt: new Date("2026-09-29T10:00:00Z"),
  publishedAt: new Date("2026-09-29T10:00:00Z"),
});

/** A list row as the query returns it: the post without its content. */
export const card = (post: PostWithTranslations) => {
  const {
    content: _c,
    published: _p,
    seoTitle: _s,
    translations: _t,
    ...row
  } = post;
  return { ...row, cursor: "c" };
};

export interface FakeQueryOptions {
  posts?: PostWithTranslations[];
  /** Counts calls per method (assert that a cache or a filter spared the database). */
  calls?: Record<string, number>;
}

/** In-memory PostQueries over `posts` (published ones only, like the real module). */
export function fakeQueries({
  posts = [EN_POST, TR_POST, TR_ONLY_POST],
  calls = {},
}: FakeQueryOptions = {}): PostQueries {
  const count = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1;
  };
  const bySlug = (slug: string) =>
    posts.find((post) => post.slug === slug && post.published) ?? null;
  return {
    listPublishedPosts: async ({ lang, missingIn, limit = 20 } = {}) => {
      count("listPublishedPosts");
      return posts
        .filter((post) => post.published)
        .filter((post) => !lang || post.lang === lang)
        .filter(
          (post) =>
            !missingIn ||
            !post.translationKey ||
            !posts.some(
              (other) =>
                other.translationKey === post.translationKey &&
                other.lang === missingIn &&
                other.published,
            ),
        )
        .slice(0, limit)
        .map(card) as never;
    },
    getPublishedPostBySlug: async (slug) => {
      count("getPublishedPostBySlug");
      return bySlug(slug);
    },
    getPostForLocale: async (slug, locale) => {
      count("getPostForLocale");
      return resolveForLocale(bySlug(slug), locale);
    },
    ping: async () => {},
  };
}

/** mountSite over the fixture dist with injection on and the real server render. */
export function siteWith(
  queries: MountSiteOptions["queries"],
  options: Partial<MountSiteOptions> = {},
): Hono {
  const app = new Hono();
  mountSite(app, { distDir: FIXTURE_DIST, queries, render, ...options });
  return app;
}

/** Number of matches of `pattern` in `text`. */
export const count = (text: string, pattern: RegExp) =>
  (text.match(pattern) ?? []).length;

/** The text of <div id="root">…</div> (the server render), or "". */
export function rootOf(page: string): string {
  const start = page.indexOf('<div id="root"');
  const end = page.indexOf('<script id="__SEO_DATA__"');
  if (start === -1) return "";
  return page.slice(start, end === -1 ? undefined : end);
}

/** Visible words of an HTML fragment: tags dropped, entities left alone. */
export const wordCount = (fragment: string) =>
  fragment
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
