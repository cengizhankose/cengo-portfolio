// Shared by the hydration tests (hydrate.vitest.jsx, hydrate-tr.vitest.jsx).
//
// drawPages()   the server's HTML for a list of pages, drawn by Bun in one
//               process (render-pages.ts: React's server and client renderers
//               must not share a process with a DOM). The swr data goes
//               through JSON first, as it does on the wire (dates become
//               strings).
// hydratePage() puts that HTML into a #root marked data-ssr and hydrates it
//               with the entry-client tree (StrictMode > SWRConfig >
//               BrowserRouter > AppRoot), collecting what React reports.
import { act } from "@testing-library/react";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import { AppRoot } from "../../../src/app/App";
import { swrConfig } from "../../../src/lib/swr";
import { toSWRFallback } from "../../../src/lib/swrFallback.js";
import { chunkLoaderForRoute } from "../../../src/lib/prefetch.js";
import { matchRoute } from "../../../src/seo/routes.js";

export const POST = {
  id: 1,
  slug: "hello-world",
  title: "Hello world",
  content:
    "Intro with **bold** and a [link](https://example.com).\n\n## A section\n\nText.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n",
  excerpt: "A short excerpt.",
  coverImage: null,
  published: true,
  createdAt: "2026-09-30T10:00:00.000Z",
  updatedAt: "2026-09-30T10:00:00.000Z",
  publishedAt: "2026-09-30T10:00:00.000Z",
  lang: "en",
  translationKey: "hello",
  seoTitle: null,
  diagrams: {},
  translations: [{ lang: "tr", slug: "merhaba-dunya" }],
};
export const CARD = { ...POST, content: undefined, translations: undefined };
export const TR_CARD = {
  ...CARD,
  id: 2,
  slug: "sadece-turkce",
  title: "Sadece Türkçe",
  lang: "tr",
  translationKey: null,
};
export const TR_POST = {
  ...POST,
  id: 2,
  slug: "sadece-turkce",
  title: "Sadece Türkçe",
  lang: "tr",
  translationKey: null,
  translations: [],
};

export const HYDRATION_MESSAGE =
  /hydrat|did not match|server rendered|Minified React error #(418|423|425)/i;

export const WIRE = (data) => JSON.parse(JSON.stringify(data));
const keyOf = (url, data) => `${url}\u0000${JSON.stringify(data)}`;

export function drawPages(pages) {
  const stdout = execFileSync(
    "bun",
    [join(import.meta.dirname, "render-pages.ts")],
    {
      input: JSON.stringify(pages.map(([url, data]) => [url, WIRE(data)])),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const html = JSON.parse(stdout);
  return new Map(
    pages.map(([url, data], index) => [keyOf(url, data), html[index]]),
  );
}

export async function hydratePage(url, data, serverHtml) {
  const wire = WIRE(data);
  const html = serverHtml.get(keyOf(url, data));
  document.body.innerHTML = `<div id="root" data-ssr>${html}</div>`;
  const container = document.getElementById("root");
  window.history.replaceState(null, "", url);

  // The entry's own preparation: the page chunk first.
  const load = chunkLoaderForRoute(matchRoute(url));
  if (load) await load();

  const marked = {
    h1: container.querySelector("h1"),
    main: container.querySelector("main"),
    header: container.querySelector("header"),
  };
  const recoverable = [];
  let root;
  await act(async () => {
    root = hydrateRoot(
      container,
      <StrictMode>
        <SWRConfig
          value={{
            ...swrConfig,
            provider: () => new Map(),
            fallback: toSWRFallback(wire),
          }}
        >
          <BrowserRouter>
            <AppRoot />
          </BrowserRouter>
        </SWRConfig>
      </StrictMode>,
      { onRecoverableError: (error) => recoverable.push(String(error)) },
    );
  });
  // Lazy pages and effects settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  return { container, marked, recoverable, root, html };
}
