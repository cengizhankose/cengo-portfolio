// Where the language switcher points (T-12, FE-14 step 8, DSG-19 step 6).
// Pure: the same answer on the server and in the browser.
import { SLUG_PATTERN } from "../../seo/routes.js";
import { displayLocale, localePath } from "../../seo/pages.js";

// The language the page is shown in: the URL's language for a page or a
// post, the fallback language of a 404 (displayLocale).
export function currentLanguage(route) {
  return route?.type === "notfound" ? displayLocale(route) : route.locale;
}

// switchTarget(route, 'tr', post) -> { href, exact }
//   static page: the same page in the other language (exact);
//   post:        its published translation in that language when there is
//                one (exact), else that language's blog index (not exact);
//   404:         that language's home page.
// `post` is the switcher's view of the open post ({ lang, slug,
// translations }); it only counts when it is the post of this URL.
export function switchTarget(route, locale, post = null) {
  if (route?.type === "static") {
    return { href: localePath(locale, route.path), exact: true };
  }
  if (route?.type === "post") {
    const own =
      post && post.slug === route.slug && post.lang === route.locale
        ? post
        : null;
    const translation = (own?.translations ?? []).find(
      (item) =>
        item?.lang === locale &&
        typeof item.slug === "string" &&
        SLUG_PATTERN.test(item.slug),
    );
    return translation
      ? { href: localePath(locale, `/blog/${translation.slug}`), exact: true }
      : { href: localePath(locale, "/blog"), exact: false };
  }
  return { href: localePath(locale, "/"), exact: true };
}
