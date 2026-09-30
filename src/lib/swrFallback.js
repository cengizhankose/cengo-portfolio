// The server's first data for swr (T-04, T-06 Aşama 1, SEO-01).
//
// The server writes the data of the page it renders into the HTML as a JSON
// block (`<script id="__SEO_DATA__" type="application/json">`, see
// src/seo/inject.ts). The block is a plain map from swr key to value, where a
// key is exactly the API URL the page would fetch (src/lib/swr.js):
//
//   { "/api/posts?lang=en": [ ...cards ],
//     "/api/posts?lang=tr&missingIn=en": [ ...cards ] }      the /blog index
//   { "/api/posts/<slug>": { ...post } }                     a post page
//
// src/seo/readSeoData.js reads the block in the browser and src/main.jsx hands
// toSWRFallback() of it to <SWRConfig fallback>, so the blog hooks find their
// data on the first render and skip the request and the "Loading..." state.
// PERF-03 (T-06 Aşama 2) sends the same map from the real server render.
//
// Pure ESM: no React, no swr import, no DOM; the server and the client both
// import it.
import { LIVE } from "../seo/routes.js";
import { LOCALES } from "../seo/site.js";
import { isPostKey, isPostsKey, postsKey } from "./swr.js";

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// blogIndexLists('en') -> [{ key, lang, missingIn? }, ...]
// The lists one blog index shows (T-12): the page language's posts, then the
// posts of every other language open for posts that have no translation in
// the page language. Same keys and order as blogIndexKeys() in src/lib/swr.js
// (a test keeps them equal); the server needs the query parameters behind each
// key, the client only needs the keys. `live` is the route table's LIVE by
// default; tests pass ALL_LIVE.
export function blogIndexLists(locale, live = LIVE) {
  const others = LOCALES.filter(
    (lang) => lang !== locale && live.post.includes(lang),
  );
  return [
    { key: postsKey(locale), lang: locale },
    ...others.map((lang) => ({
      key: postsKey(lang, { missingIn: locale }),
      lang,
      missingIn: locale,
    })),
  ];
}

// toSWRFallback(readSeoData()) -> the `fallback` map for <SWRConfig>.
// Only entries the blog hooks can use get through: a blog list key with an
// array, a post key with an object. Anything else in the block (a stale
// format, an edited page, a key such as "__proto__") is dropped, so a bad
// block costs the first request's head start and never breaks the page.
export function toSWRFallback(data) {
  if (!isRecord(data)) return {};
  const fallback = {};
  for (const [key, value] of Object.entries(data)) {
    const usable =
      (isPostsKey(key) && Array.isArray(value)) ||
      (isPostKey(key) && isRecord(value));
    if (usable) fallback[key] = value;
  }
  return fallback;
}
