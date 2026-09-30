import React from "react";
import ReactDOM from "react-dom/client";
import { SWRConfig } from "swr";
import App from "./app/App";
import { reloadForNewRelease } from "./components/routefallback/lazyPage.js";
import { IntentPrefetch } from "./hooks/useIntentPrefetch";
import { initAnalytics } from "./lib/analytics";
import { chunkLoaderForRoute } from "./lib/prefetch.js";
import { swrConfig } from "./lib/swr";
import { toSWRFallback } from "./lib/swrFallback.js";
import { readSeoData } from "./seo/readSeoData.js";
import { matchRoute } from "./seo/routes.js";
import "./index.css";

// Blog data layer (T-04, FE-12): one swr cache for the whole visit, shared
// by every page and by the intent preload (PERF-14). A reload starts empty.
// SEO-01 (T-06 Aşama 1): the server writes the first data of the page into
// the HTML (`__SEO_DATA__`, src/seo/inject.ts); it becomes the swr `fallback`,
// so the blog hooks find their data on the first render and skip the request
// and the "Loading..." state. Without the block (dev server, SEO_INJECT=off,
// a 503 shell) the fallback is empty and every page fetches as before.
const swrCache = new Map();
const swrValue = {
  ...swrConfig,
  provider: () => swrCache,
  fallback: toSWRFallback(readSeoData()),
};

// FE-05 step 4 / PERF-04: a lazy import() that is not a page (the cursor
// ring, the EmailJS SDK, mermaid) fails after a deploy, because the hashed
// chunk an already open tab points at is gone. The page reloads once (at most
// once a minute, see lazyPage.js); when it cannot, the error goes on to the
// caller and the route's error boundary.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewRelease()) event.preventDefault();
});

const container = document.getElementById("root");
const root = ReactDOM.createRoot(container);

function render() {
  root.render(
    <React.StrictMode>
      <SWRConfig value={swrValue}>
        <IntentPrefetch />
        <App />
      </SWRConfig>
    </React.StrictMode>,
  );

  // ANL-01 / ANL-16 (T-13): loads Umami + field Web Vitals only in a production
  // build on www.cengizhankose.com with a website id set and no opt-out.
  initAnalytics();
}

// SEO-01: when the server drew the page into #root, that snapshot stays on
// screen until the app can replace it. A lazy page (the blog) would swap it for
// the route fallback while its chunk loads; load the chunk first, then render.
// A failed load does not block the render: lazyPage handles it there.
const snapshotShown = container.hasChildNodes();
const pageChunk = snapshotShown
  ? chunkLoaderForRoute(matchRoute(window.location.pathname))
  : null;
if (pageChunk) {
  Promise.resolve()
    .then(pageChunk)
    .catch(() => {})
    .then(render);
} else {
  render();
}
