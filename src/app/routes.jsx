import { useEffect, useRef, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import { Home } from "../pages/home";
import { Portfolio } from "../pages/portfolio";
import { ContactUs } from "../pages/contact";
import { About } from "../pages/about";
import { Socialicons } from "../components/socialicons";
import BlogHome from "../pages/blog/BlogHome";
import BlogPost from "../pages/blog/BlogPost";
import { NotFound } from "../pages/notfound";
import { matchRoute } from "../seo/routes.js";

// Renders the page only where src/seo/routes.js has the route live (T-11,
// T-12), so the client shows NotFound exactly where the server answers 404:
// a language that is not open yet (/tr/blog until SEO-11 Adım B), a slug the
// publish tool would never write, or a case variant such as /About (React
// Router matches case-insensitively, the route table does not).
function Live({ children }) {
  const route = matchRoute(useLocation().pathname);
  return route.type === "notfound" ? <NotFound /> : children;
}

// The page table. Every path must be known to src/seo/routes.js with all
// languages open (tests/server/seo/routes.test.ts), so the server and the
// client agree on what exists.
const PAGE_ROUTES = [
  { path: "/", Page: Home },
  { path: "/about", Page: About },
  { path: "/portfolio", Page: Portfolio },
  { path: "/contact", Page: ContactUs },
  { path: "/blog", Page: BlogHome },
  { path: "/blog/:slug", Page: BlogPost },
  // SEO-11 Adım A: the TR post's own path (the 301 target) and, gated until
  // the TR pages open, the TR blog list. FE-14 (W4) turns this list into the
  // language x page table.
  { path: "/tr/blog", Page: BlogHome },
  { path: "/tr/blog/:slug", Page: BlogPost },
];

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
        {PAGE_ROUTES.map(({ path, Page }) => (
          <Route
            key={path}
            path={path}
            element={
              <Live>
                <Page />
              </Live>
            }
          />
        ))}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

// Page landmarks (FE-10/DSG-14): one <main> per page, the skip link's and
// route-change focus target, and the social strip as a named <aside>.
function AppRoutes() {
  const mainRef = useRef(null);

  return (
    <div className="s_c">
      <main id="main" tabIndex={-1} ref={mainRef}>
        <AnimatedRoutes focusTargetRef={mainRef} />
      </main>
      <aside aria-label="Social links">
        <Socialicons />
      </aside>
    </div>
  );
}

export default AppRoutes;
