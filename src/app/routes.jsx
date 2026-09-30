import { useEffect, useRef, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import { Socialicons } from "../components/socialicons";
import { NotFound } from "../pages/notfound";
import { useT, useUiLocale } from "../i18n";
import { pageRoutes } from "./pageRoutes";

// The site shell: landmarks, the page transition and route-change focus.
// The page table (every page x every language, gated by LIVE) lives in
// ./pageRoutes.jsx (FE-14); anything it does not match renders NotFound.

function AnimatedRoutes({ focusTargetRef }) {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);

  // Only a new pathname runs the fade: the old page fades out, and the new one
  // mounts when that animation ends. A hash or search change on the same page
  // renders in place. The stage is derived during render (no setState in an
  // effect).
  const isLeaving = location.pathname !== displayLocation.pathname;
  if (!isLeaving && location !== displayLocation) {
    setDisplayLocation(location);
  }
  const transitionStage = isLeaving ? "fadeOut" : "fadeIn";

  // FE-10: once the new page is on screen, move focus to <main> so keyboard
  // and screen reader users continue from the top of the new content. The
  // ref starts at the first pathname, so the initial load keeps focus where
  // the browser put it (also under StrictMode's double effect run).
  const shownPathname = displayLocation.pathname;
  const focusedPathname = useRef(shownPathname);
  useEffect(() => {
    if (focusedPathname.current === shownPathname) return;
    focusedPathname.current = shownPathname;
    focusTargetRef.current?.focus({ preventScroll: true });
  }, [shownPathname, focusTargetRef]);

  return (
    <div
      className={`page-transition ${transitionStage}`}
      onAnimationEnd={(event) => {
        // Ignore animations that bubble up from the page content.
        if (event.target !== event.currentTarget) return;
        if (isLeaving) {
          setDisplayLocation(location);
          window.scrollTo(0, 0);
        }
      }}
    >
      <Routes location={displayLocation}>
        {pageRoutes()}
        <Route path="*" element={<NotFound />} />
      </Routes>
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
    <div className="s_c">
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
