// Helper for hydrate.vitest.jsx, run by Bun in its own process: reads
// `[[url, swrData], ...]` as JSON on stdin, draws every page with the real
// server render (src/entry-server.jsx) and prints `[html, ...]` as JSON.
// A separate process, because React's server and client renderers must not
// share a process with a DOM (jsdom) when the client side is the one under
// test: they would warn about each other's contexts.
// @ts-expect-error: a .jsx module without declarations (Bun compiles it).
import { render } from "../../../src/entry-server.jsx";

const pages: [string, Record<string, unknown>][] = JSON.parse(
  await Bun.stdin.text(),
);
const out: string[] = [];
for (const [url, fallback] of pages) {
  out.push((await render(url, { fallback })).html);
}
// Wait for the write to finish: Bun.write(Bun.stdout) stops at the pipe's
// 128 KB buffer, and a plain console.log may be cut at exit.
await new Promise<void>((resolve, reject) =>
  process.stdout.write(JSON.stringify(out), (error) =>
    error ? reject(error) : resolve(),
  ),
);
