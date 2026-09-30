// Page content per language (T-12, FE-14). Pure ESM: no React, no DOM, so
// the server can render the same content (SEO-01 snapshot, PERF-03 SSR).
// React components read it through useContent() (src/i18n/index.js).
import { DEFAULT_LOCALE, LOCALES } from "../seo/site.js";
import { deepFreeze, mergeContent } from "./define.js";
import en from "./en.js";
import tr from "./tr.js";

export { deepFreeze, mergeContent, SECTIONS } from "./define.js";
export * as shared from "./shared.js";

// The raw files of each language (TR without the EN fallback).
export const CONTENT = Object.freeze({ en, tr });

const merged = new Map();

// getContent('tr') -> the TR content with every missing TR field taken from
// EN (see mergeContent). Unknown locales get the EN content. The result is
// frozen and computed once per language.
export function getContent(locale) {
  const lang = LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  if (lang === DEFAULT_LOCALE) return CONTENT[DEFAULT_LOCALE];
  if (!merged.has(lang)) {
    merged.set(
      lang,
      deepFreeze(mergeContent(CONTENT[DEFAULT_LOCALE], CONTENT[lang])),
    );
  }
  return merged.get(lang);
}
