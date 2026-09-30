// SPA page views (ANL-07): one `page_view` per page, sent after the page has
// rendered, with an explicit page_type / ui_locale / title derived from the
// URL, never from `document.title` (which the page sets in its own effect).
//
// Called once, from the route shell (src/app/routes.jsx). The shell renders
// the new route in the same commit as the navigation (PERF-13, FE-17), so
// `useLocation()` is the page on screen and this hook runs after that commit.
//
//   - Every page but a blog post is complete at the first render: the view is
//     sent at once.
//   - A blog post needs its data (title, language). The hook reads the same
//     swr entry BlogPost renders (postKey(slug)), so BlogPost itself is not
//     involved: it sends the view when the post arrives; an API 404 becomes a
//     `not_found` view (what BlogPost shows), any other failure a `blog_post`
//     view with the blog title (BlogPost reports the failure as
//     `error_occurred`). One view per visit to a path, however often the
//     entry revalidates.
//   - A post opened under the other language's prefix is redirected by
//     BlogPost to its own path (SEO-11); no view is sent for the URL that is
//     about to be replaced.
//   - A hash or search change on the same pathname is not a new page
//     (anchors, skip link): the view is keyed on the pathname, not on
//     location.key. Clicking the link of the page you are on is not one
//     either. Back to an earlier page is.
//
// The page context (page_type, ui_locale, content_language) is set in a
// layout effect, before any child's effect can send an event, so an event
// fired while a page mounts (not_found_viewed) carries this page's context,
// not the previous page's.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import useSWR from "swr";
import { displayLocale, getPageMeta } from "../../seo/pages.js";
import { LIVE, matchRoute } from "../../seo/routes.js";
import { postKey, shouldRetry } from "../swr.js";
import { setPageContext, trackPageview } from "./index.js";
import { getContentLanguage, getPageType, getUiLocale } from "./pageType.js";

// 'loading' | 'success' | 'notfound' | 'error', as usePosts.js blogStatus()
// derives it for a post page (kept here so usePosts.js stays out of the
// entry chunk).
function postStatus({ data, error }) {
  if (error?.status === 404) return "notfound";
  if (data !== undefined) return "success";
  if (error) return "error";
  return "loading";
}

// The swr entry of the open post, read through the app's <SWRConfig>: same
// key, same fetcher and same retry rule as BlogPost's own hook, so whichever
// of the two asks first is the one request (swr dedupes it) and both see the
// same data. It never asks again for a key that has data. Outside an
// <SWRConfig> there is no fetcher and nothing happens (BlogPost keeps its own
// cache then).
function useOpenPost(slug) {
  const { data, error } = useSWR(postKey(slug), {
    shouldRetryOnError: shouldRetry,
    revalidateIfStale: false,
  });
  return { data, error };
}

/**
 * The analytics context of a URL, before its data is known, plus the page
 * view once it is: { context, view }.
 *   context: { page_type, ui_locale, content_language } for setPageContext
 *            (content_language is null while a post has not arrived);
 *   view:    the trackPageview() fields, or null while the post is loading
 *            or about to be redirected.
 * `post` is { data, error } of the post's swr entry (ignored for other pages).
 */
export function describePage(pathname, post = {}) {
  // The live table, like <LiveGate>: a route whose language is not open yet
  // is what the visitor sees as NotFound.
  const route = matchRoute(pathname, LIVE);
  const uiLocale = getUiLocale(pathname);

  if (route.type !== "post") {
    const pageType =
      route.type === "notfound" ? "not_found" : getPageType(pathname);
    const contentLanguage = getContentLanguage(pageType, uiLocale);
    return {
      context: {
        page_type: pageType,
        ui_locale: uiLocale,
        content_language: contentLanguage,
      },
      view: {
        pageType,
        uiLocale,
        contentLanguage,
        title: getPageMeta(route, displayLocale(route), {}).title,
      },
    };
  }

  const status = postStatus(post);
  const base = { page_type: "blog_post", ui_locale: uiLocale };
  const loading = { context: { ...base, content_language: null }, view: null };

  if (status === "loading") return loading;

  if (status === "notfound") {
    return {
      context: {
        page_type: "not_found",
        ui_locale: uiLocale,
        content_language: uiLocale,
      },
      view: {
        pageType: "not_found",
        uiLocale,
        contentLanguage: uiLocale,
        title: getPageMeta(route, route.locale, { notFound: true }).title,
      },
    };
  }

  if (status === "success") {
    const lang = post.data?.lang;
    // BlogPost moves a post that lives under the other language's prefix to
    // its own path; that path gets the view.
    if (lang && lang !== route.locale && LIVE.post.includes(lang))
      return loading;
    const contentLanguage = getContentLanguage(
      "blog_post",
      uiLocale,
      post.data,
    );
    return {
      context: { ...base, content_language: contentLanguage },
      view: {
        pageType: "blog_post",
        postSlug: route.slug,
        uiLocale,
        contentLanguage,
        title: getPageMeta(route, route.locale, { post: post.data }).title,
      },
    };
  }

  // Network failure, 5xx or a payload the page cannot use: still a post URL,
  // with the blog's title (what BlogPost's meta says while it has no post).
  return {
    context: { ...base, content_language: "unknown" },
    view: {
      pageType: "blog_post",
      postSlug: route.slug,
      uiLocale,
      contentLanguage: "unknown",
      title: getPageMeta(route, route.locale, {}).title,
    },
  };
}

export function usePageViewTracking() {
  const { pathname, search } = useLocation();
  const slug = useMemo(() => {
    const route = matchRoute(pathname, LIVE);
    return route.type === "post" ? route.slug : null;
  }, [pathname]);
  const { data, error } = useOpenPost(slug);

  const { context, view } = useMemo(
    () => describePage(pathname, { data, error }),
    [pathname, data, error],
  );

  useLayoutEffect(() => {
    setPageContext(context);
  }, [context]);

  const sentFor = useRef(null);
  useEffect(() => {
    if (!view || sentFor.current === pathname) return;
    sentFor.current = pathname;
    trackPageview({ path: pathname, search, ...view });
  }, [view, pathname, search]);
}
