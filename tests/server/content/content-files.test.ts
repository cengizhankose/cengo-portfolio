// BE-16 step 10 / SEC-15: the repository's content/posts/*.md are the source
// of every production post. Each file must pass the same checks the CLI runs
// before it connects, so a --prod publish can never fail on the file itself.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildPublishInput,
  parsePostFile,
} from "../../../scripts/content/post-file";
import { CONTENT_DIR } from "../../../scripts/content/publish-post";
import { POST_TOPIC_MAX_LENGTH } from "../../../src/seo/pages.js";

const LIVE_TR_SLUG = "atlas-steward-laya-konustan-yarim-is-cikaran-sistem";
const files = existsSync(CONTENT_DIR)
  ? readdirSync(CONTENT_DIR)
      .filter((name) => name.endsWith(".md"))
      .sort()
  : [];

const load = async (name: string) => {
  const parsed = parsePostFile(await Bun.file(join(CONTENT_DIR, name)).text());
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.value;
};

test("content/posts holds the live TR post (exported from the public API)", () => {
  expect(files).toContain(`${LIVE_TR_SLUG}.tr.md`);
});

describe.each(files)("%s", (name) => {
  test("passes the CLI's validation (PostInput + SEO rules)", async () => {
    const result = buildPublishInput(await load(name), { published: false });
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  test("is named <slug>.<lang>.md and carries no publish state", async () => {
    const file = await load(name);
    expect(name).toBe(`${file.frontmatter.slug}.${file.frontmatter.lang}.md`);
    expect(file.frontmatter).not.toHaveProperty("published");
  });
});

test("the EN translation of the live post shares its translationKey (MKT-14)", async () => {
  const en = await load(
    "atlas-steward-system-that-catches-unfinished-work.en.md",
  );
  const tr = await load(`${LIVE_TR_SLUG}.tr.md`);
  expect(en.frontmatter.lang).toBe("en");
  expect(en.frontmatter.translationKey).toBe(tr.frontmatter.translationKey);
  expect(en.frontmatter.slug).not.toBe(tr.frontmatter.slug);
  expect(String(en.frontmatter.seoTitle).length).toBeLessThanOrEqual(
    POST_TOPIC_MAX_LENGTH,
  );
});

test("slugs are unique across content files", async () => {
  const slugs = await Promise.all(
    files.map(async (name) => (await load(name)).frontmatter.slug),
  );
  expect(new Set(slugs).size).toBe(slugs.length);
});

test("the live TR post keeps its language and gets a short seoTitle (SEO-10)", async () => {
  const file = await load(`${LIVE_TR_SLUG}.tr.md`);
  expect(file.frontmatter.lang).toBe("tr");
  expect(String(file.frontmatter.title).length).toBeGreaterThan(
    POST_TOPIC_MAX_LENGTH,
  );
  expect(String(file.frontmatter.seoTitle).length).toBeLessThanOrEqual(
    POST_TOPIC_MAX_LENGTH,
  );
  // MKT-14: the key is shared with the EN translation (T-12).
  expect(file.frontmatter.translationKey).toBe("atlas-steward");
  expect(file.body.length).toBeGreaterThan(1000);
});

// CLAUDE.md is not in the Docker build context (root *.md excluded) -> skip there.
test.skipIf(!existsSync(join(CONTENT_DIR, "../../CLAUDE.md")))(
  "CLAUDE.md documents the publish flow (SEC-15 step 4)",
  async () => {
    const doc = await Bun.file(join(CONTENT_DIR, "../../CLAUDE.md")).text();
    for (const text of [
      "bun run content:publish",
      "--prod --publish",
      "content:publish --verify --prod",
      "PG_WRITE_CONNECTION_URL",
      "PG_MIGRATE_URL",
      "scripts/sql/least-privilege.sql",
    ]) {
      expect(doc).toContain(text);
    }
  },
);
