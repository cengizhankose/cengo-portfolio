import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import { AppShell } from "./app/App";
import { initAnalytics } from "./lib/analytics";
import { chunkLoaderForRoute } from "./lib/prefetch.js";
import { swrConfig } from "./lib/swr";
import { toSWRFallback } from "./lib/swrFallback.js";
import { readSeoData } from "./seo/readSeoData.js";
import { matchRoute } from "./seo/routes.js";
import "./styles/fonts.css";
import "./index.css";

// Browser entry (PERF-03, T-06 Aşama 2). The server sends every page as real
// HTML (src/entry-server.jsx: prerendered at build time for the static pages,
// drawn per request for the blog). `data-ssr` on #root says so, and React then
// hydrates that markup instead of drawing the page again: nothing on screen
// changes when the bundle arrives. Without the marker (the vite dev server,
// SEO_INJECT=off, a 503 shell) the app is drawn from scratch with createRoot,
// which keeps working exactly as before.
//
// Blog data layer (T-04, FE-12): one swr cache for the whole visit, shared by
// every page and by the intent preload (PERF-14). A reload starts empty. The
// server writes the first data of a page into the HTML (`__SEO_DATA__`,
// src/seo/inject.ts); it becomes the swr `fallback`, so the blog hooks find
// their data on the first render and the hydration render matches the server's.
// Without the block the fallback is empty and every page fetches as before.
const swrCache = new Map();
const swrValue = {
  ...swrConfig,
  provider: () => swrCache,
  fallback: toSWRFallback(readSeoData()),
};

// The one `vite:preloadError` listener of the app lives in src/app/App.jsx
// (useReloadOnStaleChunk, FE-05 step 4); none is added here.

const container = document.getElementById("root");
const hydrating = container.hasAttribute("data-ssr");

function start() {
  const app = (
    <StrictMode>
      <SWRConfig value={swrValue}>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AppShell />
        </BrowserRouter>
      </SWRConfig>
    </StrictMode>
  );

  if (hydrating) hydrateRoot(container, app);
  else createRoot(container).render(app);

  // ANL-01 / ANL-16 (T-13): loads Umami + field Web Vitals only in a production
  // build on www.cengizhankose.com with a website id set and no opt-out.
  initAnalytics();
}

// A lazy page (the blog) that has not arrived when React hydrates would keep
// its server markup and hydrate later; loading its chunk first lets the whole
// page hydrate in one pass. A failed load does not block: lazyPage handles it
// when the route renders.
const pageChunk = hydrating
  ? chunkLoaderForRoute(matchRoute(window.location.pathname))
  : null;
if (pageChunk) {
  Promise.resolve()
    .then(pageChunk)
    .catch(() => {})
    .then(start);
} else {
  start();
}
