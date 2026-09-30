// <head> tags of a page, as text (SEO-01, T-03, T-06 Aşama 1).
//
// renderHeadTags() prints what getPageMeta() (src/seo/pages.js) returns and
// nothing else: it has no metadata value of its own. usePageMeta
// (src/seo/usePageMeta.js) writes the very same values into the browser's
// <head>, in place, so the raw HTML and the rendered DOM carry one title, one
// description and one of every other tag (T-03). Every tag it prints carries
// `data-seo`, which is how usePageMeta finds and reuses it.
//
// Order: title, description, robots, canonical, hreflang alternates, the Open
// Graph / Twitter / article tags in socialTags() order (og:locale:alternate
// repeats), the JSON-LD block, then the page's resource hints (the hero preload)
// and the stylesheets of a lazily loaded page. A field that is null (a 404, a
// noindex page, a post that has no data) prints nothing, which
// is what makes the canonical, the share card and the structured data of a 404
// absent (SEO-02, SEO-04, SEO-06, SEO-07).
//
// Values are HTML-escaped; the JSON-LD block is serialised by serializeJsonLd()
// (src/seo/jsonld.js), which escapes `<`, `>` and `&`, so a post title cannot
// close the script element. Nothing here reads the request: the host and the
// URLs come from the page registry (K-03).
import { serializeJsonLd } from "./jsonld.js";
import { pages, socialTags } from "./pages.js";
import { DEFAULT_LOCALE } from "./site.js";

const MARK = " data-seo";
const JSON_LD_ID = "ld-json";

/** getPageMeta()'s result: the fields the head prints (JS module, loose shape). */
export interface HeadMeta {
  title?: string | null;
  description?: string | null;
  robots?: string | null;
  lang?: string | null;
  alternates?: { hreflang: string; href: string }[] | null;
  canonical?: string | null;
  og?: unknown;
  twitter?: unknown;
  jsonLd?: unknown;
}

/** A resource hint from the page registry (src/seo/pages/home.js `preload`). */
export type Preload = Readonly<Record<string, string>>;

/** The one HTML escape of the server layer: text and double-quoted attribute values. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const has = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

// Attributes a registry preload may set, in print order after `rel` and `as`.
const PRELOAD_ATTRIBUTES = [
  "type",
  "href",
  "imagesrcset",
  "imagesizes",
  "fetchpriority",
  "crossorigin",
  "media",
] as const;

function preloadTag(preload: Preload): string {
  const as = preload.as;
  if (!has(as)) return "";
  const attributes = PRELOAD_ATTRIBUTES.filter((name) => has(preload[name]))
    .map((name) => ` ${name}="${escapeHtml(preload[name])}"`)
    .join("");
  return `<link rel="preload" as="${escapeHtml(as)}"${attributes}>`;
}

/**
 * The resource hint the registry gives `route` in `locale`, or null.
 * PERF-01: only the home page (`/` and `/tr`) has one, the hero photo; a blog
 * page that loaded it would download ~90 KB it never draws. Read from the
 * registry entry, not from getPageMeta(), so the hint stays out of the client's
 * head management.
 */
export function preloadFor(
  route: { type?: string; path?: string } | null | undefined,
  locale: string,
): Preload | null {
  if (route?.type !== "static" || !route.path) return null;
  const entry = (pages as Record<string, any>)[route.path];
  const values = entry?.[locale] ?? entry?.[DEFAULT_LOCALE];
  return values?.preload ?? null;
}

/**
 * The head tags of a page as one string, ready for injectIntoShell().
 * `preload` is the resource hint of the page (preloadFor()), if any.
 */
export function renderHeadTags(
  meta: HeadMeta,
  {
    preload,
    stylesheets = [],
  }: { preload?: Preload | null; stylesheets?: readonly string[] } = {},
): string {
  const tags: string[] = [];

  if (has(meta.title)) {
    tags.push(`<title${MARK}>${escapeHtml(meta.title)}</title>`);
  }
  if (has(meta.description)) {
    tags.push(
      `<meta name="description" content="${escapeHtml(meta.description)}"${MARK}>`,
    );
  }
  if (has(meta.robots)) {
    tags.push(
      `<meta name="robots" content="${escapeHtml(meta.robots)}"${MARK}>`,
    );
  }
  if (has(meta.canonical)) {
    tags.push(
      `<link rel="canonical" href="${escapeHtml(meta.canonical)}"${MARK}>`,
    );
  }
  for (const alternate of meta.alternates ?? []) {
    if (!has(alternate?.hreflang) || !has(alternate?.href)) continue;
    tags.push(
      `<link rel="alternate" hreflang="${escapeHtml(alternate.hreflang)}" href="${escapeHtml(alternate.href)}"${MARK}>`,
    );
  }
  for (const { attribute, key, content } of socialTags(meta) as {
    attribute: string;
    key: string;
    content: string;
  }[]) {
    tags.push(
      `<meta ${escapeHtml(attribute)}="${escapeHtml(key)}" content="${escapeHtml(content)}"${MARK}>`,
    );
  }
  if (meta.jsonLd !== undefined && meta.jsonLd !== null) {
    tags.push(
      `<script type="application/ld+json" id="${JSON_LD_ID}"${MARK}>${serializeJsonLd(meta.jsonLd)}</script>`,
    );
  }
  if (preload) {
    const tag = preloadTag(preload);
    if (tag) tags.push(tag);
  }
  // Stylesheets of a lazily loaded page (src/seo/inject.ts findStylesheets()),
  // so the snapshot is drawn with them from the first paint.
  for (const href of stylesheets) {
    tags.push(`<link rel="stylesheet" href="${escapeHtml(href)}">`);
  }

  return tags.join("");
}
