// Client-side head updater (T-03). Takes getPageMeta()'s output and updates
// the existing <head> in place: <title>, meta description, meta robots,
// <html lang> and the hreflang alternates (SEO-11). Tags printed by
// index.html or, later, by the server (SEO-01) are reused rather than
// duplicated, so every route keeps exactly one of each. Managed elements
// carry a data-seo attribute.
//
// No head-manager library and no React 19 <title>/<meta> hoisting: hoisting
// does not dedupe against server-injected tags and has no <html lang> support.
import { useEffect } from "react";

const MARK = "data-seo";
const ALTERNATE_SELECTOR = 'link[rel="alternate"][hreflang]';

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

// Writes one getPageMeta() result to the document.
export function applyPageMeta(meta) {
  if (typeof document === "undefined" || !meta) return;
  setTitle(meta.title);
  upsertMeta("name", "description", meta.description);
  upsertMeta("name", "robots", meta.robots);
  setHtmlLang(meta.lang);
  setAlternates(meta.alternates);
}

// usePageMeta(getPageMeta(route, route.locale, data)); call it before any
// early return so loading and error states update the head too.
export function usePageMeta(meta) {
  const title = meta?.title;
  const description = meta?.description;
  const robots = meta?.robots;
  const lang = meta?.lang;
  // A new array arrives on every render; its serialised form is the stable
  // effect dependency.
  const alternatesKey = JSON.stringify(validAlternates(meta?.alternates));

  useEffect(() => {
    applyPageMeta({
      title,
      description,
      robots,
      lang,
      alternates: JSON.parse(alternatesKey),
    });
  }, [title, description, robots, lang, alternatesKey]);
}

export default usePageMeta;
