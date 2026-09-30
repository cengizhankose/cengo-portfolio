// BE-21: graceful shutdown. In-flight requests finish, new connections are
// refused, the DB pool closes, exit 0; a hung step is cut off with exit 1.
import { describe, expect, test } from "bun:test";
import { createApp } from "../../../src/api/app";
import { createShutdown } from "../../../src/api/shutdown";
import { REPO_ROOT, captureLogs, fakeQueries } from "../helpers";

describe("createShutdown with a real Bun.serve (BE-21 criterion 3)", () => {
  test("in-flight request completes with 200, the next one cannot connect", async () => {
    const steps: string[] = [];
    let server: ReturnType<typeof Bun.serve> | undefined;
    const lifecycle = createShutdown({
      stopServer: async () => {
        steps.push("stop");
        await server?.stop();
        steps.push("stopped");
      },
      closeDb: async () => {
        steps.push("closeDb");
      },
      exit: (code) => steps.push(`exit ${code}`),
    });
    const app = createApp({
      queries: fakeQueries({
        listPublishedPosts: async () => {
          await Bun.sleep(500); // slow query still running when SIGTERM arrives (at 150 ms)
          return [];
        },
      }),
      isShuttingDown: lifecycle.isShuttingDown,
    });
    server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
    const base = `http://127.0.0.1:${server.port}`;

    const { lines } = await captureLogs(async () => {
      const inflight = fetch(`${base}/api/posts`);
      await Bun.sleep(150);
      const done = lifecycle.shutdown("SIGTERM");
      expect(lifecycle.isShuttingDown()).toBe(true);
      // /ready flips to 503 at once (checked in-process; the socket is closing).
      expect((await app.request("/ready")).status).toBe(503);
      await Bun.sleep(50);
      const late = await fetch(`${base}/health`).then(
        (res) => `status ${res.status}`,
        (error: { code?: string }) => `error ${error.code ?? "unknown"}`,
      );
      const res = await inflight;
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
      expect(late).toStartWith("error");
      await done;
    });

    expect(steps).toEqual(["stop", "stopped", "closeDb", "exit 0"]);
    expect(lines.map((l) => l.msg)).toEqual(
      expect.arrayContaining(["shutdown start", "shutdown complete"]),
    );
  });

  test("a second signal is ignored", async () => {
    let stops = 0;
    const exits: number[] = [];
    const lifecycle = createShutdown({
      stopServer: async () => {
        stops += 1;
      },
      closeDb: async () => {},
      exit: (code) => exits.push(code),
    });
    await captureLogs(() =>
      Promise.all([
        lifecycle.shutdown("SIGTERM"),
        lifecycle.shutdown("SIGINT"),
      ]),
    );
    expect(stops).toBe(1);
    expect(exits).toEqual([0]);
  });

  test("a hung step is cut off: exit 1 after forceExitAfterMs", async () => {
    const exits: number[] = [];
    const lifecycle = createShutdown({
      stopServer: () => new Promise<void>(() => {}),
      closeDb: async () => {},
      exit: (code) => exits.push(code),
      forceExitAfterMs: 50,
    });
    const { lines } = await captureLogs(async () => {
      void lifecycle.shutdown("SIGTERM");
      await Bun.sleep(150);
    });
    expect(exits).toEqual([1]);
    expect(lines.find((l) => l.msg === "shutdown timed out")).toBeTruthy();
  });

  test("a failing step exits 1", async () => {
    const exits: number[] = [];
    const lifecycle = createShutdown({
      stopServer: async () => {},
      closeDb: async () => {
        throw new Error("pool refused to close");
      },
      exit: (code) => exits.push(code),
    });
    await captureLogs(() => lifecycle.shutdown("SIGTERM"));
    expect(exits).toEqual([1]);
  });
});

// Local analogue of the docker stop criteria (BE-21 criteria 1-2): the real
// server.ts process, SIGTERM, exit 0 well under 3 s with "shutdown complete".
describe("server.ts process", () => {
  test.each(["SIGTERM", "SIGINT"] as const)(
    "%s -> exit 0 in < 3 s, last lines say shutdown complete",
    async (signal) => {
      const proc = Bun.spawn([process.execPath, "server.ts"], {
        cwd: REPO_ROOT,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          PORT: "0",
          LOG_LEVEL: "info",
          // Nothing listens there; the pool is lazy, so no query ever runs.
          PG_CONNECTION_URL: "postgres://test@127.0.0.1:1/portfolio_test",
          PG_SSL_MODE: "disable",
          PG_CA_CERT: "",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let output = "";
      const deadline = Date.now() + 10_000;
      while (!output.includes('"server started"') && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        output += decoder.decode(value);
      }
      expect(output).toContain('"server started"');
      const port = JSON.parse(
        output.split("\n").find((l) => l.includes('"server started"'))!,
      ).port;
      expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);

      const started = performance.now();
      proc.kill(signal);
      const code = await proc.exited;
      const elapsed = performance.now() - started;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        output += decoder.decode(value);
      }
      expect(code).toBe(0);
      expect(elapsed).toBeLessThan(3000);
      const tail = output.trim().split("\n").slice(-2).join("\n");
      expect(tail).toContain('"shutdown complete"');
    },
    20_000,
  );
});
