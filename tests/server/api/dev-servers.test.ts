// SEC-12 + BE-09: the dev API and the Vite dev server listen on loopback only,
// the dev API sends no CORS headers (same origin through the Vite proxy), and
// the lockfile carries no Vite in the advisory range.
import { afterAll, describe, expect, test } from "bun:test";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { REPO_ROOT } from "../helpers";

type Proc = ReturnType<typeof Bun.spawn>;
const running: Proc[] = [];

afterAll(async () => {
  for (const proc of running) proc.kill();
  await Promise.all(running.map((proc) => proc.exited));
});

const baseEnv = () => ({
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
});

function freePort(): number {
  const probe = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data() {} },
  });
  const { port } = probe;
  probe.stop(true);
  return port;
}

function lanAddress(): string | undefined {
  for (const list of Object.values(networkInterfaces()))
    for (const info of list ?? [])
      if (info.family === "IPv4" && !info.internal) return info.address;
  return undefined;
}

async function refused(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return false;
  } catch {
    return true;
  }
}

/**
 * `lsof` listen lines for a port, or null where a full lsof is not available:
 * not installed, or BusyBox's applet (the Alpine image's build gate), which
 * ignores these options and prints no COMMAND header.
 */
function listenLines(port: number): string[] | null {
  const which = Bun.spawnSync(["sh", "-c", "command -v lsof"], {
    stdout: "pipe",
  });
  if (which.exitCode !== 0) return null;
  const out = Bun.spawnSync(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [header = "", ...lines] = out.stdout.toString().split("\n");
  if (!header.startsWith("COMMAND")) return null;
  return lines.filter(Boolean);
}

function expectLoopbackOnly(port: number) {
  const lines = listenLines(port);
  if (lines === null) return; // lsof missing (e.g. minimal CI image)
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    expect(line).toContain(`127.0.0.1:${port}`);
    expect(line).not.toContain(`*:${port}`);
  }
}

describe("dev API (bun src/api/index.ts)", () => {
  let port = 0;

  test("starts on 127.0.0.1 and logs JSON lines", async () => {
    const proc = Bun.spawn([process.execPath, "src/api/index.ts"], {
      cwd: REPO_ROOT,
      env: {
        ...baseEnv(),
        PORT: "0",
        LOG_LEVEL: "info",
        PG_CONNECTION_URL: "postgres://test@127.0.0.1:1/portfolio_test",
        // Unset on purpose: a guarded local DB defaults to plaintext (no TLS locally).
        PG_SSL_MODE: "",
        PG_CA_CERT: "",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    running.push(proc);
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let output = "";
    const deadline = Date.now() + 10_000;
    while (!output.includes('"api started"') && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }
    reader.releaseLock();
    const started = output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((entry) => entry.msg === "api started");
    expect(started).toMatchObject({ level: "info", hostname: "127.0.0.1" });
    expect(output).toContain('"msg":"db configured","max":5,"ssl":"disable"');
    port = started.port;
    expect(port).toBeGreaterThan(0);
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
  }, 20_000);

  test("listens on loopback only (SEC-12 criteria 1-2, BE-09 criterion 3)", async () => {
    expectLoopbackOnly(port);
    const lan = lanAddress();
    if (lan) expect(await refused(`http://${lan}:${port}/health`)).toBe(true);
  });

  test("no CORS: preflights from any origin get no Allow-Origin (SEC-12 criterion 3, BE-09 criterion 4)", async () => {
    for (const [origin, method] of [
      ["http://evil.example", "DELETE"],
      ["http://evil.example", "POST"],
      ["http://localhost:3000", "GET"],
    ]) {
      const res = await fetch(`http://127.0.0.1:${port}/api/posts`, {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": method },
      });
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
      expect(res.headers.get("access-control-allow-methods")).toBeNull();
    }
  });
});

describe("Vite dev server", () => {
  test("config binds loopback and proxies /api to the loopback dev API", async () => {
    const saved = process.env.VITE_HOST;
    delete process.env.VITE_HOST;
    try {
      // vite.config.js is plain JS (no declarations): read it as an untyped module.
      const { default: config } = (await import(
        "../../../vite.config.js" as string
      )) as { default: any };
      expect(config.server.host).toBe("127.0.0.1");
      expect(config.preview.host).toBe("127.0.0.1");
      expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:3001");
    } finally {
      if (saved !== undefined) process.env.VITE_HOST = saved;
    }
    const source = await Bun.file(join(REPO_ROOT, "vite.config.js")).text();
    expect(source).toContain("process.env.VITE_HOST");
    expect(source).not.toMatch(/host:\s*true/);
  });

  test("a running dev server listens on 127.0.0.1 only (SEC-12 criterion 1)", async () => {
    const port = freePort();
    const proc = Bun.spawn(
      [
        process.execPath,
        "node_modules/vite/bin/vite.js",
        "--port",
        String(port),
        "--strictPort",
        "--clearScreen",
        "false",
      ],
      {
        cwd: REPO_ROOT,
        env: { ...baseEnv(), BROWSER: "none" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    running.push(proc);
    const deadline = Date.now() + 20_000;
    let up = false;
    while (!up && Date.now() < deadline) {
      up = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(1000),
      }).then(
        (res) => res.ok,
        () => false,
      );
      if (!up) await Bun.sleep(200);
    }
    expect(up).toBe(true);
    expectLoopbackOnly(port);
    const lan = lanAddress();
    if (lan) expect(await refused(`http://${lan}:${port}/`)).toBe(true);
  }, 40_000);
});

test("bun.lock has no Vite in the advisory range <= 7.3.4 (SEC-12 criterion 4, offline)", async () => {
  const lock = await Bun.file(join(REPO_ROOT, "bun.lock")).text();
  const versions = [...lock.matchAll(/"vite@(\d+)\.(\d+)\.(\d+)"/g)].map((m) =>
    m.slice(1, 4).map(Number),
  );
  expect(versions.length).toBeGreaterThan(0);
  for (const [major, minor, patch] of versions) {
    const inRange = major === 7 && (minor < 3 || (minor === 3 && patch <= 4));
    expect(inRange).toBe(false);
  }
});
