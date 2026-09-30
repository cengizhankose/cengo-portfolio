// BE-16 / SEC-07 / SEO-09 / SEO-10: content file parsing and validation,
// before any database is involved.
import { describe, expect, test } from "bun:test";
import {
  buildPublishInput,
  EXCERPT_SEO_MAX_LENGTH,
  parsePostFile,
  sha256Hex,
} from "../../../scripts/content/post-file";
import { POST_TOPIC_MAX_LENGTH } from "../../../src/seo/pages.js";
import { postFile } from "./helpers";

const build = (
  text: string,
  overrides: {
    lang?: string;
    translationKey?: string;
    published?: boolean;
  } = {},
) => {
  const parsed = parsePostFile(text);
  if (!parsed.ok) return parsed;
  return buildPublishInput(parsed.value, { published: false, ...overrides });
};

const paths = (result: ReturnType<typeof build>) =>
  result.ok ? [] : result.issues.map((issue) => issue.path);

describe("parsePostFile", () => {
  test("frontmatter + trimmed body", () => {
    const parsed = parsePostFile(postFile({}, "\n\nBody **text**.\n\n"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.frontmatter).toEqual({
      slug: "sec29-test",
      lang: "en",
      title: "Publish CLI test",
    });
    expect(parsed.value.body).toBe("Body **text**.");
  });

  test("CRLF line endings and a BOM give the same result as LF", () => {
    const lf = postFile({}, "a\nb");
    const crlf = "﻿" + lf.replace(/\n/g, "\r\n");
    expect(parsePostFile(crlf)).toEqual(parsePostFile(lf));
  });

  test("a quoted title with a colon survives, YAML comments are ignored", () => {
    const parsed = parsePostFile(
      '---\n# note\nslug: a-b\nlang: tr\ntitle: "40 ms: fast"\n---\nx',
    );
    expect(parsed.ok && parsed.value.frontmatter.title).toBe("40 ms: fast");
  });

  test("a later --- line is part of the body (horizontal rule)", () => {
    const parsed = parsePostFile(postFile({}, "one\n\n---\n\ntwo"));
    expect(parsed.ok && parsed.value.body).toBe("one\n\n---\n\ntwo");
  });

  test.each([
    ["no frontmatter", "# Title\n\nbody"],
    ["unclosed frontmatter", "---\nslug: x\ntitle: y\n"],
    ["a list instead of a mapping", "---\n- a\n- b\n---\nbody"],
    ["broken YAML", '---\ntitle: "unterminated\n---\nbody'],
  ])("%s -> frontmatter issue", (_name, text) => {
    const parsed = parsePostFile(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues[0].path).toBe("frontmatter");
  });
});

describe("buildPublishInput (PostInput + CLI rules)", () => {
  test("valid file: draft by default, published only when asked", () => {
    const draft = build(postFile());
    expect(draft.ok && draft.value).toEqual({
      slug: "sec29-test",
      lang: "en",
      title: "Publish CLI test",
      content: "## Heading\n\nBody text.",
      published: false,
    });
    const live = build(postFile(), { published: true });
    expect(live.ok && live.value.published).toBe(true);
  });

  test("missing title -> issue names title (BE-16 criterion 4)", () => {
    expect(paths(build(postFile({ title: undefined })))).toContain("title");
  });

  test("missing lang in the file and no --lang -> issue names lang (T-12, no default)", () => {
    expect(paths(build(postFile({ lang: undefined })))).toContain("lang");
    const fixed = build(postFile({ lang: undefined }), { lang: "tr" });
    expect(fixed.ok && fixed.value.lang).toBe("tr");
  });

  test("--lang and --translation-key win over the frontmatter (T-12)", () => {
    const result = build(postFile({ lang: "tr", translationKey: "old-key" }), {
      lang: "en",
      translationKey: "new-key",
    });
    expect(result.ok && result.value.lang).toBe("en");
    expect(result.ok && result.value.translationKey).toBe("new-key");
  });

  test("unknown language, bad translation key", () => {
    expect(paths(build(postFile({ lang: "de" })))).toContain("lang");
    expect(
      paths(build(postFile(), { translationKey: "Not A Slug" })),
    ).toContain("translationKey");
  });

  test("id / createdAt in the frontmatter are refused (SEC-07: strict, never written)", () => {
    const result = build(postFile({ id: 5, createdAt: "2020-01-01" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const unknown = result.issues.find((i) => i.path.includes("id"));
    expect(unknown?.path).toContain("createdAt");
  });

  test("published and content are not allowed in the file", () => {
    expect(paths(build(postFile({ published: true })))).toEqual(["published"]);
    expect(paths(build(postFile({ content: "x" })))).toEqual(["content"]);
  });

  test.each([
    ["upper case", "Hello-World"],
    ["underscore", "hello_world"],
    ["dot (would 404 as a file path)", "hello.world"],
    ["too short", "ab"],
  ])("slug with %s -> slug issue (SLUG_PATTERN)", (_name, slug) => {
    expect(paths(build(postFile({ slug })))).toContain("slug");
  });

  test("coverImage must be https:// or a site path", () => {
    expect(
      paths(build(postFile({ coverImage: "javascript:alert(1)" }))),
    ).toContain("coverImage");
    expect(build(postFile({ coverImage: "/img/cover.png" })).ok).toBe(true);
  });

  test("empty body -> content issue", () => {
    expect(paths(build(postFile({}, "   ")))).toContain("content");
  });

  test("SEO-10: a title over 43 characters needs a seoTitle of at most 43", () => {
    const long = "x".repeat(POST_TOPIC_MAX_LENGTH + 1);
    const noSeo = build(postFile({ title: long }));
    expect(paths(noSeo)).toEqual(["seoTitle"]);
    if (!noSeo.ok) expect(noSeo.issues[0].message).toContain("Cengizhan Köse");

    const ok = build(postFile({ title: long, seoTitle: "Short title" }));
    expect(ok.ok && ok.value.seoTitle).toBe("Short title");

    expect(
      paths(
        build(
          postFile({
            title: long,
            seoTitle: "y".repeat(POST_TOPIC_MAX_LENGTH + 1),
          }),
        ),
      ),
    ).toEqual(["seoTitle"]);
    expect(
      build(postFile({ title: "x".repeat(POST_TOPIC_MAX_LENGTH) })).ok,
    ).toBe(true);
  });

  test("SEO-09: excerpt at most 160 characters", () => {
    expect(
      build(postFile({ excerpt: "e".repeat(EXCERPT_SEO_MAX_LENGTH) })).ok,
    ).toBe(true);
    expect(
      paths(
        build(postFile({ excerpt: "e".repeat(EXCERPT_SEO_MAX_LENGTH + 1) })),
      ),
    ).toEqual(["excerpt"]);
  });

  test("every problem is reported at once", () => {
    const result = build(
      postFile({
        slug: "Bad",
        lang: undefined,
        title: undefined,
        published: true,
      }),
    );
    expect(new Set(paths(result))).toEqual(
      new Set(["published", "slug", "lang", "title"]),
    );
  });
});

test("sha256Hex", () => {
  expect(sha256Hex("abc")).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
