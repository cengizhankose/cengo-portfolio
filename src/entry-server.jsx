// Server entry (PERF-03, T-06 Aşama 2): draws the app's route as HTML.
//
//   render('/about')                        -> { html }  (build time, scripts/prerender.ts)
//   render('/blog/x', { fallback })         -> { html }  (request time, src/server/static.ts)
//   render('/blog/x', { errors: { '/api/posts/x': 404 } })
//                                           -> the page of a post that does not exist
//
// `url` is a pathname; the language of the page is not a separate argument:
// useLocale() reads it from the URL prefix inside the app, the same rule the
// browser applies (T-12), so both sides pick the same language. `fallback` is
// the swr map of the page (src/lib/swrFallback.js), the very one the server
// also writes into the HTML as `__SEO_DATA__`, so the blog pages draw their
// content from the data the browser will find again. `errors` names swr keys
// whose request failed, by HTTP status: a server render never fetches, so this
// is how the 404 page of a missing post is drawn by the page's own code.
//
// Only the body comes back. The head is written by src/seo/head.ts
// (renderHeadTags) from the page registry, never by the app: usePageMeta is an
// effect and does not run here, so no tag is printed twice (T-03).
//
// react-dom/static's prerender waits until every lazy chunk and Suspense
// boundary has resolved, and writes the finished boundaries in place: the HTML
// carries no `$RC` inline script (the CSP would block it) and needs no second
// pass. A render error is thrown, never swallowed: the build fails, and the
// request path answers with the plain shell (createRoot in the browser).
import { StrictMode } from "react";
import { prerender } from "react-dom/static";
import { StaticRouter } from "react-router-dom";
import { SWRConfig } from "swr";
import { AppShell } from "./app/App";
import { swrConfig } from "./lib/swr";

// A fresh cache per render: swr's default one is shared by the whole process.
function cacheWith(failed) {
  return () =>
    new Map(
      Object.entries(failed).map(([key, status]) => [
        key,
        { error: Object.assign(new Error(`HTTP ${status}`), { status }) },
      ]),
    );
}

export async function render(url, { fallback = {}, errors: failed = {} } = {}) {
  const errors = [];
  const app = (
    <StrictMode>
      <SWRConfig
        value={{ ...swrConfig, provider: cacheWith(failed), fallback }}
      >
        <StaticRouter location={url} basename={import.meta.env.BASE_URL}>
          <AppShell />
        </StaticRouter>
      </SWRConfig>
    </StrictMode>
  );

  const { prelude } = await prerender(app, {
    // React moves a Suspense boundary bigger than 12.8 KB (the About page) out
    // of line and finishes it with an inline `$RC` script; the CSP forbids
    // inline scripts and the boundary would be hidden until it ran.
    progressiveChunkSize: Infinity,
    onError: (error) => {
      errors.push(error);
    },
  });
  const html = withoutResourceHints(await new Response(prelude).text());
  if (errors.length > 0) {
    throw new Error(`render(${url}) failed: ${describe(errors[0])}`, {
      cause: errors[0],
    });
  }
  return { html };
}

// React hoists a `<link rel="preload" as="image">` for the hero photo to the
// start of its output. The page's own hint already sits in the <head>
// (src/seo/head.ts, PERF-01: same srcset and sizes), so the copy inside #root
// would only be a second tag in the body.
const LEADING_PRELOADS = /^(?:<link\b[^>]*\brel="preload"[^>]*>)+/;
export const withoutResourceHints = (html) =>
  html.replace(LEADING_PRELOADS, "");

function describe(error) {
  return error instanceof Error ? error.message : String(error);
}
