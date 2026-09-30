// BE-05 / SEC-07 (T-01, T-12): the PostInput, PostSlug, Locale and ListQuery
// schemas in src/db/post-input.ts, the only input schema of the blog.
import { describe, expect, test } from "bun:test";
import {
  CONTENT_MAX_LENGTH,
  decodeCursor,
  encodeCursor,
  EXCERPT_MAX_LENGTH,
  isPostSlug,
  isSafeImageRef,
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  ListQuery,
  Locale,
  MAX_POST_INPUT_BYTES,
  parsePostInputJson,
  PostInput,
  postInputConflict,
  PostSlug,
  toIssues,
  validatePostInput,
} from "../../../src/db/post-input";
import { POST_LANGS } from "../../../src/db/schema";
import { SLUG_PATTERN } from "../../../src/seo/routes.js";
import { LOCALES } from "../../../src/seo/site.js";

const VALID = {
  slug: "hello-world",
  lang: "en",
  title: "Hello",
  content: "# Body",
} as const;

const issueCodes = (value: unknown) => {
  const result = PostInput.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => i.code);
};

describe("PostInput (BE-05 criterion 1, SEC-07 criteria 1-2)", () => {
  test("a valid object passes and published defaults to false", () => {
    const result = PostInput.safeParse(VALID);
    expect(result.success).toBe(true);
    expect(result.data?.published).toBe(false);
  });

  test("title + slug + content + lang is the minimal valid input (lang is required, T-12)", () => {
    const { lang: _lang, ...withoutLang } = VALID;
    expect(PostInput.safeParse(withoutLang).success).toBe(false);
    expect(PostInput.safeParse(VALID).data).toEqual({
      ...VALID,
      published: false,
    });
  });

  test.each([
    ["id", { id: 5 }],
    ["id", { id: 999 }],
    ["createdAt", { createdAt: "2020-01-01T00:00:00Z" }],
    ["updatedAt", { updatedAt: "2020-01-01T00:00:00Z" }],
  ])("an extra %s is unrecognized_keys", (key, extra) => {
    const result = PostInput.safeParse({ ...VALID, ...extra });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].code).toBe("unrecognized_keys");
    // The CLI prints path: message; the key name is in both (SEC-07 criterion 3).
    const [issue] = toIssues(result.error!);
    expect(issue.path).toBe(key);
    expect(issue.message).toContain(key);
  });

  test.each([
    "Hello World",
    "Hello-world",
    "hello_world",
    "hello--world",
    "-hello",
    "hello-",
    "héllo",
    "ab",
    "a".repeat(121),
  ])("slug %p is rejected", (slug) => {
    expect(PostInput.safeParse({ ...VALID, slug }).success).toBe(false);
  });

  test("slug boundaries: 3 and 120 characters pass", () => {
    expect(PostInput.safeParse({ ...VALID, slug: "abc" }).success).toBe(true);
    expect(
      PostInput.safeParse({ ...VALID, slug: "a".repeat(120) }).success,
    ).toBe(true);
  });

  test.each([undefined, "de", "EN", ""])("lang %p is rejected", (lang) => {
    expect(PostInput.safeParse({ ...VALID, lang }).success).toBe(false);
  });

  test("translationKey follows the slug rule (T-12)", () => {
    expect(
      PostInput.safeParse({ ...VALID, translationKey: "hello-world" }).success,
    ).toBe(true);
    expect(
      PostInput.safeParse({ ...VALID, translationKey: "Hello World" }).success,
    ).toBe(false);
  });

  test("title: trimmed, 1-200 characters; 201 fails", () => {
    expect(PostInput.safeParse({ ...VALID, title: "  x  " }).data?.title).toBe(
      "x",
    );
    expect(PostInput.safeParse({ ...VALID, title: "   " }).success).toBe(false);
    expect(
      PostInput.safeParse({ ...VALID, title: "t".repeat(200) }).success,
    ).toBe(true);
    expect(
      PostInput.safeParse({ ...VALID, title: "t".repeat(201) }).success,
    ).toBe(false);
  });

  test("content 1-200 000 characters, excerpt <= 300", () => {
    expect(PostInput.safeParse({ ...VALID, content: "" }).success).toBe(false);
    expect(
      PostInput.safeParse({
        ...VALID,
        content: "c".repeat(CONTENT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      PostInput.safeParse({
        ...VALID,
        excerpt: "e".repeat(EXCERPT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  test.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "http://example.com/a.png",
    "//evil.example/a.png",
    "/\\evil.example/a.png",
    "https:/example.com/a.png",
    "https://",
    "/img/a b.png",
    `https://example.com/${"a".repeat(500)}`,
  ])("coverImage %p is rejected", (coverImage) => {
    expect(PostInput.safeParse({ ...VALID, coverImage }).success).toBe(false);
  });

  test.each(["https://images.example.com/a.png", "/img/cover-v1.avif"])(
    "coverImage %p is accepted",
    (coverImage) => {
      expect(isSafeImageRef(coverImage)).toBe(true);
      expect(PostInput.safeParse({ ...VALID, coverImage }).success).toBe(true);
    },
  );

  test("published must be a boolean (no string coercion)", () => {
    expect(issueCodes({ ...VALID, published: "true" })).toContain(
      "invalid_type",
    );
  });
});

describe("T-01 statuses for the publish CLI (SEC-07, K-01 = A)", () => {
  test("422 INVALID_POST with issues for a schema violation", () => {
    const result = validatePostInput({ ...VALID, id: 5 });
    expect(result).toMatchObject({
      ok: false,
      status: 422,
      body: { code: "INVALID_POST" },
    });
    if (result.ok) throw new Error("unreachable");
    expect(result.body.issues?.[0].path).toBe("id");
    expect(Object.keys(result.body).sort()).toEqual([
      "code",
      "error",
      "issues",
    ]);
  });

  test("400 BAD_JSON for malformed JSON", () => {
    expect(parsePostInputJson("{ not json")).toMatchObject({
      ok: false,
      status: 400,
      body: { code: "BAD_JSON" },
    });
  });

  test("413 above 512 KB, before parsing", () => {
    const big = JSON.stringify({ ...VALID, content: "x".repeat(600_000) });
    expect(MAX_POST_INPUT_BYTES).toBe(512 * 1024);
    expect(parsePostInputJson(big)).toMatchObject({
      ok: false,
      status: 413,
      body: { code: "PAYLOAD_TOO_LARGE" },
    });
    // Multi-byte text counts in bytes, not characters.
    const multiByte = JSON.stringify({
      ...VALID,
      content: "ş".repeat(270_000),
    });
    expect(parsePostInputJson(multiByte)).toMatchObject({ status: 413 });
  });

  test("valid JSON text -> ok with defaults", () => {
    expect(parsePostInputJson(JSON.stringify(VALID))).toEqual({
      ok: true,
      data: { ...VALID, published: false },
    });
  });

  test("409 for a Postgres unique violation (slug, translation pair); null otherwise", () => {
    const slugConflict = postInputConflict({
      code: "23505",
      constraint_name: "posts_slug_unique",
    });
    expect(slugConflict).toMatchObject({
      status: 409,
      body: { code: "CONFLICT", issues: [{ path: "slug" }] },
    });
    // drizzle wraps the driver error: the code is found on `cause`.
    const wrapped = new Error("Failed query: insert ...", {
      cause: Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint_name: "posts_translation_key_lang_unique",
      }),
    });
    const pair = postInputConflict(wrapped);
    expect(pair?.status).toBe(409);
    expect(pair?.body.error).toContain("translationKey");
    expect(pair?.body.error).toContain("lang");
    expect(postInputConflict(new Error("connection refused"))).toBeNull();
    expect(postInputConflict({ code: "23503" })).toBeNull();
    expect(postInputConflict(null)).toBeNull();
  });
});

describe("shared rules", () => {
  test("Locale = LOCALES (src/seo/site.js) = POST_LANGS (posts.lang check)", () => {
    const locales: string[] = [...LOCALES];
    expect<string[]>([...Locale.options]).toEqual(locales);
    expect(locales).toEqual([...POST_LANGS]);
  });

  test("PostSlug uses the page router's SLUG_PATTERN", () => {
    for (const slug of ["hello-world", "a1-b2-c3", "Hello", "a_b", "x--y"]) {
      expect(isPostSlug(slug)).toBe(
        slug.length >= 3 && SLUG_PATTERN.test(slug),
      );
    }
    expect(PostSlug.safeParse("..%2fx").success).toBe(false);
  });
});

describe("cursor codec", () => {
  test("round trip, microseconds kept", () => {
    const cursor = { t: "2026-01-01T00:00:00.123456Z", id: 42 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(encodeCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  const b64 = (value: unknown) =>
    Buffer.from(
      typeof value === "string" ? value : JSON.stringify(value),
    ).toString("base64url");

  test.each([
    ["not base64url", "bozuk!"],
    ["plain word (decodes to junk)", "bozuk"],
    ["not JSON", b64("{t:")],
    ["array", b64([1, 2])],
    ["missing id", b64({ t: "2026-01-01T00:00:00Z" })],
    ["extra key", b64({ t: "2026-01-01T00:00:00Z", id: 1, x: 1 })],
    ["id 0", b64({ t: "2026-01-01T00:00:00Z", id: 0 })],
    ["id above int4", b64({ t: "2026-01-01T00:00:00Z", id: 2 ** 31 })],
    ["id as string", b64({ t: "2026-01-01T00:00:00Z", id: "1" })],
    ["impossible date", b64({ t: "2026-02-30T00:00:00Z", id: 1 })],
    ["hour 24", b64({ t: "2026-01-01T24:00:00Z", id: 1 })],
    ["no zone", b64({ t: "2026-01-01T00:00:00", id: 1 })],
    ["offset zone", b64({ t: "2026-01-01T00:00:00+03:00", id: 1 })],
    ["7 fraction digits", b64({ t: "2026-01-01T00:00:00.1234567Z", id: 1 })],
    ["before 1970", b64({ t: "1969-12-31T23:59:59Z", id: 1 })],
    [
      "SQL in t",
      b64({ t: "2026-01-01T00:00:00Z'; drop table posts--", id: 1 }),
    ],
    ["too long", "A".repeat(201)],
  ])("rejects %s", (_name, value) => {
    expect(decodeCursor(value)).toBeNull();
  });
});

describe("ListQuery (BE-07 step 2)", () => {
  const parse = (query: Record<string, unknown>) => ListQuery.safeParse(query);

  test("defaults: limit 20, no cursor, all languages", () => {
    expect(parse({}).data).toEqual({ limit: LIST_DEFAULT_LIMIT });
  });

  test.each([
    ["500", LIST_MAX_LIMIT],
    ["50", 50],
    ["2", 2],
    ["0", 1],
    ["-3", 1],
    ["abc", LIST_DEFAULT_LIMIT],
    ["2.5", LIST_DEFAULT_LIMIT],
    ["", LIST_DEFAULT_LIMIT],
    ["Infinity", LIST_DEFAULT_LIMIT],
  ])("limit %p -> %p (clamped, never an error)", (limit, expected) => {
    expect(parse({ limit }).data?.limit).toBe(expected);
  });

  test("a valid cursor is decoded; an empty one means the first page", () => {
    const cursor = { t: "2026-01-01T00:00:00.000001Z", id: 7 };
    expect(parse({ cursor: encodeCursor(cursor) }).data?.cursor).toEqual(
      cursor,
    );
    expect(parse({ cursor: "" }).data?.cursor).toBeUndefined();
  });

  test("an invalid cursor is an issue on `cursor`", () => {
    const result = parse({ cursor: "bozuk" });
    expect(result.success).toBe(false);
    expect(toIssues(result.error!).map((i) => i.path)).toEqual(["cursor"]);
  });

  test("lang / missingIn: en, tr; de, repeats and bad pairs are issues", () => {
    expect(parse({ lang: "tr", missingIn: "en" }).data).toMatchObject({
      lang: "tr",
      missingIn: "en",
    });
    for (const [query, path] of [
      [{ lang: "de" }, "lang"],
      [{ lang: ["en", "tr"] }, "lang"],
      [{ missingIn: "en" }, "missingIn"],
      [{ lang: "en", missingIn: "en" }, "missingIn"],
      [{ lang: "en", missingIn: "de" }, "missingIn"],
    ] as const) {
      const result = parse(query);
      expect(result.success).toBe(false);
      expect(toIssues(result.error!)[0].path).toBe(path);
    }
  });

  test("unknown parameters (utm, rl probes) are ignored", () => {
    expect(parse({ rl: "7", utm_source: "x", lang: "en" }).data).toEqual({
      limit: LIST_DEFAULT_LIMIT,
      lang: "en",
    });
  });
});
