// BE-14 / BE-17: the image migrates before it serves, and the builder runs the
// test + typecheck gate before it builds. Static checks on the Dockerfile,
// .dockerignore, package.json, tsconfig.json and bunfig.toml.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { inCheckout, REPO_ROOT } from "../helpers";

const read = (path: string) => Bun.file(join(REPO_ROOT, path)).text();
const pkg = (await Bun.file(join(REPO_ROOT, "package.json")).json()) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** The instructions of one stage, from its FROM line to the next FROM. */
function stage(dockerfile: string, name: string): string {
  const start = dockerfile.search(new RegExp(`^FROM .* AS ${name}$`, "m"));
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = dockerfile.slice(start + 1);
  const next = rest.search(/^FROM /m);
  return next === -1 ? rest : rest.slice(0, next);
}

// The Docker build context leaves out Dockerfile and .dockerignore; these run locally and in CI.
describe.skipIf(!inCheckout("Dockerfile"))("Dockerfile", () => {
  test("drizzle.config is not in the image any more (BE-14 criterion 1)", async () => {
    expect((await read("Dockerfile")).match(/drizzle\.config/g)).toBeNull();
  });

  test("CMD migrates, then execs the server so bun stays PID 1 (BE-14 criterion 1, BE-21)", async () => {
    const production = stage(await read("Dockerfile"), "production");
    const cmds = production.match(/^CMD .*$/gm) ?? [];
    expect(cmds).toEqual([
      'CMD ["sh", "-c", "bun run src/db/migrate.ts && exec bun run server.ts"]',
    ]);
    // migrate.ts and migrations/ ship with src/.
    expect(production).toMatch(/^COPY src \.\/src$/m);
  });

  test("the builder runs the check gate as NODE_ENV=test before building (BE-17 step 6)", async () => {
    const builder = stage(await read("Dockerfile"), "builder");
    const gate = builder.indexOf("RUN NODE_ENV=test bun run check");
    const build = builder.indexOf("RUN bun run build");
    expect(gate).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(gate);
  });

  test("the builder declares the Umami build args before vite build (ANL-01)", async () => {
    const builder = stage(await read("Dockerfile"), "builder");
    const build = builder.indexOf("RUN bun run build");
    for (const arg of ["VITE_UMAMI_WEBSITE_ID", "VITE_UMAMI_SRC"]) {
      const at = builder.search(new RegExp(`^ARG ${arg}(=.*)?$`, "m"));
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(build);
    }
  });

  test(".dockerignore keeps everything the gate and migrate.ts need in the context", async () => {
    const patterns = (await read(".dockerignore"))
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    const needed = [
      "package.json",
      "bun.lock",
      "tsconfig.json",
      "bunfig.toml",
      "server.ts",
      "src",
      "tests",
      "scripts",
      "drizzle.config.ts",
    ];
    // All patterns are single, root-level segments: match the first segment.
    const excluded = needed.filter((path) =>
      patterns.some((p) => new Bun.Glob(p.replace(/^\//, "")).match(path)),
    );
    expect(excluded).toEqual([]);
  });
});

describe("package.json scripts (T-02, BE-14, BE-17)", () => {
  test("one test script for both layers (BE-17 criterion 5)", () => {
    expect(pkg.scripts.test).toBe("bun test tests/server && vitest run");
  });

  test("typecheck and check are the builder gate", () => {
    expect(pkg.scripts.typecheck).toBe("tsc --noEmit -p tsconfig.json");
    expect(pkg.scripts.check).toBe("bun run typecheck && bun run test");
  });

  test("db:migrate is the same runner the image starts with (BE-14 step 2)", () => {
    expect(pkg.scripts["db:migrate"]).toBe("bun run src/db/migrate.ts");
    expect(pkg.scripts["db:generate"]).toBe("drizzle-kit generate");
  });

  test("typescript (>= 5.7 for Uint8Array<ArrayBuffer>) and bun types are dev-only", async () => {
    expect(pkg.devDependencies).toHaveProperty("typescript");
    expect(pkg.devDependencies).toHaveProperty("@types/bun");
    expect(pkg.dependencies).not.toHaveProperty("typescript");
    const { version } = (await Bun.file(
      join(REPO_ROOT, "node_modules/typescript/package.json"),
    ).json()) as { version: string };
    const [major, minor] = version.split(".").map(Number);
    expect(major > 5 || (major === 5 && minor >= 7)).toBe(true);
  });
});

describe("tsconfig.json and bunfig.toml (BE-17 steps 2-3)", () => {
  test("strict, no emit, Bun types, covering the server TypeScript", async () => {
    const tsconfig = JSON.parse(await read("tsconfig.json")) as {
      compilerOptions: Record<string, unknown>;
      include: string[];
    };
    expect(tsconfig.compilerOptions).toMatchObject({
      strict: true,
      noEmit: true,
      types: ["bun"],
    });
    expect(tsconfig.include).toEqual(
      expect.arrayContaining([
        "server.ts",
        "src/api/**/*.ts",
        "src/db/**/*.ts",
        "src/server/**/*.ts",
        "scripts/**/*.ts",
        "tests/server/**/*.ts",
      ]),
    );
  });

  test("bun test collects only tests/server (Vitest owns tests/frontend)", async () => {
    const bunfig = await read("bunfig.toml");
    expect(bunfig).toMatch(/^\[test\]$/m);
    expect(bunfig).toMatch(/^root = "tests\/server"$/m);
  });
});
