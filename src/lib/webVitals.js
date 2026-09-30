// Field Web Vitals (ANL-06 + PERF-23, one implementation, web-vitals 5 API).
// Loaded only through the dynamic import in initAnalytics(), so web-vitals
// never lands in the entry chunk. Each metric becomes one
// `web_vital_reported` event: LCP, INP, CLS (+ FCP, TTFB for diagnosis).
//
// web-vitals measures the page that was loaded (the landing page); SPA
// navigations are not measured separately. page_type and ui_locale therefore
// describe the landing page; content_language comes from the page context.

import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { track } from "./analytics/index.js";

// Stop-gap page-type lookup for the landing page. W7-FE-route-shell replaces
// it with getPageType() from src/lib/analytics/pageType.js (planned there);
// the values must stay the PAGE_TYPES of events.js.
const STATIC_PAGE_TYPES = {
  "/": "home",
  "/about": "about",
  "/portfolio": "portfolio",
  "/contact": "contact",
  "/privacy": "privacy",
  "/blog": "blog_index",
};

function splitLocalePrefix(pathname) {
  if (pathname === "/tr" || pathname.startsWith("/tr/")) {
    return { locale: "tr", path: pathname.slice(3) || "/" };
  }
  return { locale: "en", path: pathname };
}

function landingPage(pathname) {
  const { locale, path } = splitLocalePrefix(pathname || "/");
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
  let pageType = STATIC_PAGE_TYPES[trimmed];
  if (!pageType) {
    pageType = /^\/blog\/[^/]+$/.test(trimmed) ? "blog_post" : "not_found";
  }
  return { page_type: pageType, ui_locale: locale };
}

function roundValue(name, value) {
  return name === "CLS" ? Math.round(value * 1000) / 1000 : Math.round(value);
}

/**
 * Registers the web-vitals listeners. `pageType` overrides the landing page
 * lookup; `pathname` defaults to the current location.
 */
export function initWebVitals({ pathname, pageType } = {}) {
  const landing = landingPage(pathname ?? window.location.pathname);
  if (pageType) landing.page_type = pageType;

  const send = ({ name, value, rating }) =>
    track("web_vital_reported", {
      metric: name,
      value: roundValue(name, value),
      rating,
      ...landing,
    });

  onLCP(send);
  onINP(send);
  onCLS(send);
  onFCP(send);
  onTTFB(send);
  return landing;
}
