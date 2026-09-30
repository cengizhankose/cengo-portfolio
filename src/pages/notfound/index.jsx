// NotFound page (FE-16, SEO-02, SEO-08, DSG-20). Rendered for paths the
// route table does not know (the server answers them with 404 + noindex) and,
// as variant="post", by BlogPost when the slug is missing or a draft.
//
// Language: a missing post speaks the language of its URL (/tr/blog/... TR);
// any other unknown path the language whose pages are live for its prefix
// (EN under /tr until the TR pages open, SEO-11 Adım B). Links go to that
// language's home page and blog. Text: the notFound.* dictionary keys
// (src/i18n/{en,tr}/notFound.js). Layout: the shared StatusState (DSG-20);
// the .not-found class stays as this page's hook.
//
// Analytics (ANL-05): on mount, once, `not_found_viewed` with the coarse path
// group and the referrer host (./report.js). The page view itself comes from
// the route shell's hook, as page_type `not_found` (ANL-07), from a layout
// effect: it goes out before this page's effect, so `not_found_viewed` follows
// the page_view and carries this page's url, title and referrer. This page
// sends no page_view of its own.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { StatusState } from "../../components/statusstate";
import {
  displayLocale,
  localePath,
  staticLocale,
  useRoute,
  useT,
} from "../../i18n";
import { track } from "../../lib/analytics";
import { getPageMeta } from "../../seo/pages.js";
import { usePageMeta } from "../../seo/usePageMeta.js";
import { notFoundViewedProps } from "./report.js";

// variant: "page" | "post" (`kind`, the DSG-20 plan's name, is accepted too).
export function NotFound({ variant = "page", kind }) {
  const route = useRoute();
  const locale = displayLocale(route);
  const t = useT(locale);
  // Title "Page not found | …" / "Post not found | …" and robots noindex,
  // the same values the server wrote into the 404 shell.
  usePageMeta(getPageMeta(route, locale, { notFound: true }));

  // Once per mount: a new location key for the same path (clicking the
  // link of this page again) and StrictMode's second effect run are not
  // another visit.
  const { key: locationKey, pathname } = useLocation();
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    track("not_found_viewed", notFoundViewedProps(pathname, locationKey));
  }, [locationKey, pathname]);

  const isPost = (kind ?? variant) === "post";
  const key = isPost ? "post" : "page";
  const linkLocale = staticLocale(locale);
  const home = { to: localePath(linkLocale, "/"), label: t("notFound.home") };
  const blog = {
    to: localePath(linkLocale, "/blog"),
    label: t(isPost ? "notFound.backToBlog" : "notFound.blog"),
  };

  return (
    <StatusState
      className="not-found"
      lang={locale}
      title={t(`notFound.${key}.title`)}
      message={t(`notFound.${key}.text`)}
      actions={isPost ? [blog, home] : [home, blog]}
    />
  );
}

export default NotFound;
