// translate(locale, key, vars): the one lookup for interface text (T-12).
//
// Pure: no React, no DOM, no browser globals. The client hooks
// (src/i18n/index.js) and the server (SEO-01 snapshot, PERF-03 SSR) call the
// same function, so both render the same words.
//
// Lookup: the locale's dictionary, then EN (DEFAULT_LOCALE), then the key
// itself (with a one-time console warning in development). An empty string
// counts as missing, so an untranslated TR value shows the EN text instead
// of a blank. Placeholders are `{name}`; a placeholder without a value is
// left as it is (the contact messages render `{emailMe}` as a link).
import { DEFAULT_LOCALE, LOCALES } from "../seo/site.js";
import en from "./en.js";
import tr from "./tr.js";

export const DICTIONARIES = Object.freeze({ en, tr });

const DEV = Boolean(import.meta.env?.DEV);
const warned = new Set();

function warnMissing(key) {
  if (!DEV || warned.has(key)) return;
  warned.add(key);
  console.warn(`i18n: missing translation key "${key}"`);
}

function lookup(locale, key) {
  const value = DICTIONARIES[locale]?.[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

// True when `locale` has its own non-empty text for `key` (no EN fallback).
export function hasTranslation(locale, key) {
  return (
    Object.hasOwn(DICTIONARIES, locale) && lookup(locale, key) !== undefined
  );
}

// interpolate("© {year} Cengizhan Köse", { year: 2026 }) -> "© 2026 ..."
export function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(vars, name) && vars[name] !== undefined && vars[name] !== null
      ? String(vars[name])
      : match,
  );
}

export function translate(locale, key, vars) {
  const lang = LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  const value = lookup(lang, key) ?? lookup(DEFAULT_LOCALE, key);
  if (value === undefined) {
    warnMissing(key);
    return key;
  }
  return interpolate(value, vars);
}

export default translate;
