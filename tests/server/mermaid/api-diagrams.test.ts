// PERF-05 step 8 and the acceptance curl: GET /api/posts/:slug carries the
// stored diagrams next to the untouched markdown; the list never does.
// createApp over the real queries on PGlite (production schema).
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
  setDefaultTimeout,
} from "bun:test";
import { createApp } from "../../../src/api/app";
import { createPostQueries } from "../../../src/db/queries/posts";
import { posts } from "../../../src/db/schema";
import { diagramKey } from "../../../src/lib/diagram-key.js";
import { renderMermaid } from "../../../scripts/lib/render-mermaid";
import { createStrictTestDb } from "../db/pglite";
import { silenceLogs } from "../helpers";
import {
  FLOW_A,
  FLOW_B,
  POST_WITH_TWO,
  fakeRenderer,
  realSvg,
} from "./support";

// Shared machines get loaded: the default 5 s per test is too tight for jsdom and PGlite.
setDefaultTimeout(30_000);

/** PGlite start + migrations can take seconds on a loaded machine. */
const SETUP_TIMEOUT_MS = 30_000;

describe("GET /api/posts/:slug with diagrams", () => {
  silenceLogs();
  let ctx: Awaited<ReturnType<typeof createStrictTestDb>>;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    ctx = await createStrictTestDb();
    const diagrams = await renderMermaid(POST_WITH_TWO, {
      lang: "tr",
      renderer: fakeRenderer((_source, _config, id) => realSvg(id)),
    });
    await ctx.db.insert(posts).values([
      {
        slug: "with",
        lang: "tr",
        title: "Diyagramlı",
        content: POST_WITH_TWO,
        published: true,
        diagrams,
      },
      {
        slug: "without",
        lang: "tr",
        title: "Diyagramsız",
        content: "Düz metin.",
        published: true,
      },
    ]);
    app = createApp({ queries: createPostQueries(ctx.db) });
  }, SETUP_TIMEOUT_MS);
  afterAll(async () => {
    await ctx.close();
  });

  const get = async (path: string) => {
    const res = await app.request(path);
    return { res, body: await res.json() };
  };

  test("the response has one entry per mermaid block, and the markdown still has the blocks", async () => {
    const { res, body } = await get("/api/posts/with?lang=tr");
    expect(res.status).toBe(200);
    // jq '.diagrams | length' -> 2 (5 for the live post)
    expect(Object.keys(body.diagrams)).toHaveLength(2);
    expect(Object.keys(body.diagrams).sort()).toEqual(
      [diagramKey(FLOW_A), diagramKey(FLOW_B)].sort(),
    );
    // jq -r '.content' | grep -c '```mermaid' -> unchanged body
    expect(body.content.match(/```mermaid/g)).toHaveLength(2);
    expect(body.content).toBe(POST_WITH_TWO);
    expect(body.content).not.toContain("<svg");
  });

  test("every stored drawing is clean: nothing that runs or loads (the acceptance grep)", async () => {
    const { body } = await get("/api/posts/with");
    const drawings = Object.values<{ light: string; dark: string }>(
      body.diagrams,
    ).flatMap((entry) => [entry.light, entry.dark]);
    expect(drawings).toHaveLength(4);
    for (const svg of drawings) {
      expect(svg).toStartWith("<svg");
      expect(svg).not.toMatch(/<script|foreignObject|onload=|javascript:/i);
    }
  });

  test("each entry is { label, light, dark }", async () => {
    const { body } = await get("/api/posts/with");
    for (const entry of Object.values<Record<string, unknown>>(body.diagrams)) {
      expect(Object.keys(entry).sort()).toEqual(["dark", "label", "light"]);
      expect(entry.label).toStartWith("Diyagram");
    }
  });

  test("a post without diagrams answers with {} (never null, never missing)", async () => {
    const { body } = await get("/api/posts/without");
    expect(body.diagrams).toEqual({});
  });

  test("the list carries cards only: no content and no diagrams (PERF-15)", async () => {
    const { res, body } = await get("/api/posts?lang=tr");
    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    for (const card of body) {
      expect(card).not.toHaveProperty("diagrams");
      expect(card).not.toHaveProperty("content");
    }
  });
});
