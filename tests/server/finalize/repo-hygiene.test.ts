// BE-25 / SEC-31 / FE-37: one deployment path (Out Plane + Dockerfile), a
// compose file that works against its own database, and a CLAUDE.md that
// matches the repository. These are the file-level acceptance criteria of
// W12-BE-finalize-docs, turned into tests.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../db/pglite";
import { inCheckout } from "../helpers";

const read = (file: string) => readFileSync(join(REPO_ROOT, file), "utf8");
const exists = (file: string) => existsSync(join(REPO_ROOT, file));
// The Docker build context leaves out docker-compose*, root *.md and ops/ (.dockerignore):
// tests that read them are skipped inside the image's gate (inCheckout).
const pkg = JSON.parse(read("package.json")) as {
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("stale deploy paths are gone (SEC-31 / BE-25)", () => {
  test.each(["vercel.json", "nginx.conf", "DOCKER_README.md"])(
    "%s does not exist",
    (file) => {
      expect(exists(file)).toBe(false);
    },
  );

  test("the migration plan moved to claudedocs/archive", () => {
    expect(exists("VITE_BUN_MIGRATION_PLAN.md")).toBe(false);
    expect(exists("claudedocs/archive/VITE_BUN_MIGRATION_PLAN.md")).toBe(true);
  });

  test("package.json has no deploy or predeploy script and no gh-pages", () => {
    expect(Object.keys(pkg.scripts)).not.toContain("deploy");
    expect(Object.keys(pkg.scripts)).not.toContain("predeploy");
    expect(pkg.dependencies?.["gh-pages"]).toBeUndefined();
    expect(pkg.devDependencies?.["gh-pages"]).toBeUndefined();
    expect(read("bun.lock")).not.toContain("gh-pages");
  });

  test("docker-deploy.sh is a valid local helper that uses compose v2", () => {
    const script = read("docker-deploy.sh");
    expect(script).not.toMatch(/docker-compose/);
    expect(script).toMatch(
      /docker compose --profile production up --build app-prod/,
    );
    // The Alpine image's build gate has no bash; the syntax check runs where it is installed.
    if (!Bun.which("bash")) return;
    const syntax = Bun.spawnSync([
      "bash",
      "-n",
      join(REPO_ROOT, "docker-deploy.sh"),
    ]);
    expect(syntax.exitCode).toBe(0);
  });
});

interface ComposeService {
  build?: { target?: string };
  ports?: string[];
  environment?: string[];
  depends_on?: Record<string, { condition?: string }>;
  profiles?: string[];
  healthcheck?: unknown;
}
const compose = (
  inCheckout("docker-compose.yml")
    ? Bun.YAML.parse(read("docker-compose.yml"))
    : { services: {} }
) as {
  version?: unknown;
  services: Record<string, ComposeService>;
};

describe.skipIf(!inCheckout("docker-compose.yml"))(
  "docker-compose.yml (BE-25)",
  () => {
    test("no obsolete `version:` key", () => {
      expect(compose.version).toBeUndefined();
      expect(read("docker-compose.yml")).not.toMatch(/^version:/m);
    });

    test("services: db, app-dev and app-prod", () => {
      expect(Object.keys(compose.services).sort()).toEqual([
        "app-dev",
        "app-prod",
        "db",
      ]);
    });

    test("app-prod builds the production target and talks to the compose db without TLS", () => {
      const prod = compose.services["app-prod"];
      expect(prod.build?.target).toBe("production");
      expect(prod.profiles).toEqual(["production"]);
      expect(prod.environment).toContain(
        "PG_CONNECTION_URL=postgres://portfolio@db:5432/portfolio_dev",
      );
      expect(prod.environment).toContain("PG_SSL_MODE=disable");
      expect(prod.depends_on?.db?.condition).toBe("service_healthy");
    });

    test("the db service has a healthcheck and is part of every profile that needs it", () => {
      const db = compose.services.db;
      expect(db.healthcheck).toBeDefined();
      expect(db.profiles).toEqual(
        expect.arrayContaining(["dev", "development", "production"]),
      );
    });

    test("every published port is bound to 127.0.0.1 (SEC-12)", () => {
      for (const [name, service] of Object.entries(compose.services)) {
        for (const port of service.ports ?? []) {
          expect(port, name).toStartWith("127.0.0.1:");
        }
      }
    });

    test("the dev container has no VITE_API_URL (BE-09)", () => {
      expect(JSON.stringify(compose.services["app-dev"])).not.toContain(
        "VITE_API_URL",
      );
    });
  },
);

// CLAUDE.md is not in the Docker build context (root *.md is excluded).
describe.skipIf(!inCheckout("CLAUDE.md"))(
  "CLAUDE.md (FE-37 / SEC-31 / BE-25)",
  () => {
    const doc = inCheckout("CLAUDE.md") ? read("CLAUDE.md") : "";
    const lines = doc.split("\n");

    test("names no retired deploy path or stale entry", () => {
      expect(doc).not.toMatch(/nginx|gh-pages|vercel/i);
      expect(doc).not.toMatch(/GitHub Pages|src\/index\.jsx|@\/ maps/);
    });

    test("every `bun test` is the server layer (tests/server), as T-02 says", () => {
      const offenders = lines.filter(
        (line) =>
          line.includes("bun test") && !line.includes("bun test tests/server"),
      );
      expect(offenders).toEqual([]);
    });

    test("every `bun run <script>` it names exists in package.json", () => {
      const names = new Set(
        [...doc.matchAll(/bun run ([a-z:-]+)/g)].map((match) => match[1]),
      );
      expect(names.size).toBeGreaterThan(10);
      const missing = [...names].filter((name) => !(name in pkg.scripts));
      expect(missing).toEqual([]);
    });

    test("every package.json script a developer needs is documented", () => {
      for (const script of [
        "dev",
        "api",
        "build",
        "lint",
        "test",
        "typecheck",
        "check",
        "db:up",
        "db:migrate",
        "db:generate",
        "db:seed",
        "content:publish",
        "hooks:install",
        "images:build",
        "brand:build",
      ]) {
        expect(doc, script).toContain(`bun run ${script}`);
      }
    });

    test("states the deploy flow and the security-header layer", () => {
      expect(doc).toContain("server.ts");
      expect(doc).toContain("Out Plane");
      expect(doc).toContain("cengoportfoliolhal");
      expect(doc).toContain("bun run check");
      expect(doc).toContain("security-headers");
      expect(doc).toContain("Dockerfile");
    });

    test("documents the environment variable names the code reads", () => {
      const names = [
        "PG_CONNECTION_URL",
        "PG_MIGRATE_URL",
        "PG_WRITE_CONNECTION_URL",
        "PG_STATS_URL",
        "REQUEST_STATS_ENABLED",
        "PG_SSL_MODE",
        "PG_CA_CERT",
        "PORT",
        "LOG_LEVEL",
        "CSP_MODE",
        "HSTS_MAX_AGE",
        "RL_READ_PER_MIN",
        "RATE_LIMIT_DISABLED",
        "CF_WEB_ANALYTICS",
        "SEO_INJECT",
        "POST_CACHE_DISABLED",
        "VITE_UMAMI_WEBSITE_ID",
        "VITE_UMAMI_SRC",
        "ALLOW_REMOTE_DB",
        "CHROME_PATH",
      ];
      for (const name of names) expect(doc, name).toContain(name);
    });

    test("documents the architecture it claims: createApp, T-01 errors, SSR, T-12, T-14, CSS Modules", () => {
      for (const phrase of [
        "createApp()",
        "T-01",
        "src/entry-server.jsx",
        "src/entry-client.jsx",
        "src/seo/pages.js",
        "T-12",
        "T-14",
        "CSS Modules",
        "X-Next-Cursor",
        "/ready",
        "scripts/seo-smoke.ts",
      ]) {
        expect(doc, phrase).toContain(phrase);
      }
    });

    test("states that EN and TR static pages are both live (T-12)", () => {
      expect(doc).toMatch(/EN and TR static pages are both live/);
    });

    test("contains no secret-looking value", () => {
      expect(doc).not.toMatch(/postgres:\/\/[^\s@]+:[^\s@]+@/);
      expect(doc).not.toMatch(/ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}/);
    });
  },
);

describe("files the documentation points at exist", () => {
  const pointers = [
    "src/api/errors.ts",
    "src/api/middleware/csp.ts",
    "src/api/middleware/security-headers.ts",
    "src/api/middleware/rate-limit.ts",
    "src/api/middleware/canonical-host.ts",
    "src/api/cache.ts",
    "src/api/shutdown.ts",
    "src/db/guard.ts",
    "src/db/migrate.ts",
    "src/server/requestStats.ts",
    "src/server/static.ts",
    "src/seo/pages.js",
    "src/seo/inject.ts",
    "src/seo/head.ts",
    "src/seo/routes.js",
    "src/lib/swrFallback.js",
    "src/styles/layers.css",
    "src/styles/tokens.css",
    "src/components/Cursor.jsx",
    "scripts/seo-smoke.ts",
    "scripts/prerender.ts",
    "scripts/fonts/sync-fonts.ts",
    "scripts/fonts/measure-fallbacks.ts",
    "scripts/lib/write-mermaid-config.ts",
    "scripts/sql/least-privilege.sql",
    "scripts/sql/umami-isolation.sql",
    "claudedocs/analytics/tracking-plan.md",
  ];
  test.each(pointers)("%s", (file) => {
    expect(exists(file)).toBe(true);
  });

  test.skipIf(!inCheckout("ops/umami/Dockerfile"))(
    "ops/umami/Dockerfile",
    () => {
      expect(exists("ops/umami/Dockerfile")).toBe(true);
    },
  );
});
