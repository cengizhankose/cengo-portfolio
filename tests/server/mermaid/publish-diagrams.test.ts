// PERF-05 step 7: the publish CLI draws the post's diagrams before it connects
// and stores them with the content; --dry-run counts them; --verify compares
// their keys. The CLI runs in this process against PGlite (production
// schema); the browser is a fake, so nothing here needs Chrome.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  setDefaultTimeout,
} from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createPostQueries } from "../../../src/db/queries/posts";
import * as schema from "../../../src/db/schema";
import { posts, type PostDiagrams } from "../../../src/db/schema";
import { diagramKey } from "../../../src/lib/diagram-key.js";
import {
  comparePosts,
  upsertPost,
  type Deps,
} from "../../../scripts/content/publish-post";
import {
  diagramKeys,
  renderDiagrams,
  storedDiagramKeys,
} from "../../../scripts/lib/diagrams";
import { DiagramError } from "../../../scripts/lib/diagram-blocks";
import { renderMermaid } from "../../../scripts/lib/render-mermaid";
import { MIGRATIONS } from "../db/pglite";
import {
  LOCAL_URL,
  pgliteOpenDb,
  postFile,
  runMain,
  SETUP_TIMEOUT_MS,
  tempDir,
} from "../content/helpers";
import { FLOW_A, FLOW_B, fakeRenderer, fence } from "./support";

// Shared machines get loaded: the default 5 s per test is too tight for jsdom and PGlite.
setDefaultTimeout(30_000);

const SLUG = "diagram-post";
const keyA = diagramKey(FLOW_A);
const keyB = diagramKey(FLOW_B);
const BODY = `## Pipeline\n\n${fence(FLOW_A)}\n\n### Worker\n\n${fence(FLOW_B)}`;

let client: PGlite;
let opened: string[];
let dir: string;
let cleanupDir: () => Promise<unknown>;
const db = () => drizzle(client, { schema });

/** The CLI's diagram step with a fake browser, recording what it was asked. */
function fakeDiagrams() {
  const calls: { markdown: string; lang: string }[] = [];
  const renderDiagramsFake: Deps["renderDiagrams"] = async (
    markdown,
    request,
  ) => {
    calls.push({ markdown, lang: request.lang });
    return renderMermaid(markdown, {
      lang: request.lang,
      renderer: fakeRenderer(),
      progress: request.progress,
    });
  };
  return { calls, renderDiagrams: renderDiagramsFake };
}

const local = (argv: string[], deps: Partial<Deps> = {}) =>
  runMain(argv, {
    env: { PG_CONNECTION_URL: LOCAL_URL },
    openDb: pgliteOpenDb(client, opened),
    git: () => null,
    ...deps,
  });

async function writePost(name: string, text: string) {
  const path = join(dir, name);
  await writeFile(path, text);
  return path;
}

const rowFor = async (slug: string) =>
  (await db().select().from(posts).where(eq(posts.slug, slug)))[0];

beforeAll(async () => {
  ({ dir, cleanup: cleanupDir } = await tempDir("diagrams-cli-"));
  client = new PGlite();
  await migrate(db(), { migrationsFolder: MIGRATIONS });
}, SETUP_TIMEOUT_MS);
afterAll(async () => {
  await client.close();
  await cleanupDir();
});
beforeEach(async () => {
  await client.exec("truncate posts restart identity");
  opened = [];
});

describe("publishing a post with diagrams", () => {
  test("draws before connecting, then stores content and diagrams together", async () => {
    const fake = fakeDiagrams();
    const file = await writePost("a.md", postFile({ slug: SLUG }, BODY));
    const result = await local([file, "--publish"], {
      renderDiagrams: fake.renderDiagrams,
    });
    expect(result.code).toBe(0);
    expect(fake.calls).toEqual([{ markdown: BODY, lang: "en" }]);

    const row = await rowFor(SLUG);
    expect(row.content).toBe(BODY);
    expect(Object.keys(row.diagrams ?? {}).sort()).toEqual([keyA, keyB].sort());
    expect(row.diagrams![keyA]).toMatchObject({ label: "Diagram: Pipeline" });
    expect(row.diagrams![keyA].light).toStartWith(`<svg id="m-${keyA}-light"`);
    expect(row.diagrams![keyA].dark).toStartWith(`<svg id="m-${keyA}-dark"`);
    // the markdown body keeps the source, never an SVG (SEC-03, T-05)
    expect(row.content).not.toContain("<svg");

    expect(result.stdout).toContain("diagrams: 2 stored");
    // progress is stderr: stdout starts with the result line
    expect(result.out[0]).toStartWith("inserted ");
    expect(
      result.err.filter((line) => line.startsWith("diagram ")),
    ).toHaveLength(2);
    // the audit line stays the last line
    expect(JSON.parse(result.out.at(-1)!).event).toBe("post_publish");
  });

  test("the API query returns the stored diagrams for the published post", async () => {
    const fake = fakeDiagrams();
    const file = await writePost(
      "a.md",
      postFile({ slug: SLUG, lang: "tr" }, BODY),
    );
    await local([file, "--publish"], { renderDiagrams: fake.renderDiagrams });
    const post = await createPostQueries(db()).getPublishedPostBySlug(SLUG);
    expect(Object.keys(post!.diagrams!).sort()).toEqual([keyA, keyB].sort());
    // the label speaks the post's language
    expect(post!.diagrams![keyA].label).toBe("Diyagram: Pipeline");
  });

  test("a diagram that cannot be drawn: exit 1, the reason on stderr, nothing written, no connection", async () => {
    const result = await local(
      [await writePost("a.md", postFile({ slug: SLUG }, BODY)), "--publish"],
      {
        renderDiagrams: async () => {
          throw new DiagramError(
            'diagram at line 3 ("Diagram: Pipeline") could not be drawn (light): Parse error',
          );
        },
      },
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("diagram at line 3");
    expect(result.stderr).toContain("Parse error");
    expect(opened).toEqual([]);
    expect((await client.query("select 1 from posts")).rows).toEqual([]);
  });

  test("a draft run draws and stores too (the page is checked before it goes live)", async () => {
    const fake = fakeDiagrams();
    const file = await writePost("a.md", postFile({ slug: SLUG }, BODY));
    expect(
      (await local([file], { renderDiagrams: fake.renderDiagrams })).code,
    ).toBe(0);
    const row = await rowFor(SLUG);
    expect(row.published).toBe(false);
    expect(Object.keys(row.diagrams ?? {})).toHaveLength(2);
  });

  test("publishing again replaces the diagrams with the new content's; removing every block clears them", async () => {
    const fake = fakeDiagrams();
    const file = await writePost("a.md", postFile({ slug: SLUG }, BODY));
    await local([file, "--publish"], { renderDiagrams: fake.renderDiagrams });

    await writePost(
      "a.md",
      postFile({ slug: SLUG }, `## One\n\n${fence(FLOW_A)}`),
    );
    await local([file, "--publish"], { renderDiagrams: fake.renderDiagrams });
    expect(Object.keys((await rowFor(SLUG)).diagrams ?? {})).toEqual([keyA]);

    await writePost("a.md", postFile({ slug: SLUG }, "No diagrams now."));
    const result = await local([file, "--publish"], {
      renderDiagrams: fake.renderDiagrams,
    });
    expect((await rowFor(SLUG)).diagrams).toEqual({});
    expect(result.stdout).not.toContain("diagrams:");
  });

  test("a post without diagrams stores {} and starts no browser (the default step)", async () => {
    const file = await writePost("a.md", postFile({ slug: SLUG }));
    const result = await local([file, "--publish"]); // default renderDiagrams
    expect(result.code).toBe(0);
    expect((await rowFor(SLUG)).diagrams).toEqual({});
    expect(await renderDiagrams("text only", { lang: "en" })).toEqual({});
  });
});

describe("--dry-run", () => {
  test("counts the diagrams, draws nothing and never connects", async () => {
    const fake = fakeDiagrams();
    const file = await writePost("a.md", postFile({ slug: SLUG }, BODY));
    const result = await local([file, "--dry-run", "--publish"], {
      renderDiagrams: fake.renderDiagrams,
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("diagrams=2");
    expect(fake.calls).toEqual([]);
    expect(opened).toEqual([]);
  });

  test("two identical blocks count once; none counts 0", async () => {
    const same = await writePost(
      "same.md",
      postFile({ slug: SLUG }, `${fence(FLOW_A)}\n\n${fence(FLOW_A)}`),
    );
    expect((await local([same, "--dry-run"])).stdout).toContain("diagrams=1");
    const none = await writePost("none.md", postFile({ slug: SLUG }));
    expect((await local([none, "--dry-run"])).stdout).toContain("diagrams=0");
  });
});

describe("upsertPost", () => {
  const input = (overrides = {}) => ({
    slug: SLUG,
    lang: "en" as const,
    title: "T",
    content: "c",
    published: true,
    ...overrides,
  });
  const stored: PostDiagrams = {
    [keyA]: { label: "L", light: "<svg></svg>", dark: "<svg></svg>" },
  };

  test("writes diagrams with the content, and a caller without diagrams leaves them alone", async () => {
    await upsertPost(db(), input({ diagrams: stored }));
    expect((await rowFor(SLUG)).diagrams).toEqual(stored);
    await upsertPost(db(), input({ content: "edited" }));
    const row = await rowFor(SLUG);
    expect(row.content).toBe("edited");
    expect(row.diagrams).toEqual(stored);
    await upsertPost(db(), input({ diagrams: {} }));
    expect((await rowFor(SLUG)).diagrams).toEqual({});
  });
});

describe("--verify compares diagram keys", () => {
  let content: { dir: string; cleanup: () => Promise<unknown> };
  beforeAll(async () => {
    content = await tempDir("diagrams-verify-");
  }, SETUP_TIMEOUT_MS);
  afterAll(async () => {
    await content.cleanup();
  });

  async function publishInto(body: string, deps: Partial<Deps> = {}) {
    const contentDir = join(content.dir, crypto.randomUUID());
    await mkdir(contentDir);
    const file = join(contentDir, "v.en.md");
    await writeFile(file, postFile({ slug: "verify-diagrams" }, body));
    const published = await local([file, "--publish"], deps);
    expect(published.code).toBe(0);
    return contentDir;
  }
  const verify = (contentDir: string) => local(["--verify"], { contentDir });

  test("published with its diagrams -> ok", async () => {
    const contentDir = await publishInto(BODY, fakeDiagrams());
    const result = await verify(contentDir);
    expect(result.out).toEqual(["verify-diagrams ok"]);
    expect(result.code).toBe(0);
  });

  test("a post whose row has no diagrams (published before this, or by an older CLI) -> drift diagrams", async () => {
    const contentDir = await publishInto(BODY, fakeDiagrams());
    await db()
      .update(posts)
      .set({ diagrams: null })
      .where(eq(posts.slug, "verify-diagrams"));
    const result = await verify(contentDir);
    expect(result.out).toEqual(["verify-diagrams drift diagrams"]);
    expect(result.code).toBe(1);
  });

  test("stored keys that are not the file's blocks -> drift diagrams", async () => {
    const contentDir = await publishInto(BODY, fakeDiagrams());
    await db()
      .update(posts)
      .set({
        diagrams: { deadbeef: { label: "x", light: "<svg/>", dark: "<svg/>" } },
      })
      .where(eq(posts.slug, "verify-diagrams"));
    expect((await verify(contentDir)).out).toEqual([
      "verify-diagrams drift diagrams",
    ]);
  });

  test("a post without diagram blocks is ok with null or {}", async () => {
    const contentDir = await publishInto("Plain text.");
    await db()
      .update(posts)
      .set({ diagrams: null })
      .where(eq(posts.slug, "verify-diagrams"));
    expect((await verify(contentDir)).out).toEqual(["verify-diagrams ok"]);
  });
});

describe("comparePosts and the key helpers", () => {
  test("diagramKeys: unique, sorted, from the markdown", () => {
    expect(diagramKeys(BODY)).toEqual([keyA, keyB].sort());
    expect(diagramKeys(`${fence(FLOW_A)}\n\n${fence(FLOW_A)}`)).toEqual([keyA]);
    expect(diagramKeys("none")).toEqual([]);
  });

  test("storedDiagramKeys tolerates null and junk", () => {
    expect(storedDiagramKeys(null)).toEqual([]);
    expect(storedDiagramKeys(undefined)).toEqual([]);
    expect(storedDiagramKeys("x")).toEqual([]);
    expect(storedDiagramKeys([1, 2])).toEqual([]);
    expect(storedDiagramKeys({ b: {}, a: {} })).toEqual(["a", "b"]);
  });

  test("rows without a diagrams field (fixtures, old callers) compare as none", () => {
    expect(
      comparePosts(
        [{ slug: "s", content: "text" }],
        [{ slug: "s", content: "text" }],
      ),
    ).toEqual([{ slug: "s", status: "ok" }]);
    expect(
      comparePosts(
        [{ slug: "s", content: BODY }],
        [{ slug: "s", content: BODY }],
      ),
    ).toEqual([{ slug: "s", status: "drift", fields: ["diagrams"] }]);
  });
});
