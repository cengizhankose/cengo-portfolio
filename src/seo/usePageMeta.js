// Client-side head updater (T-03). Takes getPageMeta()'s output and updates
// the existing <head> in place: <title>, meta description, meta robots,
// <html lang>, the hreflang alternates (SEO-11), the canonical link (SEO-04),
// the Open Graph and Twitter tags (SEO-06) and the JSON-LD block (SEO-07).
// Tags printed by index.html or, later, by the server (SEO-01) are reused
// rather than duplicated, so every route keeps exactly one of each. Managed
// elements carry a data-seo attribute. A field the page does not have (a 404,
// a noindex page) removes the tags the previous page left behind.
//
// No head-manager library and no React 19 <title>/<meta> hoisting: hoisting
// does not dedupe against server-injected tags and has no <html lang> support.
import { useEffect } from "react";
import { serializeJsonLd } from "./jsonld.js";
import { socialTags } from "./pages.js";

const MARK = "data-seo";
const ALTERNATE_SELECTOR = 'link[rel="alternate"][hreflang]';
const CANONICAL_SELECTOR = 'link[rel="canonical"]';
// The tags socialTags() prints: Open Graph, article:* and Twitter cards. The
// whole namespace is managed here, so a stale tag can never survive a route
// change.
const SOCIAL_SELECTOR =
  'meta[property^="og:"], meta[property^="article:"], meta[name^="twitter:"]';
const JSON_LD_SELECTOR = 'script[type="application/ld+json"]';
const JSON_LD_ID = "ld-json";

function mark(element) {
  if (!element.hasAttribute(MARK)) element.setAttribute(MARK, "");
}

// Keeps the first element that matches, removes any duplicates and returns it.
function single(selector) {
  const [first, ...rest] = document.head.querySelectorAll(selector);
  for (const extra of rest) extra.remove();
  return first ?? null;
}

// Quotes a value for an attribute selector, so a key with `"` or `\` can
// never turn into a selector syntax error.
function attributeValue(value) {
  return `"${String(value).replace(/["\\]/g, "\\$&")}"`;
}

export function setTitle(title) {
  if (typeof title !== "string" || title === "") return;
  let element = single("title");
  if (!element) {
    element = document.createElement("title");
    document.head.appendChild(element);
  }
  if (element.textContent !== title) element.textContent = title;
  mark(element);
}

// upsertMeta('name', 'description', content): updates the tag, creates it
// when missing and removes it when `content` is empty.
export function upsertMeta(attribute, key, content) {
  const selector = `meta[${attribute}=${attributeValue(key)}]`;
  let element = single(selector);

  if (typeof content !== "string" || content === "") {
    element?.remove();
    return;
  }

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  if (element.getAttribute("content") !== content) {
    element.setAttribute("content", content);
  }
  mark(element);
}

export function setHtmlLang(lang) {
  if (typeof lang !== "string" || lang === "") return;
  const root = document.documentElement;
  if (root.lang !== lang) root.lang = lang;
}

function validAlternates(alternates) {
  if (!Array.isArray(alternates)) return [];
  return alternates.filter(
    (entry) =>
      typeof entry?.hreflang === "string" &&
      entry.hreflang !== "" &&
      typeof entry.href === "string" &&
      entry.href !== "",
  );
}

// setAlternates([{ hreflang, href }]): the head ends up with exactly these
// <link rel="alternate" hreflang> elements, in this order (SEO-11 step 5).
// An empty list removes them all (a page without a translation, a 404).
// Other rel="alternate" links (e.g. an RSS feed, no hreflang) are untouched.
export function setAlternates(alternates) {
  const wanted = validAlternates(alternates);
  const current = [...document.head.querySelectorAll(ALTERNATE_SELECTOR)];
  const same =
    current.length === wanted.length &&
    current.every(
      (element, index) =>
        element.getAttribute("hreflang") === wanted[index].hreflang &&
        element.getAttribute("href") === wanted[index].href,
    );
  if (same) {
    current.forEach(mark);
    return;
  }

  for (const element of current) element.remove();
  for (const { hreflang, href } of wanted) {
    const link = document.createElement("link");
    link.setAttribute("rel", "alternate");
    link.setAttribute("hreflang", hreflang);
    link.setAttribute("href", href);
    mark(link);
    document.head.appendChild(link);
  }
}

// setCanonical(href): the head ends up with exactly one canonical link. An
// empty value removes it (404 and noindex pages have none, SEO-04).
export function setCanonical(href) {
  let element = single(CANONICAL_SELECTOR);

  if (typeof href !== "string" || href === "") {
    element?.remove();
    return;
  }

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.appendChild(element);
  }
  if (element.getAttribute("href") !== href) element.setAttribute("href", href);
  mark(element);
}

function isSocialTag(tag) {
  return (
    (tag?.attribute === "property" || tag?.attribute === "name") &&
    typeof tag.key === "string" &&
    tag.key !== "" &&
    typeof tag.content === "string" &&
    tag.content !== ""
  );
}

// setSocialTags([{ attribute, key, content }]): the head ends up with exactly
// these og:*, article:* and twitter:* tags, in this order of creation. Tags of
// the same key are reused in place (og:locale:alternate can repeat), missing
// ones are created and every other tag of the namespace is removed. An empty
// list removes them all.
export function setSocialTags(tags) {
  const wanted = Array.isArray(tags) ? tags.filter(isSocialTag) : [];

  const pool = new Map();
  for (const element of document.head.querySelectorAll(SOCIAL_SELECTOR)) {
    const attribute = element.hasAttribute("property") ? "property" : "name";
    const id = `${attribute}|${element.getAttribute(attribute)}`;
    if (!pool.has(id)) pool.set(id, []);
    pool.get(id).push(element);
  }

  for (const { attribute, key, content } of wanted) {
    let element = pool.get(`${attribute}|${key}`)?.shift();
    if (!element) {
      element = document.createElement("meta");
      element.setAttribute(attribute, key);
      document.head.appendChild(element);
    }
    if (element.getAttribute("content") !== content) {
      element.setAttribute("content", content);
    }
    mark(element);
  }

  for (const leftovers of pool.values()) {
    for (const element of leftovers) element.remove();
  }
}

// setJsonLd(graph): the page ends up with exactly one
// <script type="application/ld+json" id="ld-json"> holding the serialised
// graph (SEO-07 step 5); no value removes it. A block printed by the server is
// found wherever it sits and reused, so a route change never adds a second one.
export function setJsonLd(data) {
  const [first, ...rest] = document.querySelectorAll(JSON_LD_SELECTOR);
  for (const extra of rest) extra.remove();

  if (data === undefined || data === null) {
    first?.remove();
    return;
  }

  const text = serializeJsonLd(data);
  let element = first;
  if (!element) {
    element = document.createElement("script");
    element.setAttribute("type", "application/ld+json");
    document.head.appendChild(element);
  }
  if (element.id !== JSON_LD_ID) element.id = JSON_LD_ID;
  if (element.textContent !== text) element.textContent = text;
  mark(element);
}

// Writes one getPageMeta() result to the document.
export function applyPageMeta(meta) {
  if (typeof document === "undefined" || !meta) return;
  setTitle(meta.title);
  upsertMeta("name", "description", meta.description);
  upsertMeta("name", "robots", meta.robots);
  setHtmlLang(meta.lang);
  setAlternates(meta.alternates);
  setCanonical(meta.canonical);
  setSocialTags(socialTags(meta));
  setJsonLd(meta.jsonLd);
}

// usePageMeta(getPageMeta(route, route.locale, data)); call it before any
// early return so loading and error states update the head too.
export function usePageMeta(meta) {
  const title = meta?.title;
  const description = meta?.description;
  const robots = meta?.robots;
  const lang = meta?.lang;
  const canonical = meta?.canonical;
  // New arrays and objects arrive on every render; their serialised forms are
  // the stable effect dependencies.
  const alternatesKey = JSON.stringify(validAlternates(meta?.alternates));
  const richKey = JSON.stringify([
    meta?.og ?? null,
    meta?.twitter ?? null,
    meta?.jsonLd ?? null,
  ]);

  useEffect(() => {
    const [og, twitter, jsonLd] = JSON.parse(richKey);
    applyPageMeta({
      title,
      description,
      robots,
      lang,
      alternates: JSON.parse(alternatesKey),
      canonical,
      og,
      twitter,
      jsonLd,
    });
  }, [title, description, robots, lang, canonical, alternatesKey, richKey]);
}

export default usePageMeta;
