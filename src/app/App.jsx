import { lazy, Suspense, useEffect } from "react";
import "../styles/layers.css";
import "../styles/bootstrap-subset.scss";
import { BrowserRouter as Router } from "react-router-dom";
import AppRoutes from "./routes";
import { IntentPrefetch } from "../hooks/useIntentPrefetch";
import Headermain from "../header";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { reloadForNewRelease } from "../components/routefallback/lazyPage.js";
import { useMediaQuery } from "../lib/useMediaQuery";

// T-14 (K-06a): the cursor ring exists only for a mouse-like pointer with
// "reduce motion" off. Touch/coarse pointers and reduced-motion users never
// download its chunk; if the answer changes in the session the ring mounts
// or unmounts (Cursor.jsx removes all of its listeners on unmount).
export const CURSOR_QUERY =
  "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

const Cursor = lazy(() => import("../components/Cursor"));

// A cursor chunk that fails to load (gone after a deploy, network) must not
// take the React root down with it: there is no error boundary above the gate,
// so the ring simply stays out.
const NoCursor = () => null;

// Its own component, so a media change re-renders only the gate. It stays
// outside <main> and the routes: nothing on the page depends on it.
function CursorGate() {
  const enabled = useMediaQuery(CURSOR_QUERY);
  if (!enabled) return null;
  return (
    <ErrorBoundary fallback={NoCursor}>
      <Suspense fallback={null}>
        <Cursor />
      </Suspense>
    </ErrorBoundary>
  );
}

// FE-05 step 4: the lazy imports that are not pages (the cursor chunk,
// mermaid, @emailjs/browser) name hashed files that are gone on the server
// after a deploy while a tab is still open. Vite reports such a failure as
// `vite:preloadError`; the tab reloads once (at most once a minute, the
// sessionStorage stamp of lazyPage.js) so it picks up the new release.
//   - The event is left alone (no preventDefault): Vite then rethrows and the
//     import() rejects like any failed import. Cancelling it would make
//     import() resolve to undefined, which lazyPage would count as a success
//     and clear the stamp the reload just set.
//   - The reload waits one task: a page chunk that fails has its own guard in
//     lazyPage.js, which handles the rejection (microtask) first and keeps
//     the Suspense fallback on screen; this listener then finds the stamp set
//     and does nothing. For every other import it is the only guard.
function useReloadOnStaleChunk() {
  useEffect(() => {
    const onPreloadError = () => {
      setTimeout(() => reloadForNewRelease(), 0);
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    return () =>
      window.removeEventListener("vite:preloadError", onPreloadError);
  }, []);
}

// PERF-03 (T-06 Aşama 2): everything inside the router, and nothing else. The
// router is chosen by the entry point: BrowserRouter in src/entry-client.jsx,
// StaticRouter in src/entry-server.jsx (the prerender and the blog render), so
// the same tree is drawn on the server and hydrated in the browser.
export function AppShell() {
  useReloadOnStaleChunk();
  return (
    <>
      {/* Scroll to top, focus and the page view on a page change all live in
          the route shell (routes.jsx): one place, one commit. */}
      <Headermain />
      <AppRoutes />
      <CursorGate />
    </>
  );
}

// What both entries draw inside their router: the shell and the blog intent
// preload (PERF-14), which renders nothing and only listens. One component, so
// the server and the browser build the same element tree; useId values depend
// on its shape and a mismatch would break hydration.
export function AppRoot() {
  return (
    <>
      <IntentPrefetch />
      <AppShell />
    </>
  );
}

// The whole app with the browser's router and without the intent preload: what
// the component tests render. The production entry (src/entry-client.jsx)
// builds the router itself and draws AppRoot.
export default function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <AppShell />
    </Router>
  );
}
