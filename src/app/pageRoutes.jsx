// The page table (T-11, T-12, FE-14): every page once, mapped over every
// language. routes.jsx keeps only the shell (landmarks, transitions) and
// places these routes inside its <Routes>.
//
// Paths use the same segments in every language ('/about' <-> '/tr/about',
// '/blog/:slug' <-> '/tr/blog/:slug'). Which language is open for which kind
// of route is decided by LIVE in src/seo/routes.js, not here: LiveGate shows
// NotFound wherever matchRoute() says 'notfound' (a language that is not
// open yet, a slug the publish tool would never write, a case variant such
// as /About), exactly where the server answers 404. Opening the TR pages is
// the one-line LIVE change (SEO-11 Adım B); this table does not change.
//
// Code splitting (PERF-04, FE-05): Home, About, Portfolio and Contact are in
// the entry chunk (Home is the LCP page). BlogHome and BlogPost are lazy
// components made once here, so /blog and /tr/blog (and both post paths) use
// the same two chunks: no chunk per language. The markdown chain lives only in
// the BlogPost chunk (src/pages/blog/loaders.js names the pages; nothing
// else may import them statically). Each route element carries its own
// Suspense boundary, so a chunk that is still loading shows RouteFallback
// inside <main> and never blanks the header or the menu.
import { Suspense } from "react";
import { Route } from "react-router-dom";
import { Home } from "../pages/home";
import { Portfolio } from "../pages/portfolio";
import { ContactUs } from "../pages/contact";
import { About } from "../pages/about";
import { NotFound } from "../pages/notfound";
import { RouteFallback } from "../components/routefallback";
import { lazyPage } from "../components/routefallback/lazyPage.js";
import { loadBlogHome, loadBlogPost } from "../pages/blog/loaders.js";
import { LOCALES, localePath, useRoute } from "../i18n";

const BlogHome = lazyPage(loadBlogHome);
const BlogPost = lazyPage(loadBlogPost);

// Language-independent paths. Each must be known to src/seo/routes.js with
// every language open (tests/frontend/i18n/page-routes.test.jsx).
export const PAGE_ROUTES = Object.freeze([
  { path: "/", Page: Home },
  { path: "/about", Page: About },
  { path: "/portfolio", Page: Portfolio },
  { path: "/contact", Page: ContactUs },
  { path: "/blog", Page: BlogHome },
  { path: "/blog/:slug", Page: BlogPost },
]);

// PAGE_ROUTES x LOCALES: { key, locale, path ('/tr/about'), pagePath, Page }.
export const LOCALIZED_ROUTES = Object.freeze(
  LOCALES.flatMap((locale) =>
    PAGE_ROUTES.map(({ path, Page }) =>
      Object.freeze({
        key: `${locale}:${path}`,
        locale,
        path: localePath(locale, path),
        pagePath: path,
        Page,
      }),
    ),
  ),
);

export function LiveGate({ children }) {
  const route = useRoute();
  return route.type === "notfound" ? <NotFound /> : children;
}

// <Route> elements for <Routes> (React Router accepts only <Route> children,
// so this is a list, not a component).
export const pageRoutes = () =>
  LOCALIZED_ROUTES.map(({ key, path, Page }) => (
    <Route
      key={key}
      path={path}
      element={
        <LiveGate>
          <Suspense fallback={<RouteFallback />}>
            <Page />
          </Suspense>
        </LiveGate>
      }
    />
  ));
