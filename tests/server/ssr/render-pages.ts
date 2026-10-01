// Helper for the *.vitest.jsx hydration tests, run by Bun in its own process:
// reads `[[url, swrData], ...]` as JSON on stdin, draws every page with the
// real server render (src/entry-server.jsx) and prints `[html, ...]` as JSON.
// A separate process, because React's server and client renderers must not
// share a process with a DOM (jsdom) when the client side is the one under
// test: they would warn about each other's contexts.
//
// OPEN_TR=1 draws the site as it will be once the TR static pages are open
// (SEO-11 Adım B): the one edit `static: ["en"]` -> `["en", "tr"]` in
// src/seo/routes.js, applied while the module loads. Nothing on disk changes.
import { plugin } from "bun";
import "../../frontend/css-arch/bun-css-modules";

if (process.env.OPEN_TR === "1") {
  plugin({
    name: "open-tr-static-pages",
    setup(build) {
      build.onLoad(
        { filter: /src[\\/]seo[\\/]routes\.js$/ },
        async ({ path }) => {
          const source = await Bun.file(path).text();
          const opened = source.replace(
            'static: Object.freeze(["en"])',
            'static: Object.freeze(["en", "tr"])',
          );
          if (opened === source) throw new Error("LIVE.static changed shape");
          return { contents: opened, loader: "js" };
        },
      );
    },
  });
}

// @ts-expect-error: a .jsx module without declarations (Bun compiles it).
const { render } = await import("../../../src/entry-server.jsx");

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
