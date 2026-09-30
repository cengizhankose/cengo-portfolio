import React from "react";
import ReactDOM from "react-dom/client";
import { SWRConfig } from "swr";
import App from "./app/App";
import { IntentPrefetch } from "./hooks/useIntentPrefetch";
import { initAnalytics } from "./lib/analytics";
import { swrConfig } from "./lib/swr";
import "./index.css";

// Blog data layer (T-04, FE-12): one swr cache for the whole visit, shared
// by every page and by the intent preload (PERF-14). A reload starts empty.
// W7 (SEO-01) adds the server's first data here as
// `fallback: toSWRFallback(readSeoData())` (src/lib/swrFallback.js); the
// hooks then skip the request for a key the server already sent.
const swrCache = new Map();
const swrValue = { ...swrConfig, provider: () => swrCache };

const container = document.getElementById("root");
const root = ReactDOM.createRoot(container);

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
