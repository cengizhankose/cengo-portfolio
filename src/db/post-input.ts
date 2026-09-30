// Blog post input schemas (BE-05 / SEC-07 / BE-07, T-01, T-12): the one place
// that says what a valid slug, locale, post and list query are.
//
//   PostSlug   /api/posts/:slug pre-check (a miss never reaches the database)
//              and the publish CLI's slug / translationKey rule.
//   Locale     'en' | 'tr' (LOCALES in src/seo/site.js; posts.lang in the DB).
//   PostInput  the only write input (K-01 = A: the publish CLI, W5). Unknown
//              keys (id, createdAt, ...) are rejected, `published` defaults to
//              false, `lang` is required.
//   ListQuery  GET /api/posts query string: limit, cursor, lang, missingIn.
//
// The production API never reads a request body. The T-01 body statuses
// (400 bad JSON, 413 too large, 422 invalid, 409 conflict) are produced here
// for the CLI by parsePostInputJson / validatePostInput / postInputConflict.
import { z } from "zod";
import { SLUG_PATTERN } from "../seo/routes.js";
import { LOCALES } from "../seo/site.js";
import type { PostLang } from "./schema";

/** `{ path, message }`, the `issues` item of the T-01 error envelope. */
export interface Issue {
  path: string;
  message: string;
}

/** Zod issues -> T-01 `issues`. An unknown key is reported under its own name. */
export const toIssues = (error: z.ZodError): Issue[] =>
  error.issues.map((issue) => ({
    path:
      issue.path.length > 0
        ? issue.path.map(String).join(".")
        : issue.code === "unrecognized_keys"
          ? issue.keys.join(",")
          : "",
    message: issue.message,
  }));

// ---------------------------------------------------------------------------
// Slug and locale

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 120;

/** Lower-case ASCII words joined by single hyphens, 3-120 characters (same pattern as the page router). */
export const PostSlug = z
  .string()
  .min(SLUG_MIN_LENGTH)
  .max(SLUG_MAX_LENGTH)
  .regex(SLUG_PATTERN, "lower-case letters, digits and single hyphens only");

/** True when `slug` can name a post; the API answers 404 without a query otherwise. */
export const isPostSlug = (slug: string): boolean =>
  PostSlug.safeParse(slug).success;

// T-12: the site's locales (src/seo/site.js) are the post languages. A test
// keeps them equal to POST_LANGS, the posts.lang check constraint.
const LOCALE_VALUES = LOCALES as readonly string[] as readonly [
  PostLang,
  ...PostLang[],
];

export const Locale = z.enum(LOCALE_VALUES);
export type Locale = z.infer<typeof Locale>;

// ---------------------------------------------------------------------------
// PostInput (the publish CLI's input, T-01 statuses)

/** Raw input above this size is refused with 413 before it is parsed (T-01). */
export const MAX_POST_INPUT_BYTES = 512 * 1024;
export const TITLE_MAX_LENGTH = 200;
export const CONTENT_MAX_LENGTH = 200_000;
export const EXCERPT_MAX_LENGTH = 300;
export const COVER_IMAGE_MAX_LENGTH = 500;

/**
 * A cover image is an `https://` URL or a site path (`/img/x.png`). `z.url()`
 * alone would accept `javascript:` and `data:`; a protocol-relative `//host`
 * or a backslash (browsers read `/\host` as `//host`) is refused as well.
 */
export function isSafeImageRef(value: string): boolean {
  if (/[\s\\]/.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  if (!value.startsWith("https://")) return false;
  try {
    return new URL(value).hostname !== "";
  } catch {
    return false;
  }
}

export const CoverImage = z
  .string()
  .trim()
  .max(COVER_IMAGE_MAX_LENGTH)
  .refine(isSafeImageRef, "must be an https:// URL or a site path");

export const PostInput = z
  .object({
    slug: PostSlug,
    lang: Locale, // required, no default (T-12)
    translationKey: PostSlug.optional(), // same key = translations of each other
    title: z.string().trim().min(1).max(TITLE_MAX_LENGTH),
    content: z.string().min(1).max(CONTENT_MAX_LENGTH),
    excerpt: z.string().trim().max(EXCERPT_MAX_LENGTH).optional(),
    coverImage: CoverImage.optional(),
    published: z.boolean().default(false),
  })
  .strict(); // id, createdAt, updatedAt, ... are rejected, never written
export type PostInput = z.infer<typeof PostInput>;

/** T-01 statuses and codes for a rejected write input. */
export const POST_INPUT_ERRORS = {
  BAD_JSON: { status: 400, code: "BAD_JSON" },
  TOO_LARGE: { status: 413, code: "PAYLOAD_TOO_LARGE" },
  INVALID: { status: 422, code: "INVALID_POST" },
  CONFLICT: { status: 409, code: "CONFLICT" },
} as const;

type InputError = (typeof POST_INPUT_ERRORS)[keyof typeof POST_INPUT_ERRORS];

/** A rejected input in the T-01 envelope, plus the HTTP status it stands for. */
export interface PostInputFailure {
  ok: false;
  status: InputError["status"];
  body: { error: string; code: InputError["code"]; issues?: Issue[] };
}

export type PostInputResult = { ok: true; data: PostInput } | PostInputFailure;

const failure = (
  { status, code }: InputError,
  error: string,
  issues?: Issue[],
): PostInputFailure => ({
  ok: false,
  status,
  body: { error, code, ...(issues ? { issues } : {}) },
});

/** Schema check of an already parsed object: 422 with `issues`, or the data. */
export function validatePostInput(value: unknown): PostInputResult {
  const parsed = PostInput.safeParse(value);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : failure(
        POST_INPUT_ERRORS.INVALID,
        "Invalid post",
        toIssues(parsed.error),
      );
}

/** Raw JSON text: 413 above MAX_POST_INPUT_BYTES, 400 when malformed, then validatePostInput. */
export function parsePostInputJson(text: string): PostInputResult {
  if (new TextEncoder().encode(text).byteLength > MAX_POST_INPUT_BYTES) {
    return failure(
      POST_INPUT_ERRORS.TOO_LARGE,
      `Input exceeds ${MAX_POST_INPUT_BYTES} bytes`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return failure(POST_INPUT_ERRORS.BAD_JSON, "Malformed JSON");
  }
  return validatePostInput(value);
}

/**
 * 409 for a Postgres unique violation (23505) on the slug or on the
 * (translation_key, lang) pair; null for any other error (rethrow it).
 */
export function postInputConflict(error: unknown): PostInputFailure | null {
  const pg = pgError(error);
  if (pg?.code !== "23505") return null;
  if (pg.constraint_name === "posts_translation_key_lang_unique") {
    return failure(
      POST_INPUT_ERRORS.CONFLICT,
      "A post with this translationKey and lang already exists",
      [
        {
          path: "translationKey",
          message: "already used by another post in this lang",
        },
      ],
    );
  }
  return failure(
    POST_INPUT_ERRORS.CONFLICT,
    "A post with this slug already exists",
    [{ path: "slug", message: "already used by another post" }],
  );
}

// postgres.js errors carry code/constraint_name themselves; drizzle wraps
// them in a DrizzleQueryError whose `cause` is the driver error.
function pgError(
  error: unknown,
): { code?: unknown; constraint_name?: unknown } | null {
  for (let e = error, depth = 0; e && depth < 3; depth++) {
    if (typeof e !== "object") return null;
    const candidate = e as {
      code?: unknown;
      constraint_name?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (typeof candidate.code === "string" && /^\d{5}$/.test(candidate.code)) {
      return {
        code: candidate.code,
        constraint_name: candidate.constraint_name ?? candidate.constraint,
      };
    }
    e = candidate.cause;
  }
  return null;
}

// ---------------------------------------------------------------------------
// ListQuery (GET /api/posts) and the keyset cursor

export const LIST_DEFAULT_LIMIT = 20;
/** HTTP ceiling only; server-side callers (sitemap) may pass more. */
export const LIST_MAX_LIMIT = 50;
const CURSOR_MAX_LENGTH = 200;
const MAX_POST_ID = 2_147_483_647; // posts.id is a serial (int4)

/**
 * Keyset position after a row: its exact `created_at` (UTC ISO with up to
 * microseconds, as Postgres stores it) and `id`. Millisecond precision would
 * skip rows that share a millisecond.
 */
export interface ListCursor {
  t: string;
  id: number;
}

const CURSOR_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

// Only real instants from 1970 on pass: an impossible date (Feb 30) would
// make Postgres fail the cast, which must be a 400, never a 500.
const isCursorTime = (t: string): boolean => {
  if (!CURSOR_TIME.test(t)) return false;
  const ms = Date.parse(t);
  return (
    Number.isFinite(ms) &&
    ms >= 0 &&
    new Date(ms).toISOString().slice(0, 19) === t.slice(0, 19)
  );
};

const CursorPayload = z
  .object({
    t: z.string().refine(isCursorTime),
    id: z.number().int().min(1).max(MAX_POST_ID),
  })
  .strict();

/** Opaque base64url JSON; clients only echo X-Next-Cursor back. */
export const encodeCursor = (cursor: ListCursor): string =>
  Buffer.from(JSON.stringify({ t: cursor.t, id: cursor.id })).toString(
    "base64url",
  );

/** The cursor, or null for anything that is not exactly what encodeCursor writes. */
export function decodeCursor(value: string): ListCursor | null {
  if (value.length > CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = CursorPayload.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

// Never an error: missing, empty or non-numeric -> 20; out of range -> clamped to 1..50.
const Limit = z
  .preprocess(emptyToUndefined, z.coerce.number().int())
  .catch(LIST_DEFAULT_LIMIT)
  .transform((n) => Math.min(LIST_MAX_LIMIT, Math.max(1, n)));

// Empty = no cursor (first page); anything else must decode.
const Cursor = z
  .preprocess(emptyToUndefined, z.string().optional())
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    const cursor = decodeCursor(value);
    if (!cursor) {
      ctx.addIssue({ code: "custom", message: "Invalid cursor" });
      return z.NEVER;
    }
    return cursor;
  });

/**
 * GET /api/posts query. Unknown parameters are ignored (UTM tags, `?rl=`
 * probes). `missingIn` needs `lang` and a different value: `?lang=tr&missingIn=en`
 * lists TR posts without a published EN translation (T-12).
 */
export const ListQuery = z
  .object({
    limit: Limit,
    cursor: Cursor.optional(),
    lang: Locale.optional(),
    missingIn: Locale.optional(),
  })
  .superRefine((query, ctx) => {
    if (query.missingIn === undefined) return;
    if (query.lang === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["missingIn"],
        message: "missingIn requires lang",
      });
    } else if (query.missingIn === query.lang) {
      ctx.addIssue({
        code: "custom",
        path: ["missingIn"],
        message: "missingIn must differ from lang",
      });
    }
  });
export type ListQuery = z.infer<typeof ListQuery>;
