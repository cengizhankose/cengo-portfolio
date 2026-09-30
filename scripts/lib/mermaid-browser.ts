// PERF-05: draws one Mermaid diagram in a real (headless) Chrome.
//
// The page is the project's own `mermaid` (devDependency, the same version
// the blog's client fallback loads: no version skew between what is stored
// and what the client would draw) plus Raleway, the font the blog text is set
// in. Mermaid measures every label in the browser, so with another font the
// boxes would be cut to the wrong width on the live page. The fonts are the
// @fontsource/raleway files, served by a loopback server that lives only as
// long as the renderer; the page has no other network access (chrome.ts).
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ChromeError,
  openChromePage,
  type ChromePage,
  type OpenOptions,
} from "./chrome";

export type Theme = "light" | "dark";

export interface SvgRenderer {
  /** Mermaid's SVG for `source` under the theme's config; `id` becomes the root <svg> id. */
  render(source: string, config: object, id: string): Promise<string>;
  close(): Promise<void>;
}

const REPO_ROOT = resolve(import.meta.dir, "../..");
const MERMAID_BUNDLE = join(
  REPO_ROOT,
  "node_modules/mermaid/dist/mermaid.min.js",
);
const RALEWAY_DIR = join(REPO_ROOT, "node_modules/@fontsource/raleway");
// The weights and styles the site loads (index.html, PERF-08).
const FONT_SHEETS = ["400.css", "500.css", "400-italic.css", "500-italic.css"];
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>diagrams</title>
${FONT_SHEETS.map((name) => `<link rel="stylesheet" href="/raleway/${name}">`).join("\n")}
<script src="/mermaid.min.js"></script>
<script>
  // Draws one diagram. Raleway is loaded first, for the characters this
  // source uses (the Turkish letters are in the latin-ext subset), and the
  // draw stops if it did not load: the measurements would be wrong.
  window.__draw = async (source, config, id) => {
    mermaid.initialize(config);
    await Promise.all(
      ["400", "500"].map((weight) =>
        document.fonts.load(weight + " 16px Raleway", source),
      ),
    );
    const loaded = [...document.fonts].some(
      (face) => face.family.replace(/["']/g, "") === "Raleway" && face.status === "loaded",
    );
    if (!loaded) throw new Error("the Raleway font did not load");
    try {
      const { svg } = await mermaid.render(id, source);
      return svg;
    } finally {
      for (const node of document.querySelectorAll("#" + id + ", #d" + id)) node.remove();
    }
  };
</script></head><body></body></html>`;

function fileResponse(path: string, type: string): Response {
  return existsSync(path)
    ? new Response(Bun.file(path), { headers: { "Content-Type": type } })
    : new Response("not found", { status: 404 });
}

const FONT_TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  woff2: "font/woff2",
  woff: "font/woff",
};

function serve(req: Request): Response {
  const { pathname } = new URL(req.url);
  if (pathname === "/") {
    return new Response(PAGE, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (pathname === "/mermaid.min.js") {
    return fileResponse(MERMAID_BUNDLE, "text/javascript; charset=utf-8");
  }
  const font = /^\/raleway\/(?:files\/)?([^/]+)$/.exec(pathname);
  if (font && SAFE_NAME.test(font[1])) {
    const extension = font[1].split(".").pop() ?? "";
    const type = FONT_TYPES[extension];
    const inFiles = pathname.startsWith("/raleway/files/");
    if (type && inFiles === (extension !== "css")) {
      return fileResponse(
        join(RALEWAY_DIR, inFiles ? "files" : "", font[1]),
        type,
      );
    }
  }
  return new Response("not found", { status: 404 });
}

export interface BrowserRendererOptions {
  chrome?: OpenOptions;
  /** How long one diagram may take. */
  renderTimeoutMs?: number;
}

/** Starts the harness server and Chrome; close() stops both. */
export async function createBrowserRenderer(
  options: BrowserRendererOptions = {},
): Promise<SvgRenderer> {
  for (const [path, what] of [
    [MERMAID_BUNDLE, "mermaid"],
    [RALEWAY_DIR, "@fontsource/raleway"],
  ] as const) {
    if (!existsSync(path)) {
      throw new ChromeError(`${what} is not installed: run \`bun install\``);
    }
  }

  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: serve });
  let page: ChromePage | undefined;
  try {
    page = await openChromePage(
      `http://127.0.0.1:${server.port}/`,
      options.chrome,
    );
    const deadline = Date.now() + (options.chrome?.timeoutMs ?? 30_000);
    // The tab is created with the URL, but the page script may not have run yet.
    for (;;) {
      const ready = await page
        .evaluate<boolean>(
          'typeof window.__draw === "function" && typeof mermaid === "object"',
        )
        .catch(() => false);
      if (ready) break;
      if (Date.now() > deadline) {
        throw new ChromeError("the diagram page did not load in time");
      }
      await new Promise((done) => setTimeout(done, 50));
    }
  } catch (error) {
    await page?.close().catch(() => {});
    await server.stop(true);
    throw error;
  }

  const open = page;
  const timeoutMs = options.renderTimeoutMs ?? 60_000;
  return {
    async render(source, config, id) {
      const draw = open.evaluate<string>(
        `window.__draw(${JSON.stringify(source)}, ${JSON.stringify(config)}, ${JSON.stringify(id)})`,
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new ChromeError(`drawing took more than ${timeoutMs} ms`)),
          timeoutMs,
        );
      });
      try {
        return await Promise.race([draw, limit]);
      } finally {
        clearTimeout(timer);
      }
    },
    async close() {
      await open.close().catch(() => {});
      await server.stop(true);
    },
  };
}
