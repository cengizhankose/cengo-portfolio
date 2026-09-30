// PERF-05: a headless Chrome driven over the DevTools protocol, for the one
// job the publish script needs a browser for: drawing Mermaid diagrams (they
// are measured, so they need real layout and real fonts; jsdom has neither).
//
// Why not mermaid-cli / Puppeteer: they download their own Chromium on
// install. This file needs no dependency (Bun's WebSocket and Bun.spawn) and
// uses the Chrome or Chromium that is already on the publish machine
// (CHROME_PATH, or the usual install locations). The build image never runs
// it: only the publish command does.
//
// Isolation: a fresh throw-away profile, loopback-only DevTools port, and a
// dead proxy for everything that is not loopback, so the page can reach only
// the harness server that started it.
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class ChromeError extends Error {
  override name = "ChromeError";
}

const MACOS_BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
];
const PATH_BROWSERS = [
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
  "microsoft-edge",
];

export interface FindChromeDeps {
  env?: Record<string, string | undefined>;
  exists?: (path: string) => boolean;
  which?: (name: string) => string | null;
}

/**
 * The browser to use: CHROME_PATH when set (and then it must exist, so a typo
 * is an error and not a silent switch to another browser), otherwise the
 * first usual install location or PATH entry. Null when there is none.
 */
export function findChrome(deps: FindChromeDeps = {}): string | null {
  const env = deps.env ?? process.env;
  const exists = deps.exists ?? existsSync;
  const which = deps.which ?? ((name: string) => Bun.which(name));
  const configured = env.CHROME_PATH?.trim();
  if (configured) {
    if (!exists(configured)) {
      throw new ChromeError(`CHROME_PATH does not exist: ${configured}`);
    }
    return configured;
  }
  for (const path of MACOS_BROWSERS) if (exists(path)) return path;
  for (const name of PATH_BROWSERS) {
    const found = which(name);
    if (found) return found;
  }
  return null;
}

export const NO_CHROME_MESSAGE =
  "no Chrome or Chromium found to draw the diagrams: install one, or set " +
  "CHROME_PATH to its executable (it is used only while publishing)";

export interface ChromePage {
  /** Runs a JavaScript expression in the page and returns its (awaited) value. */
  evaluate<T>(expression: string): Promise<T>;
  close(): Promise<void>;
}

export interface OpenOptions {
  /** The browser executable; default findChrome(). */
  executable?: string;
  /** How long Chrome gets to start and to load the page. */
  timeoutMs?: number;
  /** Extra command-line switches (e.g. --window-size=375,812), after the defaults. */
  args?: string[];
}

interface Pending {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function readDevToolsUrl(
  stream: ReadableStream<Uint8Array>,
  timeoutMs: number,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const next = await Promise.race([
        reader.read(),
        sleep(Math.max(1, deadline - Date.now())).then(() => null),
      ]);
      if (next === null || next.done) break;
      seen += decoder.decode(next.value, { stream: true });
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(seen);
      if (match) {
        // Keep draining so Chrome never blocks on a full stderr pipe.
        void (async () => {
          try {
            while (!(await reader.read()).done);
          } catch {}
        })();
        return match[1];
      }
    }
  } catch {}
  reader.releaseLock?.();
  throw new ChromeError(
    `Chrome did not report a DevTools address in ${timeoutMs} ms` +
      (seen.trim() ? `: ${seen.trim().slice(-300)}` : ""),
  );
}

/** Starts Chrome on a blank profile, opens `url` in one tab and returns it. */
export async function openChromePage(
  url: string,
  options: OpenOptions = {},
): Promise<ChromePage> {
  const executable = options.executable ?? findChrome();
  if (!executable) throw new ChromeError(NO_CHROME_MESSAGE);
  const timeoutMs = options.timeoutMs ?? 30_000;

  const profile = await mkdtemp(join(tmpdir(), "publish-chrome-"));
  const proc = Bun.spawn(
    [
      executable,
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-gpu",
      "--mute-audio",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      // Nothing but loopback (the harness server) is reachable from the page.
      "--proxy-server=127.0.0.1:9",
      ...(options.args ?? []),
      "about:blank",
    ],
    { stdout: "ignore", stderr: "pipe", stdin: "ignore" },
  );

  let socket: WebSocket | undefined;
  let closed = false;
  const shutdown = async () => {
    closed = true;
    try {
      socket?.close();
    } catch {}
    proc.kill();
    await Promise.race([proc.exited, sleep(3_000)]);
    if (proc.exitCode === null) proc.kill(9);
    await rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(
      () => {},
    );
  };

  try {
    const wsUrl = await readDevToolsUrl(proc.stderr, timeoutMs);
    const ws = new WebSocket(wsUrl);
    socket = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new ChromeError("DevTools connection failed"));
    });

    let lastId = 0;
    const pending = new Map<number, Pending>();
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      if (message.error) {
        waiting.reject(
          new ChromeError(`${message.error.message} (${message.error.code})`),
        );
      } else waiting.resolve(message.result);
    };
    ws.onclose = () => {
      for (const waiting of pending.values()) {
        waiting.reject(new ChromeError("Chrome closed the connection"));
      }
      pending.clear();
    };
    const send = <T>(
      method: string,
      params: object = {},
      sessionId?: string,
    ): Promise<T> =>
      new Promise((resolve, reject) => {
        if (closed || ws.readyState !== WebSocket.OPEN) {
          reject(new ChromeError("the browser is closed"));
          return;
        }
        const id = ++lastId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });

    const { targetId } = await send<{ targetId: string }>(
      "Target.createTarget",
      { url },
    );
    const { sessionId } = await send<{ sessionId: string }>(
      "Target.attachToTarget",
      { targetId, flatten: true },
    );

    return {
      async evaluate<T>(expression: string): Promise<T> {
        const result = await send<{
          result: { value?: T };
          exceptionDetails?: {
            text: string;
            exception?: { description?: string; value?: unknown };
          };
        }>(
          "Runtime.evaluate",
          { expression, awaitPromise: true, returnByValue: true },
          sessionId,
        );
        if (result.exceptionDetails) {
          const { text, exception } = result.exceptionDetails;
          const detail =
            exception?.description ?? String(exception?.value ?? text);
          throw new ChromeError(detail.split("\n")[0]);
        }
        return result.result.value as T;
      },
      close: shutdown,
    };
  } catch (error) {
    await shutdown();
    throw error;
  }
}
