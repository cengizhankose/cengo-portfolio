import { useEffect, useRef, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import { ErrorBoundary } from "../components/ErrorBoundary";
import { Socialicons } from "../components/socialicons";
import { NotFound } from "../pages/notfound";
import { useT, useUiLocale } from "../i18n";
import { usePageViewTracking } from "../lib/analytics/usePageViewTracking.js";
import { pageRoutes } from "./pageRoutes";

// The site shell: landmarks, the page change, route-change scroll and focus,
// the page view and the route error boundary (FE-03).
// The page table (every page x every language, gated by LIVE) lives in
// ./pageRoutes.jsx (FE-14); anything it does not match renders NotFound.

// A page change is one commit (PERF-13, FE-17): the new route is rendered the
// moment the location changes, so its data request and its chunk start at
// once. Nothing waits for an animation and no state mirrors the location.
//   - The wrapper is keyed by the pathname: a new path mounts a fresh page
//     (which plays the short entry fade in App.css); a hash or search change
//     and a click on the link of the page you are on keep the same node.
//   - PERF-07: the page the visitor lands on is not faded in. Its content
//     (the hero photo, the LCP element) is drawn opaque in the first frame;
//     the fade starts with the first pathname change and stays for every
//     later one, also back on the landing path.
//   - One effect, keyed on the pathname, does the scroll and the focus: the
//     page starts at the top (a hash on the new URL is the browser's and the
//     page's to handle) and focus moves to <main> so keyboard and screen
//     reader users continue from the top of the new content (FE-10). The
//     initial load does neither: the browser keeps its scroll position and
//     focus, also under StrictMode's double effect run.
//   - The page view (ANL-07) is sent after this commit by the hook.
function AnimatedRoutes({ focusTargetRef }) {
  const { pathname, hash } = useLocation();
  usePageViewTracking();

  // Derived while rendering (no setState in an effect): true for good once
  // the pathname has changed from the one the visitor landed on.
  const [landingPathname] = useState(pathname);
  const [hasNavigated, setHasNavigated] = useState(false);
  if (!hasNavigated && pathname !== landingPathname) {
    setHasNavigated(true);
  }

  // `hash` is a dependency only so the effect reads the hash of the
  // location it runs for; a hash-only change returns at the first line.
  const handledPathname = useRef(pathname);
  useEffect(() => {
    if (handledPathname.current === pathname) return;
    handledPathname.current = pathname;
    if (!hash) window.scrollTo(0, 0);
    focusTargetRef.current?.focus({ preventScroll: true });
  }, [pathname, hash, focusTargetRef]);

  return (
    <div
      key={pathname}
      data-route={pathname}
      className={hasNavigated ? "page-enter" : undefined}
    >
      {/* FE-03: a page that throws (or whose chunk fails to load) falls back
          to the error screen here, inside <main>; the header and menu stay.
          The keyed wrapper remounts the boundary with the page, so the next
          page starts clean. */}
      <ErrorBoundary>
        <Routes>
          {pageRoutes()}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </div>
  );
}

// Page landmarks (FE-10/DSG-14): one <main> per page, the skip link's and
// route-change focus target, and the social strip as a named <aside>. The
// strip is interface chrome: it speaks the interface language (DSG-19
// uiLang), which differs from <html lang> on a TR post before the TR pages
// open.
function AppRoutes() {
  const mainRef = useRef(null);
  const uiLocale = useUiLocale();
  const t = useT();

  return (
    <div className="page-shell">
      <main id="main" tabIndex={-1} ref={mainRef}>
        <AnimatedRoutes focusTargetRef={mainRef} />
      </main>
      <aside aria-label={t("social.label")} lang={uiLocale}>
        <Socialicons followLabel={t("social.follow")} />
      </aside>
    </div>
  );
}

export default AppRoutes;
