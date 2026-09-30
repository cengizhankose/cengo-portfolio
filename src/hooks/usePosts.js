// Blog data hooks on swr (T-04, FE-12, ANL-15, DSG-20).
//
//   usePosts(locale)     the page language's post list (/api/posts?lang=)
//   useBlogIndex(locale) both /blog groups (T-12): usePosts(locale) plus the
//                        other language's untranslated posts, one status
//   usePost(slug)        one post (/api/posts/<slug>)
//   preloadPost(slug), preloadPosts(locale)
//                        start a request before the page mounts (PERF-14)
//   BlogDataScope        gives a blog page its own cache when it renders
//                        outside the app's <SWRConfig>
//
// Status is derived in one place (blogStatus): 'loading' | 'success' |
// 'error' | 'notfound'. Every key has its own state, so a late answer for an
// old slug lands in that slug's cache entry and never on the new page.
import { createElement, useEffect, useRef, useState } from "react";
import useSWR, { SWRConfig, preload, useSWRConfig } from "swr";
import { track } from "../lib/analytics";
import {
  blogFetcher,
  blogIndexKeys,
  errorStatus,
  postKey,
  postsKey,
  shouldRetry,
  swrConfig,
} from "../lib/swr.js";

const hasData = (response) => response.data !== undefined;

// blogStatus({ data, error }, { notFound }) -> status
//   notFound: an API 404 means "this post does not exist" (post pages only)
//   data wins over a later revalidation error: what is on screen stays.
export function blogStatus({ data, error }, { notFound = false } = {}) {
  if (notFound && error?.status === 404) return "notfound";
  if (data !== undefined) return "success";
  if (error) return "error";
  return "loading";
}

// error_occurred { scope: 'blog_api', endpoint, status } (ANL-15), once per
// view while the page is on screen: swr's retries, and a "Try again" that
// fails again, do not send it twice. `viewKey` names the view: a post's swr
// key, or both list keys of a blog index (one /blog view is one event, however
// many of its lists fail). A missing post (404) is not an error: it is a
// not-found page (ANL-05/07 page_view).
function useErrorReport(viewKey, error, endpoint) {
  const reported = useRef(new Set());
  useEffect(() => {
    if (!viewKey || !error) return;
    if (endpoint === "post" && error.status === 404) return;
    if (reported.current.has(viewKey)) return;
    reported.current.add(viewKey);
    track("error_occurred", {
      scope: "blog_api",
      endpoint,
      status: errorStatus(error),
    });
  }, [viewKey, error, endpoint]);
}

// useSWR for one blog key with the blog fetcher; the caller reports errors
// (useErrorReport), so a view with several keys can report once.
function useBlogSWR(key) {
  const { fallback } = useSWRConfig();
  // PERF-14 / T-06: a key the server already sent (SWRConfig fallback) is
  // shown as it is and not fetched again on mount.
  const prefilled = Boolean(key && fallback && Object.hasOwn(fallback, key));
  const response = useSWR(key, blogFetcher, {
    shouldRetryOnError: shouldRetry,
    ...(prefilled ? { revalidateOnMount: false } : null),
  });
  return response;
}

// usePosts('en') -> { posts, error, status, mutate } for /api/posts?lang=en.
export function usePosts(locale) {
  const key = postsKey(locale);
  const response = useBlogSWR(key);
  const { data, error } = response;
  useErrorReport(key, error, "list");
  return {
    posts: data,
    error,
    status: blogStatus({ data, error }),
    mutate: response.mutate,
  };
}

// Posts from both lists, API order, each once (the second list never repeats
// a post of the first on the real API; the check keeps a pair from showing
// twice whatever the lists contain).
function mergePosts(lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const post of list ?? []) {
      const id = post?.id ?? post?.slug;
      if (id !== undefined && seen.has(id)) continue;
      if (id !== undefined) seen.add(id);
      out.push(post);
    }
  }
  return out;
}

// useBlogIndex('en') -> { posts, status, error, retry, otherError }
// Both lists must arrive before the page leaves 'loading', so "No posts yet"
// never flashes while the other language's posts are still on their way.
//   - the page language's list fails: the page is in 'error';
//   - only the other-language group fails: the page's own posts still show
//     ('success') and `otherError` is that group's error, for an inline
//     state where the group would be; with no own posts to show, it is the
//     page's 'error' (an empty list next to a failure is not "No posts yet").
// retry() refetches only what failed.
export function useBlogIndex(locale) {
  const [ownKey, otherKey = null] = blogIndexKeys(locale);
  const own = useBlogSWR(ownKey);
  const other = useBlogSWR(otherKey);

  const ownReady = hasData(own);
  const otherReady = otherKey === null || hasData(other);
  const error = own.error ?? other.error;
  // ANL-15 criterion 1: one list event per /blog view. When the API is down
  // both lists fail with the same status; counting them apart would make a
  // full outage weigh twice a partial one.
  useErrorReport([ownKey, otherKey].filter(Boolean).join("|"), error, "list");

  const ownFailed = !ownReady && Boolean(own.error);
  const otherFailed = !otherReady && Boolean(other.error);

  let status = "loading";
  let otherError = null;
  if (ownFailed) status = "error";
  else if (ownReady && otherReady) status = "success";
  else if (ownReady && otherFailed) {
    if (own.data.length > 0) {
      status = "success";
      otherError = other.error;
    } else {
      status = "error";
    }
  }

  const retry = () => {
    if (!ownReady) own.mutate();
    if (!otherReady) other.mutate();
  };

  return {
    posts:
      status === "success"
        ? mergePosts([own.data, otherReady ? other.data : []])
        : [],
    status,
    error: ownFailed ? own.error : error,
    retry,
    otherError,
  };
}

// usePost('hello') -> { post, error, status, mutate }; status 'notfound' on
// an API 404 (noindex NotFound page), 'error' on anything else.
export function usePost(slug) {
  const key = postKey(slug);
  const response = useBlogSWR(key);
  const { data, error } = response;
  useErrorReport(key, error, "post");
  return {
    post: data,
    error,
    status: blogStatus({ data, error }, { notFound: true }),
    mutate: response.mutate,
  };
}

// prefetchKey(key, { cache, mutate, fallback }): starts the request for
// `key` now, so a page that mounts before it resolves reuses it (swr
// preload), and one that mounts after it finds the data in the cache and
// never shows "Loading..." (the answer is written to `cache` through
// `mutate`; all three come from the app's <SWRConfig>). Does nothing when
// the cache or the server's fallback already has the key. A failed preload
// stays silent here; the page reports and retries it when it opens.
const inFlight = new Set();

export function prefetchKey(key, { cache, mutate, fallback } = {}) {
  if (!key || inFlight.has(key)) return undefined;
  if (cache?.get(key)?.data !== undefined) return undefined;
  if (fallback && Object.hasOwn(fallback, key)) return undefined;
  const request = preload(key, blogFetcher);
  if (!request || typeof request.then !== "function") return undefined;
  inFlight.add(key);
  request
    .then(
      (data) => {
        if (mutate && cache?.get(key)?.data === undefined) {
          mutate(key, data, { revalidate: false });
        }
      },
      () => {},
    )
    .finally(() => inFlight.delete(key));
  return request;
}

export const preloadPost = (slug, options) =>
  prefetchKey(postKey(slug), options);

export function preloadPosts(locale, options) {
  for (const key of blogIndexKeys(locale)) prefetchKey(key, options);
}

// swr's default cache is module-global: every render in the process would
// share it (tests in one file, a server render without a provider). A blog
// page that finds no app provider above it opens its own cache for as long
// as it is mounted. Under the app's <SWRConfig> (src/main.jsx) this is a
// pass-through, and all pages share the app cache.
export function BlogDataScope({ children }) {
  const { cache } = useSWRConfig();
  const [scoped] = useState(() => ({
    ...swrConfig,
    provider: () => new Map(),
  }));
  if (cache !== SWRConfig.defaultValue.cache) return children;
  return createElement(SWRConfig, { value: scoped }, children);
}
