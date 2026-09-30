// React hooks of the i18n layer (T-12, FE-14).
//
// The language comes from the URL prefix only (src/seo/routes.js): not from
// the browser's language header or setting, a cookie or storage, so the
// server and the client always agree and nothing redirects automatically.
//
//   useRoute()      matchRoute(pathname), memoised per pathname
//   useLocale()     the URL's language ('en' for /about, 'tr' for /tr/...)
//   useUiLocale()   the language the interface text is served in: the URL's
//                   language once its static pages are live (LIVE.static),
//                   DEFAULT_LOCALE before that. Differs from useLocale() only
//                   on a TR post while the TR pages are closed (SEO-11 Adım A:
//                   Turkish article, English chrome linking to English pages;
//                   DSG-19's "uiLang").
//   useT(locale?)   t(key, vars) in useUiLocale() (or in `locale`, e.g. a
//                   post's own language for text inside <article lang>)
//   useLocalePath() lp('/about') -> '/about' or '/tr/about' for internal links
//                   to static pages (never to a page that is still a 404)
//   useContent()    getContent(useLocale()): the page content of the URL's
//                   language, EN where a TR field is still missing
//
// Components rendered outside a router (a bare <Themetoggle /> in a test)
// take their text as props instead of calling these hooks.
import { useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { getContent } from "../content/index.js";
import { localePath, matchRoute, staticLocale } from "./locales.js";
import { translate } from "./translate.js";

export * from "./locales.js";
export {
  DICTIONARIES,
  hasTranslation,
  interpolate,
  translate,
} from "./translate.js";

export function useRoute() {
  const { pathname } = useLocation();
  return useMemo(() => matchRoute(pathname), [pathname]);
}

export function useLocale() {
  return useRoute().locale;
}

export function useUiLocale() {
  return staticLocale(useLocale());
}

export function useT(locale) {
  const uiLocale = useUiLocale();
  const lang = locale ?? uiLocale;
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}

export function useLocalePath() {
  const uiLocale = useUiLocale();
  return useCallback((path) => localePath(uiLocale, path), [uiLocale]);
}

export function useContent() {
  return getContent(useLocale());
}
