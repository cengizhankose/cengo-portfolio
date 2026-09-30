// Language constants and path helpers for the i18n layer (T-12, FE-14).
//
// Re-exports only: the values are defined once in src/seo (site.js: LOCALES,
// DEFAULT_LOCALE; routes.js: LOCALE_PREFIX, LIVE, matchRoute; pages.js:
// localePath, staticLocale, displayLocale). Nothing is redefined here, so the
// server's routing and the client's language logic cannot drift apart.
export { DEFAULT_LOCALE, LOCALES } from "../seo/site.js";
export { ALL_LIVE, LIVE, LOCALE_PREFIX, matchRoute } from "../seo/routes.js";
export { displayLocale, localePath, staticLocale } from "../seo/pages.js";
