// Blog data layer settings (T-04, FE-12, PERF-14, ANL-15).
//
// Pure ESM: no React and no swr import, so the server (SEO-01's
// __SEO_DATA__ fallback in src/lib/swrFallback.js, W7) can build the same
// keys the client asks for. The hooks live in src/hooks/usePosts.js, the
// intent preload in src/lib/prefetch.js.
//
// Keys are the API paths themselves (T-04): the key of a request is exactly
// the URL getJson() fetches, so an SSR fallback entry, an swr cache entry and
// a network request always name the same thing.
//   list:  /api/posts?lang=en                (posts written in English)
//          /api/posts?lang=tr&missingIn=en   (Turkish posts without an EN
//                                            translation, T-12 second group)
//   post:  /api/posts/<slug>
import { getJson } from "./api.js";
import { LIVE } from "../seo/routes.js";
import { LOCALES } from "../seo/site.js";

export const POSTS_PATH = "/api/posts";

// postsKey('en') -> '/api/posts?lang=en'
// postsKey('tr', { missingIn: 'en' }) -> '/api/posts?lang=tr&missingIn=en'
export function postsKey(lang, { missingIn } = {}) {
  const params = new URLSearchParams({ lang });
  if (missingIn) params.set("missingIn", missingIn);
  return `${POSTS_PATH}?${params}`;
}

// postKey('hello-world') -> '/api/posts/hello-world'; null without a slug
// (swr skips a null key).
export function postKey(slug) {
  if (typeof slug !== "string" || slug === "") return null;
  return `${POSTS_PATH}/${encodeURIComponent(slug)}`;
}

// The two lists one blog index shows (T-12): the page language's posts, and
// the posts of every other language whose posts are live that have no
// translation in the page language. Order is the display order.
export function blogIndexKeys(locale) {
  const others = LOCALES.filter(
    (lang) => lang !== locale && LIVE.post.includes(lang),
  );
  return [
    postsKey(locale),
    ...others.map((lang) => postsKey(lang, { missingIn: locale })),
  ];
}

export const isPostsKey = (key) =>
  key === POSTS_PATH || String(key).startsWith(`${POSTS_PATH}?`);
export const isPostKey = (key) => String(key).startsWith(`${POSTS_PATH}/`);

// The API answered 2xx, but not with the shape the page can render: a list
// that is not an array, a post that is not an object, or a body that is not
// JSON. ANL-15 reports it as status 'bad_shape'.
export class UnexpectedPayloadError extends Error {
  constructor(message = "Unexpected payload") {
    super(message);
    this.name = "UnexpectedPayloadError";
    this.status = "bad_shape";
  }
}

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// The swr fetcher (FE-03, ANL-15): getJson() already rejects on a non-2xx
// answer (ApiError with the HTTP status) and on a network failure; this adds
// the shape check, so `posts.map` can never meet an error object again.
export async function blogFetcher(key) {
  let data;
  try {
    data = await getJson(key);
  } catch (error) {
    // res.json() on a 2xx body that is not JSON.
    if (error instanceof SyntaxError) throw new UnexpectedPayloadError();
    throw error;
  }
  if (isPostsKey(key) && !Array.isArray(data)) {
    throw new UnexpectedPayloadError();
  }
  if (isPostKey(key) && !isRecord(data)) {
    throw new UnexpectedPayloadError();
  }
  return data;
}

// error_occurred.status (ANL-15, events.js CODE pattern): the HTTP status as
// a string ('500'), 'bad_shape' for an unusable 2xx body and 'network' when
// no answer arrived at all.
export function errorStatus(error) {
  const status = error?.status;
  if (typeof status === "number" && Number.isFinite(status)) {
    return String(status);
  }
  if (status === "bad_shape") return "bad_shape";
  return "network";
}

// Only failures that can pass on their own are retried: no answer, or a 5xx.
// A 4xx (404: the post does not exist) and a bad payload stay as they are.
export function shouldRetry(error) {
  const status = error?.status;
  if (status === "bad_shape") return false;
  if (typeof status === "number") return status >= 500;
  return true;
}

export const RETRY_LIMIT = 2;
export const RETRY_DELAY_MS = 2000;

// swr onErrorRetry: at most RETRY_LIMIT retries, RETRY_DELAY_MS apart. The
// error state stays on screen while they run (DSG-20 risk note).
export function onErrorRetry(error, key, config, revalidate, options) {
  if (!shouldRetry(error) || options.retryCount > RETRY_LIMIT) return;
  setTimeout(() => revalidate(options), RETRY_DELAY_MS);
}

// Shared <SWRConfig> value (FE-12 step 2). src/main.jsx adds the cache
// provider (and, from W7, the SSR `fallback`); tests add
// `provider: () => new Map()` so every test has its own cache.
//   dedupingInterval: one request per key for 5 minutes, so /blog -> post ->
//                     /blog asks the list once (a reload empties the cache);
//   revalidateOnFocus: a tab switch does not refetch the post being read;
//   keepPreviousData: a new slug starts empty (loading), never showing the
//                     previous post.
export const swrConfig = Object.freeze({
  fetcher: blogFetcher,
  dedupingInterval: 300_000,
  revalidateOnFocus: false,
  keepPreviousData: false,
  onErrorRetry,
});
