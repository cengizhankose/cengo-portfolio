// BE-09: one createApp() for production and the dev API; no port, no database.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";
import { createApp, portFromEnv } from "../../../src/api/app";
import { REPO_ROOT } from "../db/pglite";
import { fakeQueries, SAMPLE_POST } from "./fake-queries";

const DIST = join(REPO_ROOT, "tests/server/fixtures/dist");

describe("createApp", () => {
  test("GET /health answers 200 without a port (BE-09 criterion 6)", async () => {
    const res = await createApp({ queries: fakeQueries(), serveSpa: false }).request(
      "/health",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("the injected queries serve /api/posts and /api/posts/:slug", async () => {
    const app = createApp({ queries: fakeQueries() });
    const list = await app.request("/api/posts");
    expect(list.status).toBe(200);
    expect(((await list.json()) as unknown[]).length).toBe(1);
    const one = await app.request(`/api/posts/${SAMPLE_POST.slug}`);
    expect(one.status).toBe(200);
    expect(await one.json()).toMatchObject({
      slug: SAMPLE_POST.slug,
      lang: "en",
      translationKey: "hello-world",
      translations: [{ lang: "tr", slug: "merhaba-dunya" }],
    });
  });

  test("serveSpa: false serves no site (the dev API)", async () => {
    const res = await createApp({ queries: fakeQueries() }).request("/");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toStartWith("text/plain");
  });

  test("serveSpa: true mounts the built site after the API", async () => {
    const app = createApp({ queries: fakeQueries(), serveSpa: true, distDir: DIST });
    const home = await app.request("/");
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toStartWith("text/html");
    expect((await app.request("/assets/app-3f9a1c.js")).status).toBe(200);
    expect((await app.request("/api/posts")).headers.get("content-type")).toStartWith(
      "application/json",
    );
  });

  test("serveSpa without distDir is a programming error", () => {
    expect(() => createApp({ queries: fakeQueries(), serveSpa: true })).toThrow(
      "distDir is required",
    );
  });

  test("createApp never loads src/db (runs with no PG_CONNECTION_URL at all)", () => {
    const proc = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        "const { createApp } = await import('./src/api/app.ts');" +
          "const res = await createApp({ queries: { ping: async () => {} } }).request('/health');" +
          "console.log(res.status)",
      ],
      {
        cwd: REPO_ROOT,
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", PG_CONNECTION_URL: "" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(proc.stdout.toString().trim()).toBe("200");
    expect(proc.exitCode).toBe(0);
  });
});

describe("portFromEnv", () => {
  test.each([
    [undefined, 3000],
    ["", 3000],
    ["0", 0],
    ["8080", 8080],
    ["abc", 3000],
    ["70000", 3000],
    ["30.5", 3000],
  ])("%p -> %p", (value, expected) => {
    expect(portFromEnv(value as string | undefined, 3000)).toBe(expected as number);
  });
});

describe("one app definition (BE-09 criteria 1-2)", () => {
  async function scan(patterns: string[], re: RegExp) {
    const hits: string[] = [];
    for (const pattern of patterns) {
      for await (const file of new Glob(pattern).scan({ cwd: REPO_ROOT })) {
        const lines = (await Bun.file(join(REPO_ROOT, file)).text()).split("\n");
        lines.forEach((line, i) => re.test(line) && hits.push(`${file}:${i + 1}`));
      }
    }
    return hits;
  }

  test("'/health' is defined exactly once, in src/api/app.ts", async () => {
    const hits = await scan(["server.ts", "src/**/*.{ts,tsx,js,jsx}"], /["']\/health["']/);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toStartWith("src/api/app.ts:");
  });

  test("no API_PORT, hono/cors or VITE_API_URL in the server, compose, env and package files", async () => {
    const hits = await scan(
      [
        "server.ts",
        "src/api/**/*.ts",
        "src/db/**/*.ts",
        "src/server/**/*.ts",
        "package.json",
        "docker-compose.yml",
        ".env.example",
        "vite.config.js",
      ],
      /API_PORT|hono\/cors|VITE_API_URL/,
    );
    expect(hits).toEqual([]);
  });

  test("outside the blog pages (FE-33 handoff), src/ has none either", async () => {
    const hits = await scan(["src/**/*.{ts,tsx,js,jsx}"], /API_PORT|hono\/cors|VITE_API_URL/);
    expect(hits.filter((hit) => !hit.startsWith("src/pages/blog/"))).toEqual([]);
  });

  test("bun run api: PORT=3001, watch mode, the dev entry point", async () => {
    const pkg = await Bun.file(join(REPO_ROOT, "package.json")).json();
    expect(pkg.scripts.api).toBe("PORT=3001 bun --watch src/api/index.ts");
  });

  test("both entry points build the app with createApp and read PORT", async () => {
    for (const file of ["server.ts", "src/api/index.ts"]) {
      const source = await Bun.file(join(REPO_ROOT, file)).text();
      expect(source).toContain("createApp(");
      expect(source).toContain("portFromEnv(process.env.PORT");
      expect(source).not.toMatch(/new Hono\(/);
    }
  });
});
