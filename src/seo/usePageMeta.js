// Client-side head updater (T-03). Takes getPageMeta()'s output and updates
// the existing <head> in place: <title>, meta description, meta robots and
// <html lang>. Tags printed by index.html or, later, by the server (SEO-01)
// are reused rather than duplicated, so every route keeps exactly one of each.
// Managed elements carry a data-seo attribute.
//
// No head-manager library and no React 19 <title>/<meta> hoisting: hoisting
// does not dedupe against server-injected tags and has no <html lang> support.
import { useEffect } from "react";

const MARK = "data-seo";

function mark(element) {
  if (!element.hasAttribute(MARK)) element.setAttribute(MARK, "");
}

// Keeps the first element that matches, removes any duplicates and returns it.
function single(selector) {
  const [first, ...rest] = document.head.querySelectorAll(selector);
  for (const extra of rest) extra.remove();
  return first ?? null;
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
  const selector = `meta[${attribute}="${key}"]`;
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

// Writes one getPageMeta() result to the document.
export function applyPageMeta(meta) {
  if (typeof document === "undefined" || !meta) return;
  setTitle(meta.title);
  upsertMeta("name", "description", meta.description);
  upsertMeta("name", "robots", meta.robots);
  setHtmlLang(meta.lang);
}

// usePageMeta(getPageMeta(route, route.locale, data)); call it before any
// early return so loading and error states update the head too.
export function usePageMeta(meta) {
  const title = meta?.title;
  const description = meta?.description;
  const robots = meta?.robots;
  const lang = meta?.lang;

  useEffect(() => {
    applyPageMeta({ title, description, robots, lang });
  }, [title, description, robots, lang]);
}

export default usePageMeta;
