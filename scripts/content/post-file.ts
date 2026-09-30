// Content files for the publish CLI (K-01 = A; BE-16, SEC-29, T-12).
//
// One post per file, content/posts/<slug>.<lang>.md:
//
//   ---
//   slug: my-post                 # required, lower-case words and hyphens
//   lang: en                      # required (T-12): en | tr
//   title: "Quoted: when it has a colon"
//   seoTitle: Short search title  # required when title is longer than 43 characters (SEO-10)
//   excerpt: One sentence.        # optional, at most 160 characters (SEO-09)
//   coverImage: /img/cover.png    # optional, https:// URL or site path
//   translationKey: my-post       # optional; posts sharing it translate each other (T-12)
//   ---
//
//   Markdown body ...
//
// The frontmatter is YAML (Bun.YAML). The body is the text after the closing
// `---`, trimmed: exactly what the database stores and what `--verify`
// compares. `published` never comes from the file (only --publish sets it),
// so a copied file cannot publish anything by itself.
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  toIssues,
  validatePostInput,
  type Issue,
  type PostInput,
} from "../../src/db/post-input";
import { POST_TOPIC_MAX_LENGTH } from "../../src/seo/pages.js";

/** SEO-09: search result descriptions are cut after about 160 characters. */
export const EXCERPT_SEO_MAX_LENGTH = 160;

/** PostInput plus the SEO-10 title override (posts.seo_title). */
export type PublishInput = PostInput & { seoTitle?: string };

export interface PostFile {
  frontmatter: Record<string, unknown>;
  body: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export interface InputOverrides {
  /** --lang (T-12): wins over the frontmatter. */
  lang?: string;
  /** --translation-key (T-12): wins over the frontmatter. */
  translationKey?: string;
  published: boolean;
}

const FRONTMATTER = /^---[ \t]*\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/;

const fail = (
  path: string,
  message: string,
): { ok: false; issues: Issue[] } => ({
  ok: false,
  issues: [{ path, message }],
});

/** Splits a content file into its YAML frontmatter and its trimmed Markdown body. */
export function parsePostFile(text: string): Result<PostFile> {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match = FRONTMATTER.exec(normalized);
  if (!match) {
    return fail(
      "frontmatter",
      "the file must start with a YAML block between two --- lines",
    );
  }
  let frontmatter: unknown;
  try {
    frontmatter = Bun.YAML.parse(match[1] ?? "");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fail("frontmatter", `invalid YAML (${reason})`);
  }
  if (
    frontmatter === null ||
    typeof frontmatter !== "object" ||
    Array.isArray(frontmatter)
  ) {
    return fail("frontmatter", "must be a YAML mapping of key: value lines");
  }
  return {
    ok: true,
    value: {
      frontmatter: frontmatter as Record<string, unknown>,
      body: normalized.slice(match[0].length).trim(),
    },
  };
}

// Same whitespace rule as src/seo/pages.js postTitle / postDescription.
const clean = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const SeoTitle = z.string().trim().min(1).max(POST_TOPIC_MAX_LENGTH);

/**
 * The validated write input for a parsed file: PostInput (BE-05 / SEC-07,
 * the one schema) plus the CLI's SEO rules. Every problem is reported at
 * once, as `path: message` issues.
 */
export function buildPublishInput(
  file: PostFile,
  overrides: InputOverrides,
): Result<PublishInput> {
  const { seoTitle, ...fields } = file.frontmatter;
  const issues: Issue[] = [];

  // The body is the content, and publishing is a command-line decision.
  if ("content" in fields) {
    issues.push({
      path: "content",
      message:
        "not allowed in the frontmatter: the Markdown body is the content",
    });
    delete fields.content;
  }
  if ("published" in fields) {
    issues.push({
      path: "published",
      message:
        "not allowed in the file: a run writes a draft unless --publish is given",
    });
    delete fields.published;
  }

  const post = validatePostInput({
    ...fields,
    ...(overrides.lang !== undefined && { lang: overrides.lang }),
    ...(overrides.translationKey !== undefined && {
      translationKey: overrides.translationKey,
    }),
    content: file.body,
    published: overrides.published,
  });
  if (!post.ok) issues.push(...(post.body.issues ?? []));

  let seo: string | undefined;
  if (seoTitle !== undefined) {
    const parsed = SeoTitle.safeParse(seoTitle);
    if (parsed.success) seo = parsed.data;
    else
      issues.push(
        ...toIssues(parsed.error).map((issue) => ({
          ...issue,
          path: "seoTitle",
        })),
      );
  }

  // SEO-10 / T-07: "<seoTitle ?? title> | Cengizhan Köse" must fit in 60
  // characters, and the brand suffix is never dropped.
  const topic = clean(seo) || clean(fields.title);
  if (seoTitle === undefined && topic.length > POST_TOPIC_MAX_LENGTH) {
    issues.push({
      path: "seoTitle",
      message:
        `required: the title has ${topic.length} characters and the page title ` +
        `adds " | Cengizhan Köse", so give a seoTitle of at most ${POST_TOPIC_MAX_LENGTH}`,
    });
  }

  const excerpt = clean(fields.excerpt);
  if (excerpt.length > EXCERPT_SEO_MAX_LENGTH) {
    issues.push({
      path: "excerpt",
      message: `at most ${EXCERPT_SEO_MAX_LENGTH} characters (it is the search result description), got ${excerpt.length}`,
    });
  }

  if (issues.length > 0 || !post.ok) return { ok: false, issues };
  return {
    ok: true,
    value: { ...post.data, ...(seo !== undefined && { seoTitle: seo }) },
  };
}

/** Hex SHA-256 of `text` (UTF-8); the audit line prints its first 12 characters. */
export const sha256Hex = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");
