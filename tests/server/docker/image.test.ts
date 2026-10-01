// W10 Dockerfile PR (PERF-24, SEC-13, BE-15, SEC-26, BE-27): static checks that
// the production image carries only what the server needs, runs unprivileged,
// reports its health and pins every external image. No Docker daemon is needed;
// the checks that need one (image size, `id -u`, docker inspect) are listed in
// the package report as local-docker-gate.
//
// The Docker build context leaves out Dockerfile and .dockerignore (and now
// .github and ops/), so the checks that read those files run locally and in CI
// and are skipped inside the image's own test gate (inCheckout).
import { describe, expect, test } from "bun:test";
import { isBuiltin } from "node:module";
import { join, relative } from "node:path";
import { inCheckout, REPO_ROOT } from "../helpers";

const read = (path: string) => Bun.file(join(REPO_ROOT, path)).text();
const pkg = (await Bun.file(join(REPO_ROOT, "package.json")).json()) as {
  packageManager?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const DIGEST = /^sha256:[a-f0-9]{64}$/;
/** What the server and the migrator need at run time (BE-15). */
const RUNTIME_DEPENDENCIES = ["drizzle-orm", "hono", "postgres", "zod"];

/** The instructions of one stage, from its FROM line to the next FROM. */
function stage(dockerfile: string, name: string): string {
  const start = dockerfile.search(new RegExp(`^FROM .* AS ${name}$`, "m"));
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = dockerfile.slice(start + 1);
  const next = rest.search(/^FROM /m);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Instruction lines of a stage (comments and blank lines dropped, continuations joined). */
function instructions(block: string): string[] {
  return block
    .replace(/\\\n/g, " ")
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter((l) => l && !l.startsWith("#"));
}

const bunImage = (dockerfile: string) => {
  const match = dockerfile.match(
    /^ARG BUN_IMAGE=oven\/bun:(\d+\.\d+\.\d+)-alpine@(sha256:[a-f0-9]{64})$/m,
  );
  expect(match).not.toBeNull();
  return { version: match![1]!, digest: match![2]! };
};

describe("package.json runtime dependencies (BE-15, PERF-24)", () => {
  test("dependencies are exactly the server's packages", () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(RUNTIME_DEPENDENCIES);
  });

  test("everything that Vite bundles or only the build and tests use is a devDependency", () => {
    for (const name of [
      "react",
      "react-dom",
      "react-router-dom",
      "react-bootstrap",
      "bootstrap",
      "react-markdown",
      "rehype-raw",
      "rehype-sanitize",
      "remark-gfm",
      "swr",
      "web-vitals",
      "@emailjs/browser",
      "mermaid",
      "vite",
      "terser",
      "drizzle-kit",
      "concurrently",
      "@testing-library/react",
    ]) {
      expect(pkg.dependencies).not.toHaveProperty(name);
      expect(pkg.devDependencies).toHaveProperty(name);
    }
    expect(pkg.devDependencies).not.toHaveProperty("gh-pages");
  });

  test("bun.lock's workspace entry agrees with package.json (frozen install in both install stages)", async () => {
    const lock = Bun.JSONC.parse(await read("bun.lock")) as {
      workspaces: {
        "": {
          dependencies: Record<string, string>;
          devDependencies: Record<string, string>;
        };
      };
    };
    expect(lock.workspaces[""].dependencies).toEqual(pkg.dependencies);
    expect(lock.workspaces[""].devDependencies).toEqual(pkg.devDependencies);
  });
});

// server.ts is the process; src/db/migrate.ts is the CMD's first step.
const graph = await Bun.build({
  entrypoints: [
    join(REPO_ROOT, "server.ts"),
    join(REPO_ROOT, "src/db/migrate.ts"),
  ],
  target: "bun",
  packages: "external",
  splitting: false,
  metafile: true,
});

describe("runtime import graph (BE-15 risk: a server module left out of the image)", () => {
  test("the graph builds", () => {
    expect(graph.success).toBe(true);
  });

  test("every package the server imports is a production dependency", () => {
    const packages = new Set<string>();
    for (const input of Object.values(graph.metafile!.inputs)) {
      for (const imp of input.imports) {
        if (!imp.external || isBuiltin(imp.path)) continue;
        // 'hono/bun' -> 'hono', '@scope/name/x' -> '@scope/name'
        const parts = imp.path.split("/");
        packages.add(
          imp.path.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!,
        );
      }
    }
    expect([...packages].sort()).toEqual(RUNTIME_DEPENDENCIES);
    for (const name of packages) expect(pkg.dependencies).toHaveProperty(name);
  });

  test.skipIf(!inCheckout("Dockerfile"))(
    "every source file in the graph is copied into the production stage",
    async () => {
      const production = instructions(
        stage(await read("Dockerfile"), "production"),
      );
      const copied = production
        .filter((l) => l.startsWith("COPY ") && !l.includes("--from="))
        .map((l) => l.split(" ")[1]!.replace(/\/$/, ""));
      const files = Object.keys(graph.metafile!.inputs).map((f) =>
        f.startsWith("/") ? relative(REPO_ROOT, f) : f,
      );
      expect(files.length).toBeGreaterThan(20);
      const missing = files.filter(
        (f) => !copied.some((c) => f === c || f.startsWith(`${c}/`)),
      );
      expect(missing).toEqual([]);
      // migrate.ts reads src/db/migrations next to itself.
      expect(copied).toContain("src");
    },
  );
});

describe.skipIf(!inCheckout("Dockerfile"))("Dockerfile", () => {
  test("one Bun image, pinned by version and digest, shared by every stage (SEC-26, BE-27)", async () => {
    const dockerfile = await read("Dockerfile");
    const { digest } = bunImage(dockerfile);
    expect(digest).toMatch(DIGEST);
    // no FROM names oven/bun directly: all go through ${BUN_IMAGE}, or a stage
    const froms = dockerfile.match(/^FROM .*$/gm) ?? [];
    expect(froms.length).toBeGreaterThanOrEqual(5);
    const stages = new Set(
      [...dockerfile.matchAll(/^FROM .* AS (\S+)$/gm)].map((m) => m[1]),
    );
    for (const from of froms) {
      const base = from.split(" ")[1]!;
      expect(base === "${BUN_IMAGE}" || stages.has(base)).toBe(true);
    }
    // the image reference appears on exactly one instruction line (the ARG)
    expect(
      instructions(dockerfile).filter((l) => l.includes("oven/bun:")),
    ).toHaveLength(1);
    expect((dockerfile.match(/^ARG BUN_IMAGE=/gm) ?? []).length).toBe(1);
  });

  test("the image's Bun = packageManager = @types/bun (BE-27)", async () => {
    const { version } = bunImage(await read("Dockerfile"));
    expect(pkg.packageManager).toBe(`bun@${version}`);
    expect(pkg.devDependencies["@types/bun"]).toBe(version);
  });

  test("production is the LAST stage (Out Plane builds the last stage; SEC-13)", async () => {
    const froms = (await read("Dockerfile")).match(/^FROM .*$/gm) ?? [];
    expect(froms.at(-1)).toMatch(/ AS production$/);
  });

  test("production starts from a clean Bun image, not from a stage that holds dev dependencies (PERF-24, SEC-13, BE-15)", async () => {
    const dockerfile = await read("Dockerfile");
    expect(dockerfile).toMatch(/^FROM \$\{BUN_IMAGE\} AS production$/m);
    expect(dockerfile).toMatch(/^FROM \$\{BUN_IMAGE\} AS deps-prod$/m);
    const prod = instructions(stage(dockerfile, "production"));
    expect(prod).toContain(
      "COPY --from=deps-prod /app/node_modules ./node_modules",
    );
    // nothing is installed in the production stage itself
    expect(
      prod.some((l) =>
        /^RUN .*\b(bun|npm|yarn|pnpm) (install|add|i)\b/.test(l),
      ),
    ).toBe(false);
    // and no node_modules arrives from the all-dependencies stages
    expect(
      prod.filter((l) => l.includes("--from=") && l.includes("node_modules")),
    ).toEqual(["COPY --from=deps-prod /app/node_modules ./node_modules"]);
  });

  test("deps-prod installs the lockfile frozen, production only, without optional peers (PERF-24)", async () => {
    const deps = instructions(stage(await read("Dockerfile"), "deps-prod"));
    expect(deps).toContain(
      "RUN bun install --frozen-lockfile --production --omit=peer",
    );
    expect(deps.some((l) => l.startsWith("COPY package.json bun.lock"))).toBe(
      true,
    );
  });

  test("the process runs as the unprivileged bun user, set after the COPYs (SEC-13, BE-15)", async () => {
    const prod = instructions(stage(await read("Dockerfile"), "production"));
    expect(prod.filter((l) => l.startsWith("USER "))).toEqual(["USER bun"]);
    const user = prod.indexOf("USER bun");
    const lastCopy = prod.map((l) => l.startsWith("COPY ")).lastIndexOf(true);
    expect(user).toBeGreaterThan(lastCopy);
    expect(prod.indexOf("EXPOSE 3000")).toBeGreaterThan(user);
  });

  test("HEALTHCHECK probes /health on loopback and the PORT the server listens on (BE-15)", async () => {
    const prod = instructions(stage(await read("Dockerfile"), "production"));
    const check = prod.find((l) => l.startsWith("HEALTHCHECK "));
    expect(check).toBeDefined();
    expect(check).toMatch(/--interval=\d+s/);
    expect(check).toMatch(/--timeout=\d+s/);
    expect(check).toMatch(/--start-period=\d+s/);
    // busybox wget is in the alpine image; curl is not
    expect(check).toContain(
      'CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/health"',
    );
    expect(check).toMatch(/\|\| exit 1$/);
    expect(prod.filter((l) => l.startsWith("HEALTHCHECK "))).toHaveLength(1);
  });

  test("the production stage ships dist (client + server bundle), build-info and server.ts, never the test or build tooling (PERF-24)", async () => {
    const prod = instructions(stage(await read("Dockerfile"), "production"));
    expect(prod).toContain("COPY --from=builder /app/dist ./dist");
    expect(prod).toContain(
      "COPY --from=builder /app/build-info.json ./build-info.json",
    );
    expect(prod).toContain("COPY server.ts ./server.ts");
    const copied = prod.filter((l) => l.startsWith("COPY ")).join("\n");
    for (const tooling of [
      "tests",
      "scripts",
      "drizzle.config",
      "vite.config",
      "index.html",
      "public",
    ]) {
      expect(copied).not.toContain(tooling);
    }
  });

  test("development and builder start from the all-dependencies stage (the gate needs vitest, tsc, vite)", async () => {
    const dockerfile = await read("Dockerfile");
    expect(dockerfile).toMatch(/^FROM \$\{BUN_IMAGE\} AS deps$/m);
    expect(dockerfile).toMatch(/^FROM deps AS development$/m);
    expect(dockerfile).toMatch(/^FROM deps AS builder$/m);
    expect(instructions(stage(dockerfile, "deps"))).toContain(
      "RUN bun install --frozen-lockfile",
    );
  });
});

describe.skipIf(!inCheckout("ops/umami/Dockerfile"))(
  "Umami image reference (SEC-26, T-13)",
  () => {
    test("one FROM line: fixed version tag plus digest, never a floating tag", async () => {
      const text = await read("ops/umami/Dockerfile");
      const lines = text.split("\n").filter((l) => l.trim());
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(
        /^FROM ghcr\.io\/umami-software\/umami:[^@: ]+@sha256:[a-f0-9]{64}$/,
      );
      expect(text).not.toMatch(/umami:(latest|postgresql-latest)/i);
      // a version tag, e.g. 3.4.0 or postgresql-v2.20.2
      expect(lines[0]).toMatch(/umami:(postgresql-)?v?\d+\.\d+\.\d+@/);
    });

    test("the app's image reference is that FROM line without 'FROM ' (what `outplane build set --image` gets)", async () => {
      const text = await read("ops/umami/Dockerfile");
      const ref = text.split("\n")[0]!.replace(/^FROM /, "");
      expect(ref).toMatch(
        /^ghcr\.io\/umami-software\/umami:.+@sha256:[a-f0-9]{64}$/,
      );
    });
  },
);

describe.skipIf(!inCheckout(".github/dependabot.yml"))(
  "Dependabot (SEC-26, BE-27)",
  () => {
    type Update = {
      "package-ecosystem": string;
      directory: string;
      schedule: { interval: string };
      "open-pull-requests-limit"?: number;
    };
    const load = async () =>
      Bun.YAML.parse(await read(".github/dependabot.yml")) as {
        version: number;
        updates: Update[];
      };

    test("version 2 with docker (root and /ops/umami), bun and github-actions, each weekly", async () => {
      const { version, updates } = await load();
      expect(version).toBe(2);
      const pairs = updates
        .map((u) => `${u["package-ecosystem"]} ${u.directory}`)
        .sort();
      expect(pairs).toEqual([
        "bun /",
        "docker /",
        "docker /ops/umami",
        "github-actions /",
      ]);
      for (const u of updates) expect(u.schedule.interval).toBe("weekly");
    });

    test("the directories Dependabot watches hold the files it reads", () => {
      expect(inCheckout("Dockerfile")).toBe(true);
      expect(inCheckout("ops/umami/Dockerfile")).toBe(true);
      expect(inCheckout("package.json")).toBe(true);
      expect(inCheckout(".github/workflows")).toBe(true);
    });
  },
);

describe.skipIf(!inCheckout(".dockerignore"))(".dockerignore (W10)", () => {
  test("keeps repository tooling out of the build context but everything the gate reads in", async () => {
    const patterns = (await read(".dockerignore"))
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    for (const out of [".github", "ops", "node_modules", "dist"]) {
      expect(patterns).toContain(out);
    }
    // read by the builder's test gate (tests/frontend/**/about-content, hero-content)
    expect(patterns).not.toContain(".agents");
    expect(patterns).not.toContain("tests");
    expect(patterns).not.toContain("content");
  });
});
