/**
 * MKT-20 criteria that can be checked without the live site: every cover a
 * post file names is a 1200x630 PNG of at most 200 KB under public/, the old
 * generic blog copy is gone from src/, and the author portrait files the
 * author box points at exist (SEO-16).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parsePostFile } from "../../../scripts/content/post-file";
import { AUTHOR_PHOTO } from "../../../src/seo/pages/post.js";
import { REPO_ROOT } from "../helpers";

const POSTS = join(REPO_ROOT, "content/posts");
const PUBLIC = join(REPO_ROOT, "public");
const MAX_COVER_BYTES = 204_800;

const pngSize = (file: string) => {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("latin1"), file).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

const files = readdirSync(POSTS).filter((name) => name.endsWith(".md"));

describe.each(files)("%s", (name) => {
  const parsed = parsePostFile(readFileSync(join(POSTS, name), "utf8"));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const { frontmatter, body } = parsed.value as {
    frontmatter: Record<string, unknown>;
    body: string;
  };

  test("has a cover and it is /blog/<slug>.png", () => {
    expect(frontmatter.coverImage).toBe(`/blog/${frontmatter.slug}.png`);
  });

  test("the cover exists, is 1200x630 and at most 200 KB", () => {
    const file = join(PUBLIC, String(frontmatter.coverImage));
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThanOrEqual(MAX_COVER_BYTES);
    expect(pngSize(file)).toEqual({ width: 1200, height: 630 });
  });

  test("names the human author in the first line and in the sign-off (MKT-17), without a placeholder", () => {
    const lines = body.split("\n").filter((line) => line.trim() !== "");
    const firstText = lines.find((line) => line.trim() !== "---")!;
    expect(firstText).toContain("Cengizhan");
    expect(firstText).not.toMatch(/\[|\]/);
    const sign = lines.filter((line) => line.startsWith("*Yazan:"));
    expect(sign).toHaveLength(1);
    expect(sign[0]).toContain("Cengizhan Köse");
  });
});

describe("the author portrait", () => {
  test("both files of the srcset exist and stay small", () => {
    for (const name of ["author-96.webp", "author-192.webp"]) {
      const file = join(PUBLIC, "blog", name);
      expect(existsSync(file), name).toBe(true);
      expect(statSync(file).size).toBeLessThan(20_000);
    }
    expect(AUTHOR_PHOTO.srcSet).toContain("/blog/author-96.webp 1x");
    expect(AUTHOR_PHOTO.srcSet).toContain("/blog/author-192.webp 2x");
    expect(AUTHOR_PHOTO.width).toBe(96);
    expect(AUTHOR_PHOTO.height).toBe(96);
  });
});

describe("the blog copy", () => {
  test("the generic description and the old empty text are gone from src/", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
          const text = readFileSync(path, "utf8");
          if (/Thoughts, tutorials, and insights|Check back soon/.test(text)) {
            hits.push(path);
          }
        }
      }
    };
    walk(join(REPO_ROOT, "src"));
    expect(hits).toEqual([]);
  });
});
