/**
 * The live post through the server layer (SEO-01 criteria 1-3, PERF-01,
 * PERF-03): its words, headings and language in the raw HTML of the page the
 * server sends.
 * The text is content/posts/atlas-steward-…tr.md, the export of the live post.
 * Skipped when that file is not in the checkout.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePostFile } from "../../../scripts/content/post-file";
import {
  makePost,
  count,
  fakeQueries,
  rootOf,
  siteWith,
  wordCount,
} from "./helpers";

const FILE = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "content/posts/atlas-steward-laya-konustan-yarim-is-cikaran-sistem.tr.md",
);

describe.skipIf(!existsSync(FILE))("the live post", () => {
  const parsed = parsePostFile(readFileSync(FILE, "utf8"));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const { frontmatter, body } = parsed.value;

  const slug = String(frontmatter.slug);
  const post = makePost({
    id: 9,
    slug,
    title: String(frontmatter.title),
    seoTitle: String(frontmatter.seoTitle),
    excerpt: String(frontmatter.excerpt),
    content: body,
    lang: "tr",
    translationKey: null,
    translations: [],
  });
  const site = siteWith(fakeQueries({ posts: [post] }));
  const page = async () => (await site.request(`/tr/blog/${slug}`)).text();

  test("ROOT_WORDS >= 1500 in the raw HTML (criterion 1)", async () => {
    const words = wordCount(rootOf(await page()));
    expect(words).toBeGreaterThanOrEqual(1500);
  });

  test("<html lang=tr>, exactly one h1, at least ten h2/h3 in #root (criterion 2)", async () => {
    const html = await page();
    const root = rootOf(html);
    expect(html).toContain('<html lang="tr">');
    expect(count(root, /<h1\b/g)).toBe(1);
    expect(count(root, /<h[23]\b/g)).toBeGreaterThanOrEqual(10);
  });

  test("the title, the description and the canonical are the post's", async () => {
    const html = await page();
    expect(html).toContain(
      "<title data-seo>Atlas Steward: Yarım İşi Yakalayan Sistem | Cengizhan Köse</title>",
    );
    expect(html).toContain(
      `<link rel="canonical" href="https://www.cengizhankose.com/tr/blog/${slug}" data-seo>`,
    );
    expect(html).toContain(
      '<meta property="og:locale" content="tr_TR" data-seo>',
    );
  });

  test("each diagram is in the page as its own placeholder until its drawing is stored (T-05 stage A, PERF-05)", async () => {
    // The post row has no `diagrams` yet, so the server draws what the page
    // draws without them: a placeholder per diagram; mermaid is the browser's.
    // (With stored drawings the page carries the SVGs: render.test.ts.)
    const root = rootOf(await page());
    expect(count(root, /class="mermaid-placeholder"/g)).toBe(5);
  });

  test("the old address of the post is one 301", async () => {
    const res = await site.request(`/blog/${slug}`);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`/tr/blog/${slug}`);
  });
});
